import { createHash } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';

const KEY = /^support\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

@Injectable()
export class SupportStorage {
  private readonly origin: URL;
  private readonly credential: string;
  private readonly ttl: number;

  constructor(
    config: PlatformConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = new URL(config.getRequired('SUPABASE_URL'));
    this.credential = config.getRequired('SUPABASE_SERVICE_ROLE_KEY');
    this.ttl = config.getRequired('MASARIFI_SUPPORT_SIGNED_URL_SECONDS');
  }

  async signUpload(
    key: string,
    contentType: string,
    sha256: string,
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: string }> {
    if (
      !['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(contentType) ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      throw new Error('SUPPORT_STORAGE_INVALID');
    const response = await this.request(
      `/storage/v1/object/upload/sign/support-attachments/${this.encoded(key)}`,
      { method: 'POST' },
    );
    const value = (await response.json()) as { url?: unknown };
    if (typeof value.url !== 'string') throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
    const url = new URL(value.url, this.origin);
    if (
      url.origin !== this.origin.origin ||
      !url.pathname.startsWith('/storage/v1/object/upload/sign/support-attachments/')
    )
      throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
    return {
      url: url.toString(),
      headers: { 'content-type': contentType, 'x-content-sha256': sha256 },
      expiresAt: new Date(Date.now() + this.ttl * 1_000).toISOString(),
    };
  }

  async signDownload(key: string): Promise<{ url: string; expiresAt: string }> {
    const response = await this.request(
      `/storage/v1/object/sign/support-attachments/${this.encoded(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: this.ttl }),
      },
    );
    const value = (await response.json()) as { signedURL?: unknown };
    if (typeof value.signedURL !== 'string') throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
    const url = new URL(value.signedURL, this.origin);
    if (
      url.origin !== this.origin.origin ||
      !url.pathname.startsWith('/storage/v1/object/sign/support-attachments/')
    )
      throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
    return {
      url: url.toString(),
      expiresAt: new Date(Date.now() + this.ttl * 1_000).toISOString(),
    };
  }

  async read(key: string): Promise<Buffer> {
    const response = await this.request(
      `/storage/v1/object/authenticated/support-attachments/${this.encoded(key)}`,
    );
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 1 || body.length > 10_485_760) throw new Error('SUPPORT_STORAGE_INVALID');
    return body;
  }

  async verify(key: string, sizeBytes: number, contentType: string, sha256: string): Promise<void> {
    const response = await this.request(
      `/storage/v1/object/authenticated/support-attachments/${this.encoded(key)}`,
      { method: 'HEAD' },
    );
    const content = await this.read(key);
    if (
      Number(response.headers.get('content-length')) !== sizeBytes ||
      response.headers.get('content-type')?.split(';')[0] !== contentType ||
      content.length !== sizeBytes ||
      createHash('sha256').update(content).digest('hex') !== sha256
    )
      throw new Error('SUPPORT_STORAGE_METADATA_MISMATCH');
  }

  async delete(key: string): Promise<void> {
    await this.request(
      `/storage/v1/object/support-attachments/${this.encoded(key)}`,
      { method: 'DELETE' },
      true,
    );
  }

  private encoded(key: string): string {
    if (!KEY.test(key)) throw new Error('SUPPORT_STORAGE_INVALID');
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private async request(
    path: string,
    input: RequestInit = {},
    allowMissing = false,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${this.credential}`);
    headers.set('apikey', this.credential);
    try {
      const response = await this.fetcher(new URL(path, this.origin), {
        ...input,
        headers,
        signal: controller.signal,
      });
      if (!response.ok && !(allowMissing && response.status === 404))
        throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
      return response;
    } catch (error) {
      if (error instanceof Error && error.message === 'SUPPORT_STORAGE_INVALID') throw error;
      throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}
