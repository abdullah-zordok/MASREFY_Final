import { SecurityRepository } from '../../../src/security/security.repository';

describe('SecurityRepository cursor boundary', () => {
  const principal = { userId: 'admin-1', sessionId: 'session-1', factorAgeSeconds: 0 };

  function repositoryWith(query: jest.Mock) {
    const pool = {
      withClient: (action: (client: { query: jest.Mock }) => unknown) => action({ query }),
    };
    return new SecurityRepository(pool as never);
  }

  it('uses and advances a bounded opaque list cursor', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve({
        rows: sql.includes('from public.permissions')
          ? [{ id: '1' }, { id: '2' }, { id: '3' }]
          : [],
      }),
    );
    const repository = repositoryWith(query);

    await expect(
      repository.execute({
        operation: 'listPermissions',
        permission: 'permissions.read',
        principal,
        body: {},
        query: { limit: 2, cursor: Buffer.from('10').toString('base64url') },
        params: {},
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({
      items: [{ id: '1' }, { id: '2' }],
      nextCursor: Buffer.from('12').toString('base64url'),
    });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/limit \$3 offset \$4$/), [
      null,
      null,
      3,
      10,
    ]);
  });

  it('rejects malformed and excessive cursors before issuing the list query', async () => {
    const query = jest.fn((sql: string) => {
      void sql;
      return Promise.resolve({ rows: [] });
    });
    const repository = repositoryWith(query);
    for (const cursor of ['e30', Buffer.from('1000001').toString('base64url'), '***']) {
      await expect(
        repository.execute({
          operation: 'listPermissions',
          permission: 'permissions.read',
          principal,
          body: {},
          query: { cursor },
          params: {},
          requestId: 'request-1',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    }
    expect(query.mock.calls.some(([sql]) => sql.includes('from public.permissions'))).toBe(false);
  });

  it('uses a deterministic occurred-at/id cursor for append-heavy security events', async () => {
    const occurredAt = '2026-08-29T08:00:00.000Z';
    const rows = [
      { id: '0198f79d-98f3-7bb4-a820-f43bb4d0e190', occurredAt },
      { id: '0198f79d-98f3-7bb4-a820-f43bb4d0e191', occurredAt },
    ];
    const query = jest.fn((sql: string) =>
      Promise.resolve({ rows: sql.includes('from public.security_events') ? rows : [] }),
    );
    const repository = repositoryWith(query);
    const cursor = Buffer.from(JSON.stringify([occurredAt, rows[0]?.id])).toString('base64url');

    await expect(
      repository.execute({
        operation: 'listMySecurityEvents',
        principal,
        body: {},
        query: { limit: 1, cursor },
        params: {},
        requestId: 'request-1',
      }),
    ).resolves.toEqual({ items: [rows[0]], nextCursor: cursor });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/\(occurred_at,id\)<\(\$4::timestamptz,\$5::uuid\)/),
      [null, null, null, occurredAt, rows[0]?.id, 2],
    );
  });
});
