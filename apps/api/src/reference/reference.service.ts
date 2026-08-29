import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import {
  recordPlatformMetric,
  REFERENCE_METRICS,
} from '../platform/observability/platform-metrics';
import {
  assertIdempotencyKey,
  boundedLimit,
  cursorOffset,
  expectedVersion,
  isCurrency,
  isIsoDate,
  isUuid,
  normalizeAccountPatch,
  normalizeCategoryPatch,
  normalizeCreateAccount,
  normalizeCreateCategory,
  normalizeReason,
  normalizeVersionBody,
} from './reference.dto';
import { ReferenceRepository, type ReferenceOperation } from './reference.repository';

export interface ReferenceRequest {
  operation: string;
  principal: ClerkPrincipal;
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
  requestId: string;
  idempotencyKey?: string;
  permission?: 'reference.read' | 'reference.write';
}
type CacheEntry = { hash: string; expiresAt: number; items: unknown[] };
type CategoryItem = { id: string; kind: string; sortOrder: number } & Record<string, unknown>;

const readOperations = new Set([
  'listCurrencies',
  'listCountries',
  'listCategories',
  'listAccounts',
  'getAccount',
  'getExchangeRate',
  'listAdminCurrencies',
  'listAdminCountries',
  'listAdminSystemCategories',
  'listAdminExchangeRates',
]);
const kinds = new Set(['income', 'expense', 'transfer']);
const statuses = new Set(['active', 'archived', 'closed']);
const errorStatuses: Readonly<Record<string, number>> = Object.freeze({
  AUTH_TOKEN_INVALID: 401,
  PROFILE_INACTIVE: 403,
  ADMIN_PERMISSION_DENIED: 403,
  RECENT_AUTH_REQUIRED: 403,
  NOT_FOUND: 404,
  CATEGORY_INVALID: 409,
  CATEGORY_CYCLE: 409,
  ACCOUNT_CURRENCY_LOCKED: 409,
  ACCOUNT_CLOSED: 409,
  VERSION_CONFLICT: 409,
  DUPLICATE_RESOURCE: 409,
  LEDGER_NOT_AVAILABLE: 409,
  FX_UNAVAILABLE: 404,
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  INVALID_CURRENCY: 400,
});
function fail(code: string, status: number): never {
  throw new HttpException({ code }, status);
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail('VALIDATION_FAILED', 400);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail('VALIDATION_FAILED', 400);
}
function bool(value: unknown, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  fail('VALIDATION_FAILED', 400);
}
function text(value: unknown, maximum: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') fail('VALIDATION_FAILED', 400);
  const normalized = value.trim();
  // eslint-disable-next-line no-control-regex -- reject unsafe trust-boundary text
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized))
    fail('VALIDATION_FAILED', 400);
  return normalized;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    fail('VALIDATION_FAILED', 400);
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('VALIDATION_FAILED', 400);
  return value;
}
function queryVersion(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) fail('VALIDATION_FAILED', 400);
  return expectedVersion(Number(value));
}
function categoryItem(value: unknown): value is CategoryItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    isUuid(Reflect.get(value, 'id')) &&
    typeof Reflect.get(value, 'kind') === 'string' &&
    Number.isInteger(Reflect.get(value, 'sortOrder'))
  );
}
function responseCount(response: unknown): number {
  if (Array.isArray(response)) return response.length;
  if (typeof response !== 'object' || response === null) return 0;
  const items = (response as Record<string, unknown>).items;
  return Array.isArray(items) ? items.length : 1;
}
function metricReason(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object') {
      const code = (response as Record<string, unknown>).code;
      if (typeof code === 'string' && errorStatuses[code] !== undefined) return code;
    }
  }
  const message = error instanceof Error ? error.message : '';
  return Object.keys(errorStatuses).find((code) => message.includes(code)) ?? 'unavailable';
}
function categoryCursor(value: unknown): { sort: number | null; id: string | null } {
  if (value === undefined) return { sort: null, id: null };
  if (typeof value !== 'string' || value.length > 512) fail('VALIDATION_FAILED', 400);
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== value) throw new Error();
    const parsed: unknown = JSON.parse(decoded) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      !Number.isInteger(parsed[0]) ||
      !isUuid(parsed[1])
    )
      throw new Error();
    const tuple = parsed as unknown[];
    const sort = tuple[0],
      id = tuple[1];
    if (typeof sort !== 'number' || typeof id !== 'string') throw new Error();
    return { sort, id };
  } catch {
    fail('VALIDATION_FAILED', 400);
  }
}
const encodeCategoryCursor = (item: CategoryItem): string =>
  Buffer.from(JSON.stringify([item.sortOrder, item.id])).toString('base64url');

