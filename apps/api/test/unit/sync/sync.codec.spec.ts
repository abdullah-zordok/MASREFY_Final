import {
  decodeBootstrapCursor,
  decodeSyncCursor,
  encodeBootstrapCursor,
  encodeSyncCursor,
  hashSyncMutation,
} from '../../../src/sync/sync.codec';

const scope = { userId: 'owner-one', deviceId: 'device-one' };
const otherDevice = { ...scope, deviceId: 'device-two' };
const key = Buffer.alloc(32, 1).toString('base64url');

describe('sync cursor codec', () => {
  it('encodes a stable opaque cursor and restores its exact domain position', () => {
    const encoded = encodeSyncCursor({ domain: 'transactions', position: 42n }, scope, key);
    const payload = encoded.slice(0, encoded.indexOf('.'));

    expect(encoded).not.toContain('owner-one');
    expect(Buffer.from(payload, 'base64url').toString('utf8')).not.toContain('owner-one');
    expect(Buffer.from(payload, 'base64url').toString('utf8')).not.toContain('device-one');
    expect(encoded.length).toBeLessThanOrEqual(256);
    expect(decodeSyncCursor(encoded, 'transactions', scope, key)).toEqual({
      domain: 'transactions',
      position: 42n,
    });
    expect(() => decodeSyncCursor(encoded, 'transactions', otherDevice, key)).toThrow(
      'SYNC_CURSOR_INVALID',
    );
  });

  it.each([
    ['', 'transactions'],
    ['not-base64url!', 'transactions'],
    [Buffer.from('{}').toString('base64url'), 'transactions'],
    [
      Buffer.from('{"v":1,"domain":"transactions","position":"-1"}').toString('base64url'),
      'transactions',
    ],
    [
      Buffer.from('{"v":1,"domain":"transactions","position":"42"}').toString('base64url'),
      'accounts',
    ],
  ] as const)('rejects malformed or cross-domain cursor %#', (cursor, domain) => {
    expect(() => decodeSyncCursor(cursor, domain, scope, key)).toThrow('SYNC_CURSOR_INVALID');
  });

  it('binds bootstrap continuation to owner, device, domain, and boundary', () => {
    const cursor = encodeBootstrapCursor(
      { domain: 'accounts', position: 12n, after: '73000000-0000-4000-8000-000000000001' },
      scope,
      key,
    );
    expect(cursor.length).toBeLessThanOrEqual(256);
    expect(decodeBootstrapCursor(cursor, 'accounts', scope, key)).toEqual({
      domain: 'accounts',
      position: 12n,
      after: '73000000-0000-4000-8000-000000000001',
    });
    expect(() => decodeBootstrapCursor(cursor, 'accounts', otherDevice, key)).toThrow(
      'SYNC_CURSOR_INVALID',
    );
  });
});

describe('sync mutation hashing', () => {
  it('reuses canonical command hashing across object key order', () => {
    const first = {
      domain: 'transactions',
      resourceType: 'transaction',
      schemaVersion: 1,
      dependsOn: [],
      operation: 'update',
      resourceId: 'local-1',
      baseVersion: 2,
      payload: { title: 'Coffee', amountMinor: 500 },
    } as const;
    const second = {
      payload: { amountMinor: 500, title: 'Coffee' },
      baseVersion: 2,
      resourceId: 'local-1',
      operation: 'update',
      domain: 'transactions',
      resourceType: 'transaction',
      schemaVersion: 1,
      dependsOn: [],
    } as const;

    expect(hashSyncMutation(first)).toBe(
      'sha256:d5797b2b22f319a905b258f2455a4501ca40220e8b70759d40786464d9d4cc43',
    );
    expect(hashSyncMutation(second)).toBe(hashSyncMutation(first));
  });
});
