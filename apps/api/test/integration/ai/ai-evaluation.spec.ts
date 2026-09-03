import { randomUUID } from 'node:crypto';
import { AiRepository } from '../../../src/ai/ai.repository';
import { AiWorker } from '../../../src/ai/ai.worker';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI prompt evaluation and publication', () => {
  const pool = createLivePool(),
    repository = new AiRepository(pool);
  const adminId = `ai_eval_admin_${randomUUID()}`,
    promptId = randomUUID(),
    emptyPromptId = randomUUID();
  const principal = { userId: adminId, sessionId: 'evaluation-session', factorAgeSeconds: 0 };
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [adminId]);
    await pool.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
      adminId,
    ]);
    await pool.query(
      "insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason) select $1,id,$1,'Phase 09 evaluation integration' from public.roles where key='super-admin'",
      [adminId],
    );
    await pool.query(
      "insert into private.ai_prompt_versions(id,workload,version_no,template,schema_version) values($1,'financial_assistant',2,'Answer only from aliased evidence. Never use tools.',1),($2,'financial_assistant',3,'This draft intentionally has no corpus.',1)",
      [promptId, emptyPromptId],
    );
    await pool.query(
      'insert into private.ai_prompt_test_cases(prompt_version_id,case_key,fixture_redacted,expected_rules) values($1,\'safe.answer\',\'{"question":"How much?"}\',\'{"schema":true,"noTools":true}\')',
      [promptId],
    );
  });
  afterAll(async () => {
    await pool.query('delete from private.ai_prompt_versions where id=any($1::uuid[])', [
      [promptId, emptyPromptId],
    ]);
    await pool.query(
      "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where id='99030000-0000-4000-8000-000000000003'",
      [adminId],
    );
    await pool.onModuleDestroy();
  });

  it('requires a corpus, fences evaluation, and permits exactly one publication winner', async () => {
    await expect(
      repository.testPrompt(
        principal,
        emptyPromptId,
        { expectedVersion: 3, reason: 'Attempt evaluation without corpus' },
        'evaluation-empty-key-0001',
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'AI_EVALUATION_CASES_REQUIRED' } });
    await repository.testPrompt(
      principal,
      promptId,
      { expectedVersion: 2, reason: 'Run the reviewed prompt corpus' },
      'evaluation-test-key-0001',
      randomUUID(),
    );
    const [claim] = await repository.claimWork('ai.evaluate_route', 'evaluation-worker', 1, 120);
    expect(claim).toMatchObject({ id: promptId, attempt_count: 1 });
    if (!claim) throw new Error('AI_EVALUATION_CLAIM_MISSING');
    expect(await repository.workInput(claim.kind, claim.id, claim.claim_token)).toMatchObject({
      workload: 'financial_assistant',
      cases: [{ fixture: { question: 'How much?' } }],
    });
    await pool.query(
      'update private.ai_prompt_versions set claim_token=null,claimed_by=null,lease_until=null where id=$1',
      [promptId],
    );
    const config = {
      getRequired: jest.fn(
        (name: string) =>
          (
            ({
              MASARIFI_AI_PROVIDER_ENABLED: true,
              MASARIFI_AI_JOB_BATCH_SIZE: 10,
              MASARIFI_AI_LEASE_SECONDS: 120,
              MASARIFI_AI_MAX_CONCURRENCY: 1,
            }) as Record<string, unknown>
          )[name],
      ),
      get: jest.fn(() => 'evaluation-worker'),
    };
    await new AiWorker(
      repository,
      { delete: jest.fn() } as never,
      { complete: jest.fn() } as never,
      config as never,
    ).runOnce();

    const attempts = await Promise.allSettled([
      repository.publishPrompt(
        principal,
        promptId,
        { expectedVersion: 2, reason: 'Publish evaluated prompt version two' },
        'evaluation-publish-key-0001',
        randomUUID(),
      ),
      repository.publishPrompt(
        principal,
        promptId,
        { expectedVersion: 2, reason: 'Publish evaluated prompt version two' },
        'evaluation-publish-key-0002',
        randomUUID(),
      ),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await pool.query<{ status: string }>(
          'select status from private.ai_prompt_versions where id=$1',
          [promptId],
        )
      ).rows[0]?.status,
    ).toBe('approved');
  });
});
