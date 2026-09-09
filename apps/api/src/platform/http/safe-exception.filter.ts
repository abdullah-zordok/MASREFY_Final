import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { LEDGER_METRICS, recordPlatformMetric } from '../observability/platform-metrics';
import { normalizeRequestId } from './request-id.middleware';

const errors: Record<number, { code: string; message: string }> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed',
  },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Forbidden' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Not found' },
  [HttpStatus.REQUEST_TIMEOUT]: {
    code: 'REQUEST_TIMEOUT',
    message: 'Request timed out',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Payload too large',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Unsupported media type',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMITED',
    message: 'Too many requests',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service unavailable',
  },
};

const domainErrors: Record<string, { status: number; message: string }> = {
  AUTH_TOKEN_INVALID: { status: 401, message: 'Authentication token is invalid' },
  PROFILE_INACTIVE: { status: 403, message: 'Profile is inactive' },
  PROFILE_SYNC_UNAVAILABLE: {
    status: 503,
    message: 'Profile synchronization is unavailable',
  },
  VERSION_CONFLICT: { status: 409, message: 'Resource version conflict' },
  INVALID_CURSOR: { status: 400, message: 'Cursor is invalid' },
  RECENT_AUTH_REQUIRED: { status: 403, message: 'Recent authentication is required' },
  DEVICE_NOT_FOUND: { status: 404, message: 'Device not found' },
  PUSH_TOKEN_CONFLICT: { status: 409, message: 'Push token is already registered' },
  PROVIDER_UNAVAILABLE: { status: 503, message: 'Provider is unavailable' },
  INVALID_WEBHOOK: { status: 400, message: 'Webhook payload is invalid' },
  WEBHOOK_SIGNATURE_INVALID: { status: 401, message: 'Webhook signature is invalid' },
  WEBHOOK_EVENT_CONFLICT: {
    status: 409,
    message: 'Webhook event conflicts with an existing delivery',
  },
  INBOX_UNAVAILABLE: { status: 503, message: 'Webhook inbox is unavailable' },
  INVALID_CURRENCY: { status: 400, message: 'Currency is invalid' },
  CATEGORY_INVALID: { status: 409, message: 'Category is invalid' },
  CATEGORY_CYCLE: { status: 409, message: 'Category hierarchy would contain a cycle' },
  CATEGORY_USAGE_CHANGED: {
    status: 409,
    message: 'Category usage changed; review and retry the action',
  },
  ACCOUNT_CURRENCY_LOCKED: { status: 409, message: 'Account currency cannot be changed' },
  ACCOUNT_CLOSED: { status: 409, message: 'Account is closed' },
  DUPLICATE_RESOURCE: { status: 409, message: 'Resource already exists' },
  LEDGER_NOT_AVAILABLE: { status: 409, message: 'Ledger operation is not available' },
  FX_UNAVAILABLE: { status: 404, message: 'Exchange rate is unavailable' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, message: 'Idempotency key is required' },
  IDEMPOTENCY_KEY_REUSED: { status: 409, message: 'Idempotency key was already used' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, message: 'Idempotent request is in progress' },
  IDEMPOTENCY_REPLAY_UNAVAILABLE: {
    status: 503,
    message: 'Idempotency replay is unavailable',
  },
  ACCOUNT_NOT_POSTABLE: { status: 409, message: 'Account cannot accept this transaction' },
  TRACKING_ACCOUNT_BLOCKED: {
    status: 409,
    message: 'Automatic tracking is disabled for this account',
  },
  CURRENCY_MISMATCH: { status: 409, message: 'Currencies do not match' },
  AMOUNT_OUT_OF_RANGE: { status: 400, message: 'Amount is out of range' },
  TRANSACTION_NOT_EDITABLE: { status: 409, message: 'Transaction cannot be changed' },
  TRANSACTION_HAS_DEPENDENTS: { status: 409, message: 'Transaction has dependent records' },
  REVERSAL_EXISTS: { status: 409, message: 'Transaction was already reversed' },
  REFUND_EXCEEDS_AVAILABLE: {
    status: 409,
    message: 'Refund exceeds the available amount',
  },
  UNDO_EXPIRED: { status: 409, message: 'Undo window has expired' },
  LEDGER_BUSY: { status: 409, message: 'Ledger is busy' },
  LEDGER_UNAVAILABLE: { status: 503, message: 'Ledger is unavailable' },
  REFERENCE_UNAVAILABLE: { status: 503, message: 'Reference service is unavailable' },
  SYNC_CURSOR_INVALID: { status: 400, message: 'Sync cursor is invalid' },
  SYNC_CURSOR_AHEAD: { status: 409, message: 'Sync cursor is ahead of the server' },
  SYNC_CURSOR_EXPIRED: { status: 409, message: 'Sync cursor has expired' },
  SYNC_CURSOR_NOT_ISSUED: {
    status: 409,
    message: 'Sync cursor was not issued to this device',
  },
  SYNC_PAYLOAD_TOO_LARGE: { status: 413, message: 'Sync payload is too large' },
  SYNC_OPERATION_ID_REUSED: { status: 409, message: 'Sync operation ID was already used' },
  SYNC_MUTATION_NOT_FOUND: { status: 404, message: 'Sync mutation was not found' },
  SYNC_CONFLICT_NOT_FOUND: { status: 404, message: 'Sync conflict was not found' },
  SYNC_CONFLICT_ALREADY_RESOLVED: { status: 409, message: 'Sync conflict is already resolved' },
  PLANNING_NOT_FOUND: { status: 404, message: 'Planning resource was not found' },
  PLANNING_VERSION_CONFLICT: { status: 409, message: 'Planning resource version conflict' },
  PLANNING_LIFECYCLE_INVALID: {
    status: 409,
    message: 'Planning lifecycle transition is invalid',
  },
  PLANNING_CURRENCY_MISMATCH: { status: 409, message: 'Planning currencies do not match' },
  PLANNING_LEDGER_STATE_INVALID: { status: 409, message: 'Planning ledger state is invalid' },
  PLANNING_TRANSACTION_DUPLICATE: {
    status: 409,
    message: 'Planning transaction is already linked',
  },
  PLANNING_ALLOCATION_INVALID: { status: 409, message: 'Planning allocation is invalid' },
  PLANNING_PROGRESS_INSUFFICIENT: {
    status: 409,
    message: 'Planning progress is insufficient',
  },
  PLANNING_REVIEW_REQUIRED: { status: 409, message: 'Planning review is required' },
  PLANNING_RATE_LIMITED: { status: 409, message: 'Planning operation is rate limited' },
  TRACKING_VERSION_CONFLICT: { status: 409, message: 'Tracking preferences changed' },
  TRACKING_RULE_CONFLICT: { status: 409, message: 'Tracking rule changed' },
  REVIEW_VERSION_CONFLICT: { status: 409, message: 'Review item changed' },
  DUPLICATE_VERSION_CONFLICT: { status: 409, message: 'Duplicate candidate changed' },
  IMPORT_LEASE_STALE: { status: 409, message: 'Import lease is stale' },
  ADMIN_VERSION_CONFLICT: { status: 409, message: 'Admin resource changed' },
  UNSAFE_IMPORT: { status: 400, message: 'Import content is unsafe' },
  IMPORT_LIMIT_EXCEEDED: { status: 413, message: 'Import payload exceeds its limit' },
  TRACKING_STORAGE_UNAVAILABLE: { status: 503, message: 'Import storage is unavailable' },
  AI_CONSENT_REQUIRED: { status: 403, message: 'Assistant consent is required' },
  AI_CONSENT_POLICY_STALE: { status: 409, message: 'Assistant consent policy changed' },
  AI_ACTION_CONFLICT: { status: 409, message: 'AI action changed' },
  AI_UNAVAILABLE: { status: 503, message: 'AI is unavailable' },
  AI_TEMPORARILY_UNAVAILABLE: { status: 503, message: 'AI is temporarily unavailable' },
  AI_QUOTA_EXCEEDED: { status: 429, message: 'AI request quota is exhausted' },
  AI_BUDGET_EXHAUSTED: { status: 429, message: 'AI budget is exhausted' },
};

