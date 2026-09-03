import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { AiRepository } from '../../../src/ai/ai.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('governed Admin AI operations', () => {
  const pool = createLivePool(),
    repository = new AiRepository(pool);
  const adminId = `ai_admin_${randomUUID()}`,
    readerId = `ai_reader_${randomUUID()}`;
  const admin = { userId: adminId, sessionId: 'admin-session', factorAgeSeconds: 0 },
    reader = { userId: readerId, sessionId: 'reader-session', factorAgeSeconds: 0 };
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active'),($2,'active')", [
      adminId,
      readerId,
    ]);
    await pool.query(
      "insert into public.admin_profiles(user_id,status) values($1,'active'),($2,'active')",
      [adminId, readerId],
    );
    await pool.query(
      "insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason) select $1,id,$1,'Phase 09 governed integration' from public.roles where key='super-admin'",
      [adminId],
    );
  });
  afterAll(async () => {
    await pool.onModuleDestroy();
  });

  it('reads redacted resources, audits a versioned change, and replays the same Admin key', async () => {
    const [provider] = await repository.adminRead(admin, 'providers', null, 1);
    if (!provider) throw new Error('AI_PROVIDER_FIXTURE_MISSING');
    const result = await repository.adminMutate(
      admin,
      'providers',
      String(provider.id),
      {
        expectedVersion: provider.version,
        reason: 'Approve provider after privacy review',
        approved: false,
      },
      'admin-provider-key-0001',
      randomUUID(),
    );
    await expect(
      repository.adminMutate(
        admin,
        'providers',
        String(provider.id),
        {
          expectedVersion: provider.version,
          reason: 'Approve provider after privacy review',
          approved: false,
        },
        'admin-provider-key-0001',
        randomUUID(),
      ),
    ).resolves.toMatchObject({ replayed: true });
    expect(result).toMatchObject({ resource: { kind: 'provider' } });
    expect(
      (
        await pool.query<{ count: string }>(
          "select count(*)::text count from audit.audit_events where actor_id=$1 and action='ai.config-updated'",
          [adminId],
        )
      ).rows[0]?.count,
    ).toBe('1');
  });

  it('denies a valid admin identity without the exact permission', async () => {
    await expect(repository.adminRead(reader, 'providers', null, 1)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('acknowledges failures while preserving immutable incident evidence', async () => {
    const failureId = randomUUID();
    await pool.query(
      `insert into private.ai_failure_events(id,workload,failure_code,request_id)
      values($1,'financial_assistant','AI_PROVIDER_TIMEOUT',$2)`,
      [failureId, randomUUID()],
    );
    await expect(
      repository.adminMutate(
        admin,
        'failures',
        failureId,
        {
          expectedVersion: 1,
          reason: 'Acknowledge provider timeout for investigation',
          status: 'acknowledged',
        },
        'admin-failure-key-0001',
        randomUUID(),
      ),
    ).resolves.toMatchObject({ resource: { kind: 'failure', version: 2 } });
    await expect(
      pool.query("update private.ai_failure_events set failure_code='AI_TAMPERED' where id=$1", [
        failureId,
      ]),
    ).rejects.toMatchObject({ message: 'IMMUTABLE_RECORD' });
  });

  it('rejects a provider or safety change that would weaken an enabled route', async () => {
    await pool.query(
      "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where workload='voice_transcription'",
      [adminId],
    );
    await pool.query(
      "update private.ai_feature_routes set enabled=true where workload='voice_transcription'",
    );
    const provider = (
      await pool.query<{ id: string; version: number }>(
        "select id,version from private.ai_providers where key='google'",
      )
    ).rows[0];
    const rule = (
      await pool.query<{ id: string; version: number }>(
        "select id,version from private.ai_safety_rules where key='global.no_tools'",
      )
    ).rows[0];
    if (!provider || !rule) throw new Error('AI_POLICY_FIXTURE_MISSING');
    await expect(
      repository.adminMutate(
        admin,
        'providers',
        provider.id,
        {
          expectedVersion: provider.version,
          reason: 'Attempt to disable an active fallback',
          approved: false,
        },
        'admin-policy-provider-0001',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'AI_ROUTE_POLICY_INVALID' } });
    await expect(
      repository.adminMutate(
        admin,
        'safety-rules',
        rule.id,
        {
          expectedVersion: rule.version,
          reason: 'Attempt to disable active output controls',
          enabled: false,
        },
        'admin-policy-safety-0001',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'AI_ROUTE_POLICY_INVALID' } });
    expect(
      (
        await pool.query<{ route: unknown }>(
          "select private.get_effective_ai_route('voice_transcription') route",
        )
      ).rows[0]?.route,
    ).not.toBeNull();
    await pool.query(
      "update private.ai_feature_routes set enabled=false where workload='voice_transcription'",
    );
  });
});
