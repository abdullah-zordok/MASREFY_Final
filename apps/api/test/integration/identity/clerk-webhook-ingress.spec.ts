import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Clerk webhook durable receipt', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const eventId = 'msg_ingress_fixture_a';
  const payload = { type: 'user.created', data: { id: 'user_ingress_fixture_a' } };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

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

  beforeAll(() => {
    pool = createLivePool();
    repository = new IdentityRepository(pool);
  });

  afterAll(async () => {
    await asMigration((client) => client.query(
      'delete from private.clerk_webhook_events where clerk_event_id = $1', [eventId],
    ));
    await pool.onModuleDestroy();
  });

  it('commits before returning and deduplicates the same delivery and hash', async () => {
    const receipt = {
      eventId,
      eventType: 'user.created' as const,
      verifiedAt: new Date('2026-08-28T12:00:00.000Z'),
      payloadHash,
      payload,
    };
    await expect(repository.receiveClerkWebhook(receipt)).resolves.toBe('inserted');
    const durable = await asMigration((client) => client.query<{ count: string }>(
      'select count(*) from private.clerk_webhook_events where clerk_event_id = $1', [eventId],
    ));
    expect(durable.rows[0]?.count).toBe('1');
    await expect(repository.receiveClerkWebhook(receipt)).resolves.toBe('duplicate');
    await expect(repository.receiveClerkWebhook({ ...receipt, payloadHash: 'f'.repeat(64) }))
      .resolves.toBe('conflict');
    const after = await asMigration((client) => client.query<{ count: string; payload_hash: string }>(
      `select count(*)::text as count, min(payload_hash) as payload_hash
       from private.clerk_webhook_events where clerk_event_id = $1`,
      [eventId],
    ));
    expect(after.rows[0]).toEqual({ count: '1', payload_hash: payloadHash });
  });

  it('keeps ingress free of profile and outbox effects', async () => {
    const evidence = await asMigration((client) => client.query<{ profiles: string; events: string }>(
      `select
         (select count(*) from public.profiles where id = 'user_ingress_fixture_a')::text as profiles,
         (select count(*) from private.outbox_events
          where payload ->> 'profileId' = 'user_ingress_fixture_a')::text as events`,
    ));
    expect(evidence.rows[0]).toEqual({ profiles: '0', events: '0' });
  });
});
