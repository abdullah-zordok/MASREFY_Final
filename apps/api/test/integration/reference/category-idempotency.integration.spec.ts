import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import { hashIdempotencyKey, hashNormalizedCommand } from '../../../src/ledger/idempotency';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { ReferenceService } from '../../../src/reference/reference.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('category create idempotency after local favorite persistence failure', () => {
  const runId = randomUUID();
  const principal = {
    userId: `category_retry_${runId}`,
    sessionId: 'session-category',
    factorAgeSeconds: 0,
  };
  const pool = createLivePool();
  const repository = new ReferenceRepository(pool);
  const service = new ReferenceService(repository, {} as never);
  const request = (key: string) => ({
    operation: 'createCategory',
    principal,
    requestId: `category-${key}-${runId}`,
    idempotencyKey: `category-${key}-${runId}`,
    body: {
      kind: 'expense',
      labelAr: `سفر ${key}`,
      labelEn: `Travel ${key}`,
      icon: null,
      color: null,
      parentId: null,
      sortOrder: 0,
    },
  });
  const evidence = async (label: string) =>
    (
      await pool.query(
        `select
      (select count(*)::int from public.categories where user_id=$1 and label_en=$2) categories,
      (select count(*)::int from audit.audit_events where actor_id=$1 and action='category.created') audits,
      (select count(*)::int from private.outbox_events where payload->>'userId'=$1 and event_type='category.created') events`,
        [principal.userId, label],
      )
    ).rows[0];

  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [
      principal.userId,
    ]);
  });
  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local session_replication_role=replica');
      await client.query('delete from private.idempotency_keys where actor_id=$1', [
        principal.userId,
      ]);
      await client.query(
        "delete from private.outbox_events where payload->>'userId'=$1 or payload#>>'{sync,userId}'=$1",
        [principal.userId],
      );
      await client.query('delete from public.categories where user_id=$1', [principal.userId]);
      await client.query('delete from public.profiles where id=$1', [principal.userId]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  it('replays the same normalized request without another category, audit, or outbox event', async () => {
    const input = request('replay');
    const first = await service.execute(input);
    const before = await evidence(input.body.labelEn);
    const replay = await service.execute({
      ...input,
      requestId: `retry-${runId}`,
      body: { ...input.body },
    });
    expect(JSON.parse(JSON.stringify(replay))).toEqual(JSON.parse(JSON.stringify(first)));
    expect(await evidence(input.body.labelEn)).toEqual(before);
    expect(before).toEqual({ categories: 1, audits: 1, events: 1 });
    const receipt = (
      await pool.query(
        'select response_status,state from private.idempotency_keys where actor_id=$1 and key_hash=$2',
        [principal.userId, hashIdempotencyKey(input.idempotencyKey)],
      )
    ).rows[0];
    expect(receipt).toEqual({ response_status: 201, state: 'completed' });
  });

  it('rejects the same key with a different request without inserting the changed category', async () => {
    const input = request('mismatch');
    await service.execute(input);
    await expect(
      service.execute({ ...input, body: { ...input.body, labelEn: 'Changed retry' } }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect((await evidence('Changed retry'))?.categories).toBe(0);
  });

  it('rejects a claimed in-progress key without creating a category', async () => {
    const input = request('pending');
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ role: 'authenticated', sub: principal.userId, sid: principal.sessionId }),
      ]);
      await client.query('set local role masarifi_api');
      await client.query('select * from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)', [
        principal.userId,
        'reference.create-category',
        hashIdempotencyKey(input.idempotencyKey),
        hashNormalizedCommand({ operation: input.operation, body: input.body, params: {} }),
        '2 minutes',
      ]);
      await client.query('commit');
    });
    await expect(service.execute(input)).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_IN_PROGRESS' },
    });
    expect((await evidence(input.body.labelEn))?.categories).toBe(0);
  });

  it('rolls category, audit, outbox, and claim back if completing the receipt fails', async () => {
    const input = request('atomic');
    const before = await evidence(input.body.labelEn);
    const failingRepository = new ReferenceRepository({
      withClient: (action: (client: PoolClient) => Promise<unknown>) =>
        pool.withClient((client) =>
          action(
            new Proxy(client, {
              get(target, property) {
                if (property === 'query')
                  return (sql: string, values: unknown[]) => {
                    if (sql.includes('private.complete_idempotency_key'))
                      throw new Error('injected completion failure');
                    return target.query(sql, values);
                  };
                return Reflect.get(target, property) as unknown;
              },
            }),
          ),
        ),
    } as never);
    await expect(failingRepository.execute({ ...input, params: {}, query: {} })).rejects.toThrow(
      'injected completion failure',
    );
    expect(await evidence(input.body.labelEn)).toEqual(before);
    const receipt = await pool.query(
      'select id from private.idempotency_keys where actor_id=$1 and key_hash=$2',
      [principal.userId, hashIdempotencyKey(input.idempotencyKey)],
    );
    expect(receipt.rows).toEqual([]);
    await expect(service.execute(input)).resolves.toMatchObject({
      labelEn: input.body.labelEn,
      version: 1,
    });
  });
});
