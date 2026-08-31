import { HttpException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { hashNormalizedCommand } from '../ledger/idempotency';
import {
  isSyncDomain,
  type BootstrapCursor,
  type SyncCursor,
  type SyncCursorScope,
  type SyncDomain,
  type SyncMutation,
} from './sync.types';

const BASE64URL = /^[A-Za-z0-9_-]{1,512}$/;
const TOKEN = /^([A-Za-z0-9_-]{1,512})\.([A-Za-z0-9_-]{43})$/;
const POSITION = /^(0|[1-9][0-9]*)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POSITION = 9_223_372_036_854_775_807n;

function invalidCursor(): never {
  const error = new HttpException({ code: 'SYNC_CURSOR_INVALID' }, 400);
  error.message = 'SYNC_CURSOR_INVALID';
  throw error;
}

function keyBytes(key: string): Buffer {
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== key) invalidCursor();
  return bytes;
}

function scopeHash(scope: SyncCursorScope, key: Buffer): string {
  return createHmac('sha256', key)
    .update('sync-cursor-scope\0')
    .update(scope.userId)
    .update('\0')
    .update(scope.deviceId)
    .digest('base64url');
}

function encode(cursor: SyncCursor | BootstrapCursor, scope: SyncCursorScope, key: string): string {
  if (!isSyncDomain(cursor.domain) || cursor.position < 0n || cursor.position > MAX_POSITION)
    invalidCursor();
  const secret = keyBytes(key);
  const payload = Buffer.from(
    JSON.stringify({
      v: 2,
      t: 'after' in cursor ? 'b' : 's',
      d: cursor.domain,
      p: cursor.position.toString(),
      ...('after' in cursor ? { a: cursor.after } : {}),
      s: scopeHash(scope, secret),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update('sync-cursor-token\0')
    .update(payload)
    .digest('base64url');
  if (`${payload}.${signature}`.length > 256) invalidCursor();
  return `${payload}.${signature}`;
}

function decode(
  value: string,
  domain: SyncDomain,
  scope: SyncCursorScope,
  key: string,
  bootstrap: boolean,
): SyncCursor | BootstrapCursor {
  const match = TOKEN.exec(value);
  if (!match || !isSyncDomain(domain)) invalidCursor();
  try {
    const [, payload = '', supplied = ''] = match;
    const secret = keyBytes(key);
    const expected = createHmac('sha256', secret)
      .update('sync-cursor-token\0')
      .update(payload)
      .digest();
    const suppliedBytes = Buffer.from(supplied, 'base64url');
    if (suppliedBytes.length !== expected.length || !timingSafeEqual(suppliedBytes, expected))
      invalidCursor();
    if (!BASE64URL.test(payload)) invalidCursor();
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== payload) invalidCursor();
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalidCursor();
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== (bootstrap ? 'a,d,p,s,t,v' : 'd,p,s,t,v') ||
      record.v !== 2 ||
      record.t !== (bootstrap ? 'b' : 's') ||
      record.d !== domain ||
      record.s !== scopeHash(scope, secret) ||
      typeof record.p !== 'string' ||
      !POSITION.test(record.p) ||
      (bootstrap && (typeof record.a !== 'string' || !UUID.test(record.a)))
    )
      invalidCursor();
    const position = BigInt(record.p);
    if (position > MAX_POSITION) invalidCursor();
    return bootstrap ? { domain, position, after: record.a as string } : { domain, position };
  } catch {
    invalidCursor();
  }
}

export function encodeSyncCursor(cursor: SyncCursor, scope: SyncCursorScope, key: string): string {
  return encode(cursor, scope, key);
}

export function decodeSyncCursor(
  value: string,
  domain: SyncDomain,
  scope: SyncCursorScope,
  key: string,
): SyncCursor {
  return decode(value, domain, scope, key, false);
}

export function encodeBootstrapCursor(
  cursor: BootstrapCursor,
  scope: SyncCursorScope,
  key: string,
): string {
  return encode(cursor, scope, key);
}

export function decodeBootstrapCursor(
  value: string,
  domain: SyncDomain,
  scope: SyncCursorScope,
  key: string,
): BootstrapCursor {
  return decode(value, domain, scope, key, true) as BootstrapCursor;
}

export function hashSyncMutation(mutation: Omit<SyncMutation, 'operationId'>): string {
  return hashNormalizedCommand(mutation);
}