type FieldError = { field: string; code: string; message: string };
type SafeError = {
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: FieldError[];
  currentVersion?: number;
  limit?: number;
  used?: number;
  resetsAt?: string;
};

const safeField = /^[A-Za-z0-9_.-]{1,128}$/;
const safeCode = /^[A-Z][A-Z0-9_]{0,63}$/;
const safeMessage = /^[A-Za-z0-9 .,:'()_-]{1,256}$/;

function sanitizeFieldError(error: FieldError): FieldError {
  return safeField.test(error.field) && safeCode.test(error.code) && safeMessage.test(error.message)
    ? error
    : { field: 'request', code: 'INVALID', message: 'Invalid value' };
}

function exceptionStatus(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception !== 'object' || exception === null || !('type' in exception)) return 500;
  const type = Reflect.get(exception, 'type');
  if (type === 'entity.too.large') return HttpStatus.PAYLOAD_TOO_LARGE;
  if (type === 'encoding.unsupported') return HttpStatus.UNSUPPORTED_MEDIA_TYPE;
  if (type === 'entity.parse.failed') return HttpStatus.BAD_REQUEST;
  return 500;
}

function exceptionDomainCode(exception: unknown, status: number): string | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  const response = exception.getResponse();
  if (typeof response !== 'object' || !('code' in response)) return undefined;
  const code = (response as { code?: unknown }).code;
  return typeof code === 'string' && domainErrors[code]?.status === status ? code : undefined;
}

