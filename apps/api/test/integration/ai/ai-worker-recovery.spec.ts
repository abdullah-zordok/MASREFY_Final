import { randomUUID } from 'node:crypto';
import { AiRepository } from '../../../src/ai/ai.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI worker recovery', () => {
  const pool = createLivePool(),
    repository = new AiRepository(pool);
  const userId = `ai_recovery_${randomUUID()}`,
    adminId = `ai_recovery_admin_${randomUUID()}`;
  const accountId = randomUUID(),
    principal = { userId, sessionId: 'recovery-session', factorAgeSeconds: 0 };
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active'),($2,'active')", [
      userId,
      adminId,
    ]);
    await pool.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
      adminId,
    ]);
    await pool.query(
      "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Recovery account','bank','SAR')",
      [accountId, userId],
    );
    await pool.query(
      "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where workload='voice_transcription'",
      [adminId],
    );
    await pool.query(
      "update private.ai_feature_routes set enabled=true where workload='voice_transcription'",
    );
  });
  afterAll(async () => {
    await pool.query(
      "update private.ai_feature_routes set enabled=false where workload='voice_transcription'",
    );
    await pool.query(
      "update private.ai_prompt_versions set status='draft',evaluation_passed=false,approved_by=null,published_at=null where id='99030000-0000-4000-8000-000000000001'",
    );
    await pool.onModuleDestroy();
  });

  it('reclaims a stale lease, fences the old worker, retries purge, and releases stale cost', async () => {
    const created = await repository.createVoiceSession(
      principal,
      { locale: 'en', durationMs: 1000, contentType: 'audio/wav', sizeBytes: 44 },
      'recovery-create-key-0001',
    );
    const sessionId = String((Reflect.get(created, 'resource') as Record<string, unknown>).id);
    await repository.processVoiceSession(
      principal,
      sessionId,
      { expectedVersion: 1, contentHash: 'c'.repeat(64) },
      'recovery-process-key-0001',
    );
    const [first] = await repository.claimWork('voice.transcribe_extract', 'crashed-worker', 1, 10);
    await pool.query(
      "update public.voice_sessions set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [sessionId],
    );
    const [reclaimed] = await repository.claimWork(
      'voice.transcribe_extract',
      'replacement-worker',
      1,
      120,
    );
    expect(reclaimed).toMatchObject({ id: sessionId, attempt_count: 2 });
    if (!first || !reclaimed) throw new Error('AI_RECOVERY_CLAIM_MISSING');
    expect(reclaimed.claim_token).not.toBe(first.claim_token);
    await expect(
      repository.workInput(first.kind, first.id, first.claim_token),
    ).rejects.toMatchObject({ response: { code: 'AI_WORK_FENCE_INVALID' } });
    await repository.saveVoiceResult(reclaimed.id, reclaimed.claim_token, {
      provider: 'openai',
      model: 'openai/gpt-audio-mini',
      transcript: 'Paid 1 SAR',
      confidence: 0.9,
      language: 'en',
      payload: {
        schemaVersion: 1,
        type: 'transaction.create',
        amountMinor: '100',
        currency: 'SAR',
        categoryId: null,
        accountId,
        date: '2026-09-03',
        merchant: null,
        note: null,
        confidence: 0.9,
      },
    });

    const purges = await repository.claimPurges('purge-worker', 100, 120);
    const purge = purges.find(({ id }) => id === sessionId);
    expect(purge).toMatchObject({ id: sessionId });
    if (!purge) throw new Error('AI_PURGE_CLAIM_MISSING');
    await expect(repository.completePurge(purge.id, purge.purge_token, false)).resolves.toBe(true);
    const retry = (await repository.claimPurges('purge-worker-retry', 100, 120)).find(
      ({ id }) => id === sessionId,
    );
    if (!retry) throw new Error('AI_PURGE_RETRY_MISSING');
    await expect(repository.completePurge(retry.id, retry.purge_token, true)).resolves.toBe(true);
    expect(
      (
        await pool.query<{ storage_ref: string | null }>(
          'select storage_ref from public.voice_sessions where id=$1',
          [sessionId],
        )
      ).rows[0]?.storage_ref,
    ).toBeNull();

    await pool.query(
      "update private.ai_usage_events set created_at=clock_timestamp()-interval '3 hours' where user_id=$1",
      [userId],
    );
    await expect(repository.rollup(100)).resolves.toMatchObject({ released: 1 });
  });
});
