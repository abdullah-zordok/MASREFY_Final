import { HttpException } from '@nestjs/common';

import {
  SYNC_DOMAINS,
  SYNC_OPERATIONS,
  SYNC_RESOURCE_TYPES,
  isSyncDomain,
  type SyncDomain,
  type SyncMutation,
  type SyncOperation,
  type SyncResourceType,
} from './sync.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex -- identifiers are external input
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const MAX_PAYLOAD_BYTES = 524_288;

function invalid(): never {
  const error = new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  error.message = 'VALIDATION_FAILED';
  throw error;
}

function record(value: unknown): Record<string, unknown> {
  const prototype: unknown =
    value === null || typeof value !== 'object'
      ? undefined
      : (Object.getPrototypeOf(value) as unknown);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  )
    invalid();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid();
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) invalid();
  return normalized;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  const normalized = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (
    typeof normalized !== 'number' ||
    !Number.isSafeInteger(normalized) ||
    normalized < minimum ||
    normalized > maximum
  )
    invalid();
  return normalized;
}

function domain(value: unknown): SyncDomain {
  if (!isSyncDomain(value)) invalid();
  return value;
}

function operation(value: unknown): SyncOperation {
  if (typeof value !== 'string' || !(SYNC_OPERATIONS as readonly string[]).includes(value))
    invalid();
  return value as SyncOperation;
}

function jsonObject(value: unknown): Record<string, unknown> {
  const normalized = record(value);
  try {
    if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_PAYLOAD_BYTES) invalid();
  } catch {
    invalid();
  }
  return normalized;
}

export function normalizeDeviceId(value: unknown): string {
  const normalized = text(value, 36);
  if (!UUID.test(normalized)) invalid();
  return normalized.toLowerCase();
}

export function normalizeBootstrapQuery(value: unknown): {
  domains: SyncDomain[];
  after: string | null;
  limit: number;
} {
  const input = record(value);
  exact(input, ['domains', 'after', 'limit']);
  const raw = input.domains;
  const after = input.after === undefined ? null : text(input.after, 1024);
  const limit = input.limit === undefined ? 500 : integer(input.limit, 1, 500);
  if (raw === undefined || raw === '') {
    if (after !== null) invalid();
    return { domains: [...SYNC_DOMAINS], after, limit };
  }
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : invalid();
  const domains = [...new Set(values.map((item) => domain(text(item, 32))))].sort();
  if (
    domains.length < 1 ||
    domains.length > SYNC_DOMAINS.length ||
    (after !== null && domains.length !== 1)
  )
    invalid();
  return { domains, after, limit };
}

function resourceType(value: unknown): SyncResourceType {
  if (typeof value !== 'string' || !(SYNC_RESOURCE_TYPES as readonly string[]).includes(value))
    invalid();
  return value as SyncResourceType;
}

export function normalizeDeltaQuery(value: unknown): {
  domain: SyncDomain;
  cursor: string;
  limit: number;
} {
  const input = record(value);
  exact(input, ['domain', 'cursor', 'limit']);
  return {
    domain: domain(input.domain),
    cursor: text(input.cursor, 256),
    limit: input.limit === undefined ? 500 : integer(input.limit, 1, 500),
  };
}

export function normalizeAckRequest(value: unknown): {
  domain: SyncDomain;
  cursor: string;
  lastMutationId: string | null;
} {
  const input = record(value);
  exact(input, ['domain', 'cursor', 'lastMutationId']);
  if (
    input.lastMutationId !== undefined &&
    (typeof input.lastMutationId !== 'string' || !UUID.test(input.lastMutationId))
  )
    invalid();
  return {
    domain: domain(input.domain),
    cursor: text(input.cursor, 256),
    lastMutationId: input.lastMutationId ?? null,
  };
}

