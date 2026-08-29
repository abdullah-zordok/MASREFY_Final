import { Injectable, Optional } from '@nestjs/common';
import type { Readable } from 'node:stream';

import { PlatformConfigService } from '../platform/config/platform-config.service';

const keyPattern = /^exports\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9._/-]{1,256}\.zip$/;

function storageError(code = 'EXPORT_STORAGE_UNAVAILABLE'): Error {
  return new Error(code);
}

@Injectable()
export class ExportStorage {
  private readonly origin: URL;
  private readonly credential: string;

  constructor(
    config: PlatformConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = new URL(config.getRequired('SUPABASE_URL'));
    this.credential = config.getRequired('SUPABASE_SERVICE_ROLE_KEY');
  }

  async upload(key: string, body: Readable, bytes?: number): Promise<void> {
    if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 1))
      throw storageError('EXPORT_STORAGE_INVALID');
    await this.request(key, '', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        ...(bytes === undefined ? {} : { 'Content-Length': String(bytes) }),
        'x-upsert': 'false',
      },
      body: body as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit);
  }

  async head(key: string, expectedBytes: number): Promise<{ bytes: number; etag: string | null }> {
    const response = await this.request(key, '', { method: 'HEAD' });
    const bytes = Number(response.headers.get('content-length'));
    if (!Number.isSafeInteger(bytes) || bytes !== expectedBytes) {
      throw storageError('EXPORT_STORAGE_INTEGRITY_FAILED');
    }
    return { bytes, etag: response.headers.get('etag')?.replace(/^"|"$/g, '') ?? null };
  }

  async sign(key: string, expiresInSeconds: number): Promise<string> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 900) {
      throw storageError('EXPORT_STORAGE_INVALID');
    }
    const response = await this.request(key, 'sign/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw storageError();
    }
    const signedUrl =
      typeof value === 'object' && value !== null
        ? (value as { signedURL?: unknown }).signedURL
        : undefined;
    if (typeof signedUrl !== 'string') {
      throw storageError();
    }
    const signed = new URL(signedUrl, this.origin);
    const expectedPath = `/storage/v1/object/sign/report-exports/${key.split('/').map(encodeURIComponent).join('/')}`;
    if (signed.origin !== this.origin.origin || signed.pathname !== expectedPath)
      throw storageError();
    return signed.toString();
  }

  async delete(key: string): Promise<void> {
    await this.request(key, '', { method: 'DELETE' });
  }

  private async request(key: string, prefix: string, input: RequestInit): Promise<Response> {
    if (!keyPattern.test(key) || key.includes('..') || key.includes('//') || key.includes('\\')) {
      throw storageError('EXPORT_STORAGE_INVALID');
    }
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${this.credential}`);
    headers.set('apikey', this.credential);
    try {
      const response = await this.fetcher(
        new URL(`/storage/v1/object/${prefix}report-exports/${encoded}`, this.origin),
        {
          ...input,
          signal: controller.signal,
          headers,
        },
      );
      if (!response.ok) throw storageError();
      return response;
    } catch (error) {
      if (
        error instanceof Error &&
        ['EXPORT_STORAGE_INVALID', 'EXPORT_STORAGE_INTEGRITY_FAILED'].includes(error.message)
      )
        throw error;
      throw storageError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
