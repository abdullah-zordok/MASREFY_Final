import { createHash } from 'node:crypto';

const keyPattern = /^[A-Za-z0-9._:-]{8,128}$/;

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

export function hashIdempotencyKey(key: string): string {
  if (!keyPattern.test(key)) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return sha256(key);
}

export function hashNormalizedCommand(command: unknown): string {
  if (
    command === null ||
    typeof command !== 'object' ||
    Array.isArray(command) ||
    Object.getPrototypeOf(command) !== Object.prototype
  )
    throw new Error('IDEMPOTENCY_REQUEST_INVALID');
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      if (Object.getPrototypeOf(value) !== Object.prototype)
        throw new Error('IDEMPOTENCY_REQUEST_INVALID');
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
      );
    }
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error('IDEMPOTENCY_REQUEST_INVALID');
    return value;
  };
  try {
    return sha256(JSON.stringify(canonicalize(command)));
  } catch {
    throw new Error('IDEMPOTENCY_REQUEST_INVALID');
  }
}