export function normalizeMutationBatch(value: unknown): {
  mutations: SyncMutation[];
  executionOrder: SyncMutation[];
} {
  const input = record(value);
  exact(input, ['mutations']);
  if (!Array.isArray(input.mutations) || input.mutations.length < 1 || input.mutations.length > 100)
    invalid();
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_PAYLOAD_BYTES) invalid();
  const mutations = input.mutations.map((candidate) => {
    const mutation = record(candidate);
    exact(mutation, [
      'operationId',
      'domain',
      'resourceType',
      'schemaVersion',
      'dependsOn',
      'operation',
      'resourceId',
      'baseVersion',
      'payload',
    ]);
    if (typeof mutation.operationId !== 'string' || !UUID.test(mutation.operationId)) invalid();
    const normalizedDomain = domain(mutation.domain);
    const normalizedResourceType = resourceType(mutation.resourceType);
    const expectedResourceType: Record<SyncDomain, SyncResourceType> = {
      accounts: 'account',
      categories: 'category',
      transactions: 'transaction',
      planning: normalizedResourceType,
    };
    if (
      normalizedDomain === 'planning' &&
      !SYNC_RESOURCE_TYPES.slice(3).includes(normalizedResourceType)
    )
      invalid();
    if (
      normalizedDomain !== 'planning' &&
      normalizedResourceType !== expectedResourceType[normalizedDomain]
    )
      invalid();
    if (mutation.schemaVersion !== 1) invalid();
    const rawDependencies = mutation.dependsOn ?? [];
    if (!Array.isArray(rawDependencies) || rawDependencies.length > 100) invalid();
    const dependsOn = rawDependencies.map((dependency) => {
      if (typeof dependency !== 'string' || !UUID.test(dependency)) invalid();
      return dependency.toLowerCase();
    });
    if (new Set(dependsOn).size !== dependsOn.length) invalid();
    const resourceId = mutation.resourceId === undefined ? null : text(mutation.resourceId, 128);
    const baseVersion =
      mutation.baseVersion === undefined
        ? null
        : integer(mutation.baseVersion, 0, Number.MAX_SAFE_INTEGER);
    return {
      operationId: mutation.operationId.toLowerCase(),
      domain: normalizedDomain,
      resourceType: normalizedResourceType,
      schemaVersion: 1 as const,
      dependsOn,
      operation: operation(mutation.operation),
      resourceId,
      baseVersion,
      payload: jsonObject(mutation.payload),
    };
  });
  const byId = new Map(mutations.map((mutation) => [mutation.operationId, mutation]));
  if (byId.size !== mutations.length) invalid();
  for (const mutation of mutations)
    if (
      mutation.dependsOn.some(
        (dependency) => dependency === mutation.operationId || !byId.has(dependency),
      )
    )
      invalid();
  const executionOrder: SyncMutation[] = [];
  const pending = new Set(mutations.map(({ operationId }) => operationId));
  while (pending.size > 0) {
    const ready = mutations.filter(
      ({ operationId, dependsOn }) =>
        pending.has(operationId) && dependsOn.every((dependency) => !pending.has(dependency)),
    );
    if (ready.length === 0) invalid();
    for (const mutation of ready) {
      pending.delete(mutation.operationId);
      executionOrder.push(mutation);
    }
  }
  return { mutations, executionOrder };
}

export function normalizeConflictListQuery(value: unknown): {
  status: 'open' | 'resolved' | 'rejected';
  after: string | null;
  limit: number;
} {
  const input = record(value);
  exact(input, ['status', 'after', 'limit']);
  const status = input.status ?? 'open';
  if (typeof status !== 'string' || !['open', 'resolved', 'rejected'].includes(status)) invalid();
  return {
    status: status as 'open' | 'resolved' | 'rejected',
    after: input.after === undefined ? null : text(input.after, 256),
    limit: input.limit === undefined ? 50 : integer(input.limit, 1, 100),
  };
}

export function normalizeResolutionRequest(value: unknown): {
  resolution: 'server' | 'client' | 'merged' | 'duplicate';
  payload: Record<string, unknown> | null;
} {
  const input = record(value);
  exact(input, ['resolution', 'payload']);
  if (!['server', 'client', 'merged', 'duplicate'].includes(String(input.resolution))) invalid();
  const resolution = input.resolution as 'server' | 'client' | 'merged' | 'duplicate';
  const payload = input.payload === undefined ? null : jsonObject(input.payload);
  if ((resolution === 'merged' || resolution === 'client') !== (payload !== null)) invalid();
  return { resolution, payload };
}
