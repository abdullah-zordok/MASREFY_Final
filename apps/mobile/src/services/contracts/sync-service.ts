export type SyncDomain = 'accounts' | 'categories' | 'transactions';

export interface SyncMutation {
  operationId: string;
  domain: SyncDomain;
  resourceType: 'account' | 'category' | 'transaction';
  schemaVersion: 1;
  dependsOn: string[];
  operation: 'create' | 'update' | 'archive' | 'restore' | 'delete';
  resourceId?: string;
  baseVersion?: number;
  payload: Record<string, unknown>;
}

export class SyncServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds?: number
  ) {
    super(code);
  }
}

export class SyncHttpService {
  constructor(
    private readonly baseUrl: string,
    private readonly token: () => Promise<string>,
    private readonly deviceId: () => Promise<string>,
    private readonly request: typeof fetch = fetch
  ) {}

  bootstrap(domains?: SyncDomain[], after?: string, limit = 500) {
    const query = new URLSearchParams();
    if (domains?.length) query.set('domains', domains.join(','));
    if (after) query.set('after', after);
    query.set('limit', String(limit));
    return this.send('GET', `/api/v1/sync/bootstrap?${query.toString()}`);
  }

  delta(domain: SyncDomain, cursor: string, limit = 500) {
    const query = new URLSearchParams({ domain, cursor, limit: String(limit) });
    return this.send('GET', `/api/v1/sync/delta?${query.toString()}`);
  }

  mutations(mutations: SyncMutation[], idempotencyKey: string) {
    return this.send(
      'POST',
      '/api/v1/sync/mutations',
      { mutations },
      idempotencyKey
    );
  }

  acknowledge(domain: SyncDomain, cursor: string, lastMutationId?: string) {
    return this.send('POST', '/api/v1/sync/ack', {
      domain,
      cursor,
      lastMutationId
    });
  }

  conflicts(status = 'open', after?: string, limit = 50) {
    const query = new URLSearchParams({ status, limit: String(limit) });
    if (after) query.set('after', after);
    return this.send('GET', `/api/v1/conflicts?${query.toString()}`);
  }

  conflict(conflictId: string) {
    return this.send(
      'GET',
      `/api/v1/conflicts/${encodeURIComponent(conflictId)}`
    );
  }

  resolveConflict(
    conflictId: string,
    resolution: 'server' | 'client' | 'merged' | 'duplicate',
    idempotencyKey: string,
    payload?: Record<string, unknown>
  ) {
    return this.send(
      'PATCH',
      `/api/v1/conflicts/${encodeURIComponent(conflictId)}`,
      { resolution, payload },
      idempotencyKey
    );
  }

  private async send(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    const encoded = body ? JSON.stringify(body) : undefined;
    if (encoded && new TextEncoder().encode(encoded).byteLength > 524_288)
      throw new SyncServiceError('SYNC_PAYLOAD_TOO_LARGE', 413);
    const response = await this.request(
      `${this.baseUrl.replace(/\/$/, '')}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'X-Device-Id': await this.deviceId(),
          ...(encoded ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: encoded
      }
    );
    const value: unknown = await response.json();
    if (!response.ok) {
      const error = this.record(value);
      const nested = this.record(error.error, false);
      const code =
        this.string(error.code ?? nested.code) ?? 'SYNC_REQUEST_FAILED';
      const retry = Number(error.retryAfterSeconds ?? nested.retryAfterSeconds);
      throw new SyncServiceError(
        code,
        response.status,
        Number.isFinite(retry) && retry > 0 ? retry : undefined
      );
    }
    return this.record(value);
  }

  private record(value: unknown, required = true): Record<string, unknown> {
    if (value !== null && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>;
    if (required) throw new SyncServiceError('SYNC_RESPONSE_INVALID', 502);
    return {};
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
