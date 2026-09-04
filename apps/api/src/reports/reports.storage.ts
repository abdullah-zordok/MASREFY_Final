import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import type { ReportFormat } from './reports.schemas';

const KEY = /^reports\/[a-f0-9]{64}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(json|csv|pdf)$/;
const TYPES: Record<ReportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

function failure(code = 'REPORT_STORAGE_UNAVAILABLE'): Error {
  return new Error(code);
}

@Injectable()
export class ReportsStorage {
  private readonly origin: URL;
  private readonly credential: string;
  private readonly allowHttp: boolean;

  constructor(
    config: PlatformConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {
    this.origin = new URL(config.getRequired('SUPABASE_URL'));
    this.credential = config.getRequired('SUPABASE_SERVICE_ROLE_KEY');
    this.allowHttp = config.getRequired('NODE_ENV') !== 'production';
  }

  key(attemptId: string, userId: string, format: ReportFormat): string {
    const owner = createHash('sha256').update(userId).digest('hex');
    return this.valid(`reports/${owner}/${attemptId}.${format}`);
  }

  async upload(
    attemptId: string,
    userId: string,
    format: ReportFormat,
    contentType: string,
    body: NodeJS.ReadableStream,
    maximumBytes: number,
  ): Promise<{ key: string; bytes: number; sha256: string }> {
    if (contentType !== TYPES[format] || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
      throw failure('REPORT_STORAGE_INVALID');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const hash = createHash('sha256');
    // ponytail: buffering is capped by MASARIFI_REPORT_MAX_BYTES; switch to a counting Transform if the cap grows beyond worker memory budgets.
    for await (const chunk of body) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw failure('REPORT_LIMIT_EXCEEDED');
      hash.update(value);
      chunks.push(value);
    }
    const key = this.key(attemptId, userId, format);
    await this.request(key, '', {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes),
        'x-upsert': 'false',
      },
      body: Readable.from(chunks) as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit);
    return { key, bytes, sha256: hash.digest('hex') };
  }

  async verify(key: string, expectedBytes: number): Promise<void> {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1)
      throw failure('REPORT_STORAGE_INVALID');
    const response = await this.request(key, '', { method: 'HEAD' });
    if (Number(response.headers.get('content-length')) !== expectedBytes)
      throw failure('REPORT_STORAGE_INTEGRITY_FAILED');
  }

  async sign(key: string, expiresInSeconds: number): Promise<string> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 900)
      throw failure('REPORT_STORAGE_INVALID');
    const response = await this.request(key, 'sign/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    let payload: unknown;
    try { payload = await response.json(); } catch { throw failure(); }
    const candidate = payload && typeof payload === 'object' ? (payload as { signedURL?: unknown }).signedURL : undefined;
    if (typeof candidate !== 'string') throw failure();
    const signed = new URL(candidate, this.origin);
    const expected = `/storage/v1/object/sign/report-exports/${this.encoded(this.valid(key))}`;
    if (signed.origin !== this.origin.origin || signed.pathname !== expected || (!this.allowHttp && signed.protocol !== 'https:'))
      throw failure();
    return signed.toString();
  }

  async delete(key: string): Promise<void> {
    await this.request(key, '', { method: 'DELETE' }, true);
  }

  private valid(key: string): string {
    if (!KEY.test(key) || key.includes('..') || key.includes('\\') || key.includes('//'))
      throw failure('REPORT_STORAGE_INVALID');
    return key;
  }

  private encoded(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private async request(key: string, prefix: string, input: RequestInit, missingOkay = false): Promise<Response> {
    const encoded = this.encoded(this.valid(key));
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 10_000);
    const headers = new Headers(input.headers);
    headers.set('Authorization', `Bearer ${this.credential}`);
    headers.set('apikey', this.credential);
    try {
      const response = await this.fetcher(new URL(`/storage/v1/object/${prefix}report-exports/${encoded}`, this.origin), {
        ...input, headers, signal: controller.signal,
      });
      if (!response.ok && !(missingOkay && response.status === 404)) throw failure();
      return response;
    } catch (error) {
      if (error instanceof Error && ['REPORT_STORAGE_INVALID','REPORT_STORAGE_INTEGRITY_FAILED','REPORT_LIMIT_EXCEEDED'].includes(error.message)) throw error;
      throw failure();
    } finally {
      clearTimeout(timeout);
    }
  }
}
