import type { z } from 'zod';

export type HttpErrorCode =
  | 'validation_error'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'session_expired'
  | 'gone'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'contract_mismatch'
  | 'internal_error';

export class HttpError extends Error {
  constructor(
    readonly code: HttpErrorCode,
    readonly status: number
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = 'HttpError';
  }
}

type TokenProvider = () => Promise<string | null>;
type RequestOptions<T> = Omit<RequestInit, 'body'> & {
  baseUrl?: string;
  body?: unknown;
  emptyValue?: T;
  notModifiedValue?: T;
  request?: typeof fetch;
  timeoutMs?: number;
};

const SAFE_MESSAGES: Record<HttpErrorCode, string> = {
  validation_error: 'Check the submitted data and try again.',
  forbidden: 'This action is not permitted.',
  not_found: 'The requested item was not found.',
  conflict: 'The request conflicts with the current state.',
  session_expired: 'The session has expired. Sign in again.',
  gone: 'This item is no longer available.',
  rate_limited: 'Too many attempts. Try again later.',
  provider_unavailable: 'The service is temporarily unavailable.',
  contract_mismatch: 'The service returned an unsupported response.',
  internal_error: 'The request could not be completed.'
};
const SERVER_CODES: Readonly<Record<string, HttpErrorCode>> = {
  VALIDATION_FAILED: 'validation_error',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VERSION_CONFLICT: 'conflict',
  AUTH_TOKEN_INVALID: 'session_expired',
  GONE: 'gone',
  RATE_LIMITED: 'rate_limited',
  SERVICE_UNAVAILABLE: 'provider_unavailable'
};
const PRIVATE_KEYS =
  /token|secret|password|authorization|cookie|path|payload|error/i;
let tokenProvider: TokenProvider | null = null;

export function configureMobileApiTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export function sanitizeHttpLog(value: unknown): unknown {
  if (value instanceof Error) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(sanitizeHttpLog);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      PRIVATE_KEYS.test(key) ? '[REDACTED]' : sanitizeHttpLog(entry)
    ])
  );
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions<T> = {}
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs ?? 15_000);

  try {
    const token = await tokenProvider?.();
    if (!token) throw new HttpError('session_expired', 401);
    const headers = headerRecord(options.headers);
    setHeader(headers, 'accept', 'application/json');
    if (options.body !== undefined)
      setHeader(headers, 'content-type', 'application/json');
    setHeader(headers, 'Authorization', `Bearer ${token}`);

    const request = options.request ?? fetch;
    const baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_API_URL ??
      ''
    ).replace(/\/+$/u, '');
    if (!baseUrl || !path.startsWith('/'))
      throw new HttpError('contract_mismatch', 500);
    const response = await request(`${baseUrl}${path}`, {
      method: options.method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    if (response.status === 204)
      return parseKnownValue(schema, options, 'emptyValue');
    if (response.status === 304)
      return parseKnownValue(schema, options, 'notModifiedValue');
    if (!response.ok) throw await parseError(response);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError('contract_mismatch', 502);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new HttpError('contract_mismatch', 502);
    return parsed.data;
  } catch (error) {
    const failure = normalizeFailure(error, controller.signal.aborted);
    if (typeof __DEV__ !== 'undefined' && __DEV__)
      console.info(
        '[mobile:http-failure]',
        sanitizeHttpLog({ path, error: failure, status: failure.status })
      );
    throw failure;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function parseError(response: Response): Promise<HttpError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new HttpError('contract_mismatch', response.status);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return new HttpError('contract_mismatch', response.status);
  const code = Reflect.get(payload, 'code');
  if (typeof code !== 'string' || !SERVER_CODES[code])
    return new HttpError('contract_mismatch', response.status);
  return new HttpError(SERVER_CODES[code], response.status);
}

function parseKnownValue<T>(
  schema: z.ZodType<T>,
  options: RequestOptions<T>,
  key: 'emptyValue' | 'notModifiedValue'
): T {
  if (!(key in options)) throw new HttpError('contract_mismatch', 502);
  const parsed = schema.safeParse(options[key]);
  if (!parsed.success) throw new HttpError('contract_mismatch', 502);
  return parsed.data;
}

function normalizeFailure(error: unknown, aborted: boolean): HttpError {
  if (error instanceof HttpError) return error;
  if (
    aborted ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TypeError'))
  )
    return new HttpError('provider_unavailable', 503);
  return new HttpError('internal_error', 500);
}

function headerRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (Array.isArray(value)) return Object.fromEntries(value);
  return { ...value };
}

function setHeader(
  headers: Record<string, string>,
  name: string,
  value: string
): void {
  for (const key of Object.keys(headers))
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  headers[name] = value;
}