@Injectable()
export class ReferenceService {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(private readonly repository: ReferenceRepository) {}

  async execute(request: ReferenceRequest): Promise<unknown> {
    const startedAt = performance.now();
    const metricOperation = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(request.operation)
      ? request.operation
      : 'invalid';
    try {
      if (!readOperations.has(request.operation)) assertIdempotencyKey(request.idempotencyKey);
      const input = this.normalize(request);
      let result: unknown;
      if (input.operation === 'listCurrencies') result = await this.cached(input, 'currencies');
      else if (input.operation === 'listCountries') result = await this.cached(input, 'countries');
      else if (input.operation === 'listCategories') result = await this.categories(input);
      else result = await this.repository.execute(input);
      if (input.permission === 'reference.write') {
        this.cache.clear();
        recordPlatformMetric(REFERENCE_METRICS.cache, 1, {
          operation: 'reference',
          outcome: 'invalidated',
        });
      }
      recordPlatformMetric(REFERENCE_METRICS.operation, 1, {
        operation: metricOperation,
        outcome: 'success',
      });
      recordPlatformMetric(REFERENCE_METRICS.duration, performance.now() - startedAt, {
        operation: metricOperation,
        outcome: 'success',
      });
      recordPlatformMetric(REFERENCE_METRICS.resultCount, responseCount(result), {
        operation: metricOperation,
      });
      recordPlatformMetric(
        REFERENCE_METRICS.payloadBytes,
        Buffer.byteLength(JSON.stringify(result)),
        { operation: metricOperation },
      );
      if (
        request.operation === 'getExchangeRate' &&
        typeof result === 'object' &&
        result !== null
      ) {
        const effectiveAt = (result as Record<string, unknown>).effectiveAt;
        if (effectiveAt instanceof Date || typeof effectiveAt === 'string') {
          const age = Date.now() - new Date(effectiveAt).getTime();
          if (Number.isFinite(age) && age >= 0)
            recordPlatformMetric(REFERENCE_METRICS.fxAge, age / 1000, {
              operation: metricOperation,
            });
        }
      }
      return result;
    } catch (error) {
      recordPlatformMetric(REFERENCE_METRICS.operation, 1, {
        operation: metricOperation,
        outcome: 'error',
        reason: metricReason(error),
      });
      recordPlatformMetric(REFERENCE_METRICS.duration, performance.now() - startedAt, {
        operation: metricOperation,
        outcome: 'error',
      });
      return this.mapError(error);
    }
  }

