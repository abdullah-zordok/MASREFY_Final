import { Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';

const KEY = /^tracking\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

@Injectable()
export class TrackingStorage {
  private readonly origin: URL;
  private readonly credential: string;

  constructor(
    config: PlatformConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = new URL(config.getRequired('SUPABASE_URL'));
    this.credential = config.getRequired('SUPABASE_SERVICE_ROLE_KEY');
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: 'text/csv' | 'application/json',
  ): Promise<boolean> {
    const status = await this.request(key, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'x-upsert': 'false',
      },
      body: body as unknown as BodyInit,
    });
    return status !== 409;
  }

  async delete(key: string): Promise<void> {
    await this.request(key, { method: 'DELETE' });
  }

  private async request(key: string, input: RequestInit): Promise<number> {
    if (!KEY.test(key)) throw new Error('TRACKING_STORAGE_INVALID');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${this.credential}`);
    headers.set('apikey', this.credential);
    try {
      const encoded = key.split('/').map(encodeURIComponent).join('/');
      const response = await this.fetcher(
        new URL(`/storage/v1/object/tracking-imports/${encoded}`, this.origin),
        { ...input, headers, signal: controller.signal },
      );
      if (
        !response.ok &&
        !(input.method === 'PUT' && response.status === 409) &&
        !(input.method === 'DELETE' && response.status === 404)
      )
        throw new Error('TRACKING_STORAGE_UNAVAILABLE');
      return response.status;
    } catch (error) {
      if (error instanceof Error && error.message === 'TRACKING_STORAGE_INVALID') throw error;
      throw new Error('TRACKING_STORAGE_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}