export function safeError(
  status: number,
  requestId?: string,
  fieldErrors: FieldError[] = [],
  domainCode?: string,
  metadata?: unknown,
): SafeError {
  const domain = domainCode === undefined ? undefined : domainErrors[domainCode];
  const mapped =
    domainCode !== undefined && domain !== undefined
      ? { code: domainCode, message: domain.message }
      : (errors[status] ?? {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        });
  const bounded = fieldErrors.slice(0, 50).map(sanitizeFieldError);
  const details =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const currentVersion = typeof metadata === 'number' ? metadata : details.currentVersion;
  const quotaMetadata =
    (domainCode === 'AI_QUOTA_EXCEEDED' || domainCode === 'AI_BUDGET_EXHAUSTED') &&
    details.limit === 5 &&
    typeof details.used === 'number' &&
    Number.isSafeInteger(details.used) &&
    details.used >= 5 &&
    typeof details.resetsAt === 'string' &&
    Number.isFinite(Date.parse(details.resetsAt))
      ? { limit: 5, used: details.used, resetsAt: details.resetsAt }
      : {};
  return {
    ...mapped,
    requestId: normalizeRequestId(requestId),
    ...(bounded.length > 0 ? { fieldErrors: bounded } : {}),
    ...((domainCode === 'VERSION_CONFLICT' ||
      domainCode === 'PLANNING_VERSION_CONFLICT' ||
      domainCode === 'AI_ACTION_CONFLICT' ||
      domainCode === 'AI_ADMIN_CONFLICT' ||
      domainCode === 'AI_CONVERSATION_CONFLICT') &&
    typeof currentVersion === 'number' &&
    Number.isSafeInteger(currentVersion) &&
    currentVersion >= 1
      ? { currentVersion }
      : {}),
    ...quotaMetadata,
  };
}

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const status = exceptionStatus(exception);
    const domainCode = exceptionDomainCode(exception, status);
    const domainResponse =
      exception instanceof HttpException && typeof exception.getResponse() === 'object'
        ? (exception.getResponse() as { currentVersion?: unknown })
        : undefined;
    if (
      domainCode &&
      /^\/api\/v1\/(transactions(?:\/|$)|transfers(?:\/|$)|accounts\/[^/]+\/summary(?:\/|$))/.test(
        request.path,
      )
    )
      recordPlatformMetric(LEDGER_METRICS.error, 1, { reason: domainCode });
    response
      .status(status)
      .json(safeError(status, request.requestId, [], domainCode, domainResponse));
  }
}