  private normalize(request: ReferenceRequest): ReferenceOperation {
    const body = record(request.body ?? {}),
      query = { ...(request.query ?? {}) },
      params = request.params ?? {};
    switch (request.operation) {
      case 'listCurrencies':
      case 'listCountries':
        break;
      case 'listCategories': {
        exact(query, ['kind', 'includeInactive', 'cursor', 'limit']);
        if (query.kind !== undefined && (typeof query.kind !== 'string' || !kinds.has(query.kind)))
          fail('VALIDATION_FAILED', 400);
        const c = categoryCursor(query.cursor);
        query.kind = query.kind ?? null;
        query.includeInactive = bool(query.includeInactive);
        query.limit = boundedLimit(query.limit);
        query.afterSort = c.sort;
        query.afterId = c.id;
        break;
      }
      case 'createCategory':
        Object.assign(body, normalizeCreateCategory(body));
        break;
      case 'updateCategory':
        Object.assign(body, normalizeCategoryPatch(body));
        this.uuid(params.categoryId);
        break;
      case 'archiveCategory':
        exact(query, ['expectedVersion']);
        query.expectedVersion = queryVersion(query.expectedVersion);
        this.uuid(params.categoryId);
        break;
      case 'restoreCategory':
        Object.assign(body, normalizeVersionBody(body));
        this.uuid(params.categoryId);
        break;
      case 'mergeCategory':
        Object.assign(body, normalizeVersionBody(body, ['targetId']));
        this.uuid(params.categoryId);
        this.uuid(body.targetId);
        break;
      case 'listAccounts':
        exact(query, ['status', 'cursor', 'limit']);
        if (
          query.status !== undefined &&
          (typeof query.status !== 'string' || !statuses.has(query.status))
        )
          fail('VALIDATION_FAILED', 400);
        query.status = query.status ?? null;
        query.limit = boundedLimit(query.limit);
        query.offset = cursorOffset(query.cursor);
        break;
      case 'getAccount':
        this.uuid(params.accountId);
        break;
      case 'createAccount':
        Object.assign(body, normalizeCreateAccount(body));
        break;
      case 'updateAccount':
        Object.assign(body, normalizeAccountPatch(body));
        this.uuid(params.accountId);
        break;
      case 'archiveAccount':
        exact(query, ['expectedVersion']);
        query.expectedVersion = queryVersion(query.expectedVersion);
        this.uuid(params.accountId);
        break;
      case 'restoreAccount':
        Object.assign(body, normalizeVersionBody(body));
        this.uuid(params.accountId);
        break;
      case 'closeAccount': {
        Object.assign(body, normalizeVersionBody(body, ['closedAt']));
        if (!isIsoDate(body.closedAt)) fail('VALIDATION_FAILED', 400);
        this.uuid(params.accountId);
        break;
      }
      case 'getExchangeRate': {
        exact(query, ['base', 'quote', 'at', 'maxAgeSeconds']);
        if (!isCurrency(query.base) || !isCurrency(query.quote)) fail('INVALID_CURRENCY', 400);
        if (query.at !== undefined && typeof query.at !== 'string') fail('VALIDATION_FAILED', 400);
        const at = query.at === undefined ? new Date() : new Date(query.at);
        if (Number.isNaN(at.valueOf()) || at.getTime() > Date.now()) fail('VALIDATION_FAILED', 400);
        query.at = at;
        query.maxAgeSeconds =
          query.maxAgeSeconds === undefined
            ? 86400
            : boundedLimit(query.maxAgeSeconds, 31536000, 86400);
        if (Number(query.maxAgeSeconds) < 60) fail('VALIDATION_FAILED', 400);
        break;
      }
      case 'listAdminCurrencies':
      case 'listAdminCountries':
      case 'listAdminSystemCategories':
      case 'listAdminExchangeRates':
        exact(query, ['cursor', 'limit']);
        query.limit = boundedLimit(query.limit, 200, 50);
        query.offset = cursorOffset(query.cursor);
        break;
      case 'updateAdminCurrency':
        this.adminPatch(body, ['enabled', 'name', 'minorUnit']);
        if (!isCurrency(params.currencyCode)) fail('VALIDATION_FAILED', 400);
        if ('enabled' in body) body.enabled = boolean(body.enabled);
        if ('name' in body) body.name = text(body.name, 100);
        if ('minorUnit' in body) body.minorUnit = integer(body.minorUnit, 0, 4);
        break;
      case 'updateAdminCountry':
        this.adminPatch(body, ['enabled', 'name', 'defaultCurrency']);
        if (
          typeof params.countryCode !== 'string' ||
          !/^[A-Z]{2}$/.test(params.countryCode) ||
          ('defaultCurrency' in body && !isCurrency(body.defaultCurrency))
        )
          fail('VALIDATION_FAILED', 400);
        if ('enabled' in body) body.enabled = boolean(body.enabled);
        if ('name' in body) body.name = text(body.name, 100);
        break;
      case 'updateAdminSystemCategory':
        this.adminPatch(body, ['labelAr', 'labelEn', 'icon', 'color', 'sortOrder', 'active']);
        this.uuid(params.categoryId);
        if ('labelAr' in body) body.labelAr = text(body.labelAr, 100);
        if ('labelEn' in body) body.labelEn = text(body.labelEn, 100);
        if ('icon' in body) body.icon = text(body.icon, 64, true);
        if ('color' in body) body.color = text(body.color, 32, true);
        if ('sortOrder' in body) body.sortOrder = integer(body.sortOrder, -100000, 100000);
        if ('active' in body) body.active = boolean(body.active);
        break;
      case 'createAdminExchangeRate': {
        exact(body, ['base', 'quote', 'rate', 'effectiveAt', 'providerRef', 'reason']);
        if (
          !isCurrency(body.base) ||
          !isCurrency(body.quote) ||
          body.base === body.quote ||
          typeof body.rate !== 'string' ||
          body.rate.length > 38 ||
          !/^\d+(\.\d{1,12})?$/.test(body.rate) ||
          Number(body.rate) <= 0 ||
          typeof body.effectiveAt !== 'string' ||
          Number.isNaN(Date.parse(body.effectiveAt)) ||
          Date.parse(body.effectiveAt) > Date.now()
        )
          fail('VALIDATION_FAILED', 400);
        if ('providerRef' in body) body.providerRef = text(body.providerRef, 200, true);
        body.reason = normalizeReason(body.reason);
        break;
      }
      default:
        fail('NOT_FOUND', 404);
    }
    return {
      operation: request.operation,
      principal: request.principal,
      body,
      query,
      params,
      requestId: request.requestId,
      permission: request.permission,
    };
  }

