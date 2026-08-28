import type { PoolClient } from 'pg';

import type { ClerkPrincipal } from '../../../src/identity/clerk-auth.guard';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('onboarding repository', () => {
  let pool: PoolService;
  let repository: IdentityRepository;
  const owner: ClerkPrincipal = {
    userId: 'onboarding_integration_owner',
    sessionId: 'onboarding_integration_session',
    factorAgeSeconds: 20,
  };

  async function asRole<T>(
    role: 'masarifi_worker' | 'masarifi_migration',
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`set local role ${role}`);
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
    await asRole('masarifi_worker', (client) => client.query(`
      insert into public.profiles (id, status)
      values ('onboarding_integration_owner', 'active'), ('onboarding_integration_other', 'active');
      insert into public.onboarding_progress (user_id)
      values ('onboarding_integration_owner'), ('onboarding_integration_other');
    `));
  });

  afterAll(async () => {
    await asRole('masarifi_migration', (client) => client.query(`
      delete from public.onboarding_progress
      where user_id in ('onboarding_integration_owner', 'onboarding_integration_other');
      delete from public.profiles
      where id in ('onboarding_integration_owner', 'onboarding_integration_other');
    `));
    await pool.onModuleDestroy();
  });

  it('creates, resumes, and no-ops an identical normalized state', async () => {
    expect(await repository.getOnboarding(owner)).toEqual({
      step: 'welcome', completedSteps: [], completedAt: null, version: 1,
    });
    const advanced = await repository.replaceOnboarding(owner, {
      step: 'permission_education',
      completedSteps: ['welcome', 'tracking_intro'],
      complete: false,
      expectedVersion: 1,
    });
    expect(advanced).toMatchObject({ step: 'permission_education', version: 2 });
    const retry = await repository.replaceOnboarding(owner, {
      step: 'permission_education',
      completedSteps: ['welcome', 'tracking_intro'],
      complete: false,
      expectedVersion: 2,
    });
    expect(retry).toMatchObject({ step: 'permission_education', version: 2 });
  });

  it('allows only one concurrent same-version advance', async () => {
    const current = await repository.getOnboarding(owner);
    const results = await Promise.all([
      repository.replaceOnboarding(owner, {
        step: 'keywords', completedSteps: ['welcome', 'tracking_intro', 'permission_education', 'permission_request'], complete: false, expectedVersion: current.version,
      }),
      repository.replaceOnboarding(owner, {
        step: 'demo', completedSteps: ['welcome', 'tracking_intro', 'permission_education', 'permission_request', 'keywords', 'preference'], complete: false, expectedVersion: current.version,
      }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(1);
  });

  it('stores completion time only for completed state', async () => {
    const current = await repository.getOnboarding(owner);
    const completed = await repository.replaceOnboarding(owner, {
      step: 'complete',
      completedSteps: ['welcome', 'tracking_intro', 'permission_education', 'permission_request', 'keywords', 'preference', 'demo', 'platform_explanation', 'capture_options', 'optional_automation', 'manual_voice_demo', 'complete'],
      complete: true,
      expectedVersion: current.version,
    });
    expect(completed?.completedAt).toBeInstanceOf(Date);
  });
});
