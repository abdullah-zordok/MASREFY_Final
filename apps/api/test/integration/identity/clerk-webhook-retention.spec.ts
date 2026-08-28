import type { PoolClient } from 'pg';

import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Clerk webhook retention', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const ids = ['msg_retention_terminal', 'msg_retention_nonterminal', 'msg_retention_young'];

  async function asMigration<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        const value = await action(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  beforeAll(async () => {
    pool = createLivePool();
    repository = new IdentityRepository(pool);
    await asMigration((client) => client.query(
      `insert into private.clerk_webhook_events(
         clerk_event_id,event_type,signature_verified_at,payload_hash,payload,status,processed_at,created_at
       ) values
       ($1,'user.created',now()-interval '8 days',repeat('a',64),'{"data":{"id":"retention_a"}}','processed',now()-interval '8 days',now()-interval '8 days'),
       ($2,'user.created',now()-interval '8 days',repeat('b',64),'{"data":{"id":"retention_b"}}','received',null,now()-interval '8 days'),
       ($3,'user.created',now(),repeat('c',64),'{"data":{"id":"retention_c"}}','processed',now(),now())`,
      ids,
    ));
  });

  afterAll(async () => {
    await asMigration((client) => client.query(
      'delete from private.clerk_webhook_events where clerk_event_id=any($1::text[])', [ids],
    ));
    await pool.onModuleDestroy();
  });

  it('redacts only old terminal payloads and retains immutable evidence', async () => {
    await expect(repository.redactClerkWebhookPayloads(100)).resolves.toBe(1);
    const rows = await asMigration((client) => client.query<{
      clerk_event_id: string; payload: Record<string, unknown>; payload_hash: string; status: string;
    }>(
      `select clerk_event_id,payload,payload_hash,status from private.clerk_webhook_events
       where clerk_event_id=any($1::text[]) order by clerk_event_id`, [ids],
    ));
    expect(rows.rows.find((row) => row.clerk_event_id === ids[0])?.payload).toEqual({});
    expect(rows.rows.find((row) => row.clerk_event_id === ids[0])?.payload_hash).toBe('a'.repeat(64));
    expect(rows.rows.find((row) => row.clerk_event_id === ids[1])?.payload).not.toEqual({});
    expect(rows.rows.find((row) => row.clerk_event_id === ids[2])?.payload).not.toEqual({});
  });
});