  private adminPatch(body: Record<string, unknown>, fields: string[]): void {
    exact(body, ['expectedVersion', 'reason', ...fields]);
    body.expectedVersion = expectedVersion(body.expectedVersion);
    body.reason = normalizeReason(body.reason);
    if (!fields.some((field) => field in body)) fail('VALIDATION_FAILED', 400);
  }
  private uuid(value: unknown): void {
    if (!isUuid(value)) fail('VALIDATION_FAILED', 400);
  }
  private async cached(
    input: ReferenceOperation,
    resource: 'currencies' | 'countries',
  ): Promise<unknown[]> {
    const key = resource;
    const currentHash = await this.repository.sharedHash(input.principal, resource);
    const hit = this.cache.get(key);
    if (hit && hit.hash === currentHash && hit.expiresAt > Date.now()) {
      recordPlatformMetric(REFERENCE_METRICS.cache, 1, { operation: resource, outcome: 'hit' });
      return hit.items;
    }
    recordPlatformMetric(REFERENCE_METRICS.cache, 1, { operation: resource, outcome: 'miss' });
    const items = (await this.repository.execute(input)) as unknown[];
    this.put(key, { hash: currentHash, expiresAt: Date.now() + 86_400_000, items });
    return items;
  }
  private async categories(
    input: ReferenceOperation,
  ): Promise<{ items: unknown[]; nextCursor: string | null }> {
    const digest = await this.repository.sharedHash(input.principal, 'categories');
    let system = this.cache.get('categories');
    if (!system || system.hash !== digest || system.expiresAt <= Date.now()) {
      const loaded = await this.repository.execute({
        ...input,
        operation: 'listSystemCategories',
      });
      if (!Array.isArray(loaded) || !loaded.every(categoryItem)) fail('REFERENCE_UNAVAILABLE', 503);
      const items = loaded;
      system = { hash: digest, expiresAt: Date.now() + 86_400_000, items };
      this.put('categories', system);
    }
    const loadedCustom = await this.repository.execute({
      ...input,
      operation: 'listUserCategories',
    });
    if (!Array.isArray(loadedCustom) || !loadedCustom.every(categoryItem))
      fail('REFERENCE_UNAVAILABLE', 503);
    const custom = loadedCustom;
    const afterSort = typeof input.query.afterSort === 'number' ? input.query.afterSort : null,
      afterId = typeof input.query.afterId === 'string' ? input.query.afterId : null,
      kind = typeof input.query.kind === 'string' ? input.query.kind : null;
    const visible = system.items
      .filter(categoryItem)
      .filter((item) => kind === null || item.kind === kind)
      .filter(
        (item) =>
          afterSort === null ||
          item.sortOrder > afterSort ||
          (item.sortOrder === afterSort && afterId !== null && item.id > afterId),
      );
    const combined = [...visible, ...custom].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const limit = Number(input.query.limit),
      items = combined.slice(0, limit),
      last = combined.length > limit ? items.at(-1) : undefined;
    return { items, nextCursor: last ? encodeCategoryCursor(last) : null };
  }
  private put(key: string, value: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value as string);
  }
  private mapError(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const message = error instanceof Error ? error.message : '';
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(Reflect.get(error, 'code'))
        : '';
    for (const [needle, status] of Object.entries(errorStatuses))
      if (message.includes(needle)) fail(needle, status);
    if (code === '23505') fail('DUPLICATE_RESOURCE', 409);
    if (code === '23503' || code === '23514' || code === '22023' || code === '22P02')
      fail('VALIDATION_FAILED', 400);
    if (code === '42501') fail('FORBIDDEN', 403);
    fail('REFERENCE_UNAVAILABLE', 503);
  }
}
