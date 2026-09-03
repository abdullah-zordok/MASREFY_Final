import { Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';

const KEY = /^voice\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/u;

@Injectable()
export class AiStorage {
  private readonly origin: URL;
  private readonly credential: string;

  constructor(
    config: PlatformConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = new URL(config.getRequired('SUPABASE_URL'));
    this.credential = config.getRequired('SUPABASE_SERVICE_ROLE_KEY');
  }

  async signedUpload(
    key: string,
    seconds: number,
    contentType: string,
  ): Promise<{ url: string; token: string; expiresAt: string; headers: Record<string, string> }> {
    const result = await this.request(
      `/storage/v1/object/upload/sign/voice-temp/${this.encoded(key)}`,
      { method: 'POST', body: JSON.stringify({ upsert: false }) },
    );
    const value = (await result.json()) as { url?: unknown; token?: unknown };
    if (
      typeof value.url !== 'string' ||
      typeof value.token !== 'string' ||
      value.token.length < 16 ||
      value.token.length > 4096
    )
      throw new Error('VOICE_STORAGE_UNAVAILABLE');
    const url = new URL(value.url, this.origin);
    if (url.origin !== this.origin.origin) throw new Error('VOICE_STORAGE_UNAVAILABLE');
    return {
      url: url.toString(),
      token: value.token,
      expiresAt: new Date(Date.now() + seconds * 1_000).toISOString(),
      headers: { 'content-type': contentType },
    };
  }

  async download(key: string, expectedBytes: number): Promise<Buffer> {
    if (!Number.isInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > 12_582_912)
      throw new Error('VOICE_MEDIA_INVALID');
    const response = await this.request(
      `/storage/v1/object/authenticated/voice-temp/${this.encoded(key)}`,
    );
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length !== expectedBytes) throw new Error('VOICE_MEDIA_INVALID');
    if (!response.body) throw new Error('VOICE_MEDIA_INVALID');
    const reader = response.body.getReader(),
      chunks: Buffer[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedBytes) {
        await reader.cancel();
        throw new Error('VOICE_MEDIA_INVALID');
      }
      chunks.push(Buffer.from(value));
    }
    const body = Buffer.concat(chunks, received);
    if (body.length !== expectedBytes) throw new Error('VOICE_MEDIA_INVALID');
    return body;
  }

  async delete(key: string): Promise<void> {
    await this.request(
      `/storage/v1/object/voice-temp/${this.encoded(key)}`,
      { method: 'DELETE' },
      true,
    );
  }

  private encoded(key: string): string {
    if (!KEY.test(key)) throw new Error('VOICE_STORAGE_INVALID');
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private async request(
    path: string,
    init: RequestInit = {},
    allowMissing = false,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.credential}`);
    headers.set('apikey', this.credential);
    if (init.body) headers.set('content-type', 'application/json');
    try {
      const response = await this.fetcher(new URL(path, this.origin), {
        ...init,
        headers,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok && !(allowMissing && response.status === 404))
        throw new Error('VOICE_STORAGE_UNAVAILABLE');
      return response;
    } catch (error) {
      if (
        error instanceof Error &&
        /VOICE_STORAGE_(?:INVALID|UNAVAILABLE)|VOICE_MEDIA_INVALID/.test(error.message)
      )
        throw error;
      throw new Error('VOICE_STORAGE_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}
