import type { PoolClient } from 'pg';

import { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('reminder eligibility', () => {
  let pool: PoolService;
  let repository: EngagementRepository;
  const users = ['reminder-active', 'reminder-app-3d', 'reminder-app-7d', 'reminder-financial'];

  async function migration<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  beforeAll(async () => {
    pool = createLivePool();
    repository = new EngagementRepository(pool, {} as never);
    await migration(async (client) => {
      await client.query(
        `insert into public.profiles(id,locale,status,last_seen_at,created_at) values
          ('reminder-active','en','active',clock_timestamp()-interval '1 day',clock_timestamp()-interval '10 days'),
          ('reminder-app-3d','en','active',clock_timestamp()-interval '4 days',clock_timestamp()-interval '10 days'),
          ('reminder-app-7d','ar','active',clock_timestamp()-interval '8 days',clock_timestamp()-interval '10 days'),
          ('reminder-financial','en','active',clock_timestamp()-interval '1 day',clock_timestamp()-interval '10 days')`,
      );
      await client.query(
        `insert into public.tracking_preferences(user_id,enabled)
         values ('reminder-financial',true)`,
      );
      await client.query(
        `insert into public.user_devices(id,user_id,device_fingerprint,platform,app_version)
         select extensions.gen_random_uuid(),id,'h1:'||repeat(md5(id),2),'android','1.0.0'
         from public.profiles where id=any($1)`,
        [users],
      );
      await client.query(
        `insert into public.push_tokens(user_id,device_id,token_hash,token_ciphertext,provider)
         select user_id,id,'h1:'||repeat(md5(user_id||'-token'),2),
           'v1.key.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AA','expo'
         from public.user_devices where user_id=any($1)`,
        [users],
      );
    });
  });

  afterAll(async () => {
    await migration(async (client) => {
      await client.query('delete from public.notification_events where user_id=any($1)', [users]);
      await client.query('delete from public.push_tokens where user_id=any($1)', [users]);
      await client.query('delete from public.user_devices where user_id=any($1)', [users]);
      await client.query('delete from public.tracking_preferences where user_id=any($1)', [users]);
      await client.query('delete from public.notification_preferences where user_id=any($1)', [users]);
      await client.query('delete from public.profiles where id=any($1)', [users]);
    });
    await pool.onModuleDestroy();
  });

  it('selects one due stage and one financial cycle while excluding active users', async () => {
    const candidates = await repository.listReminderCandidates(100);
    expect(candidates.filter((item) => users.includes(item.userId))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'reminder-app-3d', kind: 'app', inactiveDays: 4 }),
        expect.objectContaining({ userId: 'reminder-app-7d', kind: 'app', inactiveDays: 8 }),
        expect.objectContaining({ userId: 'reminder-financial', kind: 'financial' }),
      ]),
    );
    expect(candidates.some((item) => item.userId === 'reminder-active')).toBe(false);
    expect(candidates.filter((item) => item.userId === 'reminder-app-7d')).toHaveLength(1);
  });

  it('deduplicates a recorded cycle and allows a new activity baseline', async () => {
    const first = (await repository.listReminderCandidates(100)).find(
      (item) => item.userId === 'reminder-app-3d',
    );
    if (!first) throw new Error('REMINDER_FIXTURE_MISSING');
    await migration((client) => client.query(
      `insert into public.notification_events(user_id,type,title,body_safe,data)
       values($1,'reminder.app_inactive.3d','Reminder','Open Masarifi.',jsonb_build_object('cycleBaseline',$2::text))`,
      [first.userId, first.baselineAt],
    ));
    expect((await repository.listReminderCandidates(100)).some(
      (item) => item.userId === first.userId,
    )).toBe(false);

    await migration((client) => client.query(
      `update public.profiles set last_seen_at=clock_timestamp()-interval '4 days' where id=$1`,
      [first.userId],
    ));
    expect((await repository.listReminderCandidates(100)).some(
      (item) => item.userId === first.userId,
    )).toBe(true);
  });
});
