import { HttpException, Injectable, Logger } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import {
  decodeBootstrapCursor,
  decodeSyncCursor,
  encodeBootstrapCursor,
  encodeSyncCursor,
  hashSyncMutation,
} from './sync.codec';
import {
  normalizeAckRequest,
  normalizeBootstrapQuery,
  normalizeConflictListQuery,
  normalizeDeltaQuery,
  normalizeMutationBatch,
  normalizeResolutionRequest,
} from './sync.dto';
import { logSyncEvent, recordSyncCursorLag, recordSyncMutation } from './sync.observability';
import { SyncRepository, type BatchCompletion, type MutationReceipt } from './sync.repository';

interface MutationResponse extends Record<string, unknown> {
  data: {
    receipts: Array<{
      operationId: string;
      status: MutationReceipt['status'];
      result?: Record<string, unknown>;
      error?: Record<string, unknown>;
    }>;
  };
  meta: { requestId: string };
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly repository: SyncRepository,
    private readonly config: PlatformConfigService,
  ) {}

  async bootstrap(
    principal: ClerkPrincipal,
    deviceId: string,
    query: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const input = normalizeBootstrapQuery(query);
    await this.authorize(principal, deviceId);
    const scope = { userId: principal.userId, deviceId };
    const key = this.config.getRequired('MASARIFI_PUSH_TOKEN_HASH_KEY');
    const domain = input.domains[0];
    if (!domain) throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    const continuation =
      input.after === null ? null : decodeBootstrapCursor(input.after, domain, scope, key);
    const snapshots = await this.repository.bootstrap(
      principal,
      input.domains,
      continuation?.after ?? null,
      input.limit,
      continuation?.position ?? null,
    );
    const response = {
      data: {
        domains: snapshots.map(({ domain, position, items, hasMore }) => {
          const after = items.at(-1)?.id;
          return {
            domain,
            cursor: encodeSyncCursor({ domain, position }, scope, key),
            items: items.map(({ snapshot }) => snapshot),
            hasMore,
            nextPage:
              hasMore && after
                ? encodeBootstrapCursor({ domain, position, after }, scope, key)
                : null,
          };
        }),
      },
      meta: { requestId },
    };
    if (
      Buffer.byteLength(JSON.stringify(response)) >
      this.config.getRequired('MASARIFI_SYNC_PAYLOAD_LIMIT_BYTES')
    )
      throw new HttpException({ code: 'SYNC_PAYLOAD_TOO_LARGE' }, 413);
    await Promise.all(
      snapshots
        .filter(({ hasMore }) => !hasMore)
        .map(({ domain, position }) =>
          this.repository.recordIssuedCursor(principal, deviceId, domain, position),
        ),
    );
    return response;
  }

  async delta(
    principal: ClerkPrincipal,
    deviceId: string,
    query: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const input = normalizeDeltaQuery(query);
    await this.authorize(principal, deviceId);
    const scope = { userId: principal.userId, deviceId };
    const key = this.config.getRequired('MASARIFI_PUSH_TOKEN_HASH_KEY');
    const cursor = decodeSyncCursor(input.cursor, input.domain, scope, key);
    const limit = Math.min(input.limit, this.config.getRequired('MASARIFI_SYNC_DELTA_LIMIT'));
    const page = await this.repository.delta(principal, input.domain, cursor.position, limit);
    if (cursor.position > page.current) throw new HttpException({ code: 'SYNC_CURSOR_AHEAD' }, 409);
    if (cursor.position > 0n && page.oldest > cursor.position + 1n)
      throw new HttpException({ code: 'SYNC_CURSOR_EXPIRED' }, 409);
    const changes: Record<string, unknown>[] = [];
    let next = cursor.position;
    for (const change of page.changes.slice(0, limit)) {
      const item = {
        cursor: encodeSyncCursor({ domain: input.domain, position: change.position }, scope, key),
        resourceId: change.resourceId,
        resourceType: change.resourceType,
        operation: change.operation,
        version: change.version,
        ...(change.snapshot ? { snapshot: change.snapshot } : {}),
        deletedAt: change.deletedAt,
      };
      if (
        Buffer.byteLength(JSON.stringify({ data: { changes: [...changes, item] } })) >
        this.config.getRequired('MASARIFI_SYNC_PAYLOAD_LIMIT_BYTES')
      )
        break;
      changes.push(item);
      next = change.position;
    }
    if (changes.length === 0 && page.changes.length > 0)
      throw new HttpException({ code: 'SYNC_PAYLOAD_TOO_LARGE' }, 413);
    await this.repository.recordIssuedCursor(principal, deviceId, input.domain, next);
    recordSyncCursorLag(input.domain, Number(page.current - next));
    return {
      data: {
        domain: input.domain,
        changes,
        nextCursor: encodeSyncCursor({ domain: input.domain, position: next }, scope, key),
        hasMore: next < page.current,
      },
      meta: { requestId },
    };
  }

  async acknowledge(
    principal: ClerkPrincipal,
    deviceId: string,
    body: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const input = normalizeAckRequest(body);
    await this.authorize(principal, deviceId);
    const scope = { userId: principal.userId, deviceId };
    const key = this.config.getRequired('MASARIFI_PUSH_TOKEN_HASH_KEY');
    const cursor = decodeSyncCursor(input.cursor, input.domain, scope, key);
    const result = await this.expected(() =>
      this.repository.acknowledge(
        principal,
        deviceId,
        input.domain,
        cursor.position,
        input.lastMutationId,
      ),
    );
    return {
      data: {
        domain: input.domain,
        cursor: encodeSyncCursor({ domain: input.domain, position: result.position }, scope, key),
        acknowledgedAt: result.acknowledgedAt,
      },
      meta: { requestId },
    };
  }

  async listConflicts(
    principal: ClerkPrincipal,
    deviceId: string,
    query: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const input = normalizeConflictListQuery(query);
    await this.authorize(principal, deviceId);
    const after = input.after === null ? null : this.decodeConflictCursor(input.after);
    const rows = await this.repository.listConflicts(principal, input.status, after, input.limit);
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      data: {
        items,
        nextCursor:
          rows.length > input.limit && last
            ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString('base64url')
            : null,
      },
      meta: { requestId },
    };
  }

  async getConflict(
    principal: ClerkPrincipal,
    deviceId: string,
    conflictId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    this.assertUuid(conflictId);
    await this.authorize(principal, deviceId);
    const conflict = await this.repository.getConflict(principal, conflictId);
    if (!conflict) throw new HttpException({ code: 'SYNC_CONFLICT_NOT_FOUND' }, 404);
    return { data: conflict, meta: { requestId } };
  }

  async resolveConflict(
    principal: ClerkPrincipal,
    deviceId: string,
    conflictId: string,
    idempotencyKey: string,
    body: unknown,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    this.assertUuid(conflictId);
    let keyHash: string;
    try {
      keyHash = hashIdempotencyKey(idempotencyKey);
    } catch {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }
    const input = normalizeResolutionRequest(body);
    await this.authorize(principal, deviceId);
    const requestHash = hashNormalizedCommand({ conflictId, ...input });
    const resolved = await this.expected(() =>
      this.repository.resolveConflict(
        principal,
        conflictId,
        input.resolution,
        input.payload,
        requestId,
        keyHash,
        requestHash,
      ),
    );
    return { data: resolved, meta: { requestId } };
  }

  private assertUuid(value: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  }

  private decodeConflictCursor(value: string): { createdAt: string; id: string } {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      if (Buffer.from(decoded).toString('base64url') !== value) throw new Error();
      const parsed: unknown = JSON.parse(decoded);
      if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error();
      const tuple = parsed as unknown[];
      const createdAt = tuple[0],
        id = tuple[1];
      if (
        typeof createdAt !== 'string' ||
        new Date(createdAt).toISOString() !== createdAt ||
        typeof id !== 'string'
      )
        throw new Error();
      this.assertUuid(id);
      return { createdAt, id };
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }

  private async expected<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : '';
      const statuses: Record<string, number> = {
        SYNC_CURSOR_AHEAD: 409,
        SYNC_CURSOR_NOT_ISSUED: 409,
        SYNC_MUTATION_NOT_FOUND: 404,
        DEVICE_NOT_FOUND: 404,
        SYNC_CONFLICT_NOT_FOUND: 404,
        SYNC_CONFLICT_ALREADY_RESOLVED: 409,
      };
      for (const [code, status] of Object.entries(statuses))
        if (message.includes(code)) throw new HttpException({ code }, status);
      throw error;
    }
  }

  private authorize(principal: ClerkPrincipal, deviceId: string): Promise<void> {
    return this.expected(() => this.repository.assertActiveDevice(principal, deviceId));
  }

  async submitMutations(
    principal: ClerkPrincipal,
    deviceId: string,
    idempotencyKey: string,
    body: unknown,
    requestId: string,
  ): Promise<MutationResponse> {
    const batch = normalizeMutationBatch(body);
    await this.authorize(principal, deviceId);
    let keyHash: string, requestHash: string;
    try {
      keyHash = hashIdempotencyKey(idempotencyKey);
      requestHash = hashNormalizedCommand({ deviceId, mutations: batch.mutations });
    } catch {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }
    const claim = await this.repository.claimBatch(
      principal,
      keyHash,
      requestHash,
      this.config.getRequired('MASARIFI_SYNC_LEASE_SECONDS'),
    );
    if (claim.outcome === 'hash_mismatch')
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409);
    if (claim.outcome === 'in_progress')
      throw new HttpException(
        { code: 'IDEMPOTENCY_IN_PROGRESS', retryAfterSeconds: claim.retryAfterSeconds ?? 1 },
        409,
      );
    if (claim.outcome === 'replay') {
      if ((claim.responseStatus ?? 200) >= 400)
        throw new HttpException(
          claim.responseBody ?? { code: 'SYNC_REPLAY_FAILED' },
          claim.responseStatus ?? 409,
        );
      return claim.responseBody as unknown as MutationResponse;
    }
    if (!claim.leaseToken) throw new Error('SYNC_IDEMPOTENCY_LEASE_MISSING');

    const receiptsByOperation = new Map<string, MutationResponse['data']['receipts'][number]>();
    for (const mutation of batch.executionOrder) {
      const receipt = await this.repository.receiveMutation(
        principal,
        deviceId,
        mutation,
        hashSyncMutation(mutation),
      );
      recordSyncMutation(receipt.outcome, mutation.domain);
      logSyncEvent(this.logger, 'mutation.received', {
        outcome: receipt.outcome,
        domain: mutation.domain,
        status: receipt.status,
        requestId,
      });
      if (receipt.outcome === 'hash_mismatch') {
        const error = { code: 'SYNC_OPERATION_ID_REUSED' };
        receiptsByOperation.set(mutation.operationId, {
          operationId: mutation.operationId,
          status: 'rejected' as const,
          error,
        });
        continue;
      }
      receiptsByOperation.set(mutation.operationId, {
        operationId: mutation.operationId,
        status: receipt.status,
        ...(receipt.result ? { result: receipt.result } : {}),
        ...(receipt.error ? { error: receipt.error } : {}),
      });
    }
    const receipts = batch.mutations.map((mutation) => {
      const receipt = receiptsByOperation.get(mutation.operationId);
      if (!receipt) throw new Error('SYNC_RECEIPT_MISSING');
      return receipt;
    });
    const response: MutationResponse = { data: { receipts }, meta: { requestId } };
    const completion: BatchCompletion = { keyHash, requestHash, leaseToken: claim.leaseToken };
    await this.repository.completeBatch(principal, completion, 200, response);
    return response;
  }
}
