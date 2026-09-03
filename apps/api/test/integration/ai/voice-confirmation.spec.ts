import { randomUUID } from 'node:crypto';
import { AiRepository } from '../../../src/ai/ai.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('voice proposal and confirmation lifecycle', () => {
  const pool = createLivePool();
  const repository = new AiRepository(pool);
  const userId = `ai_voice_${randomUUID()}`;
  const adminId = `ai_admin_${randomUUID()}`;
  const accountId = randomUUID();
  const principal = { userId, sessionId: 'voice-session', factorAgeSeconds: 0 };

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
        [userId, adminId],
      );
      await client.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
        adminId,
      ]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Voice account','bank','SAR')",
        [accountId, userId],
      );
      await client.query(
        "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where workload='voice_transcription'",
        [adminId],
      );
      await client.query(
        "update private.ai_feature_routes set enabled=true where workload='voice_transcription'",
      );
      await client.query('commit');
    });
  });
  afterAll(async () => {
    await pool.onModuleDestroy();
  });

  it('queues one fenced worker item, persists an inert proposal, and replays one execution', async () => {
    const created = await repository.createVoiceSession(
      principal,
      { locale: 'en', durationMs: 1000, contentType: 'audio/wav', sizeBytes: 44 },
      'voice-create-key-0001',
    );
    const session = Reflect.get(created, 'resource') as Record<string, unknown>;
    await repository.processVoiceSession(
      principal,
      String(session.id),
      { expectedVersion: 1, contentHash: 'a'.repeat(64) },
      'voice-process-key-0001',
    );
    const [claim] = await repository.claimWork(
      'voice.transcribe_extract',
      'voice-test-worker',
      1,
      120,
    );
    expect(claim).toMatchObject({ id: session.id, user_id: userId, attempt_count: 1 });
    if (!claim) throw new Error('AI_VOICE_CLAIM_MISSING');
    const input = await repository.workInput(claim.kind, claim.id, claim.claim_token);
    expect(input.contentType).toBe('audio/wav');
    expect(input.storageRef).toEqual(expect.stringMatching(/^voice\//));
    const saved = await repository.saveVoiceResult(claim.id, claim.claim_token, {
      provider: 'openai',
      model: 'openai/gpt-audio-mini',
      transcript: 'Paid 12.50 at Shop',
      confidence: 0.9,
      language: 'en',
      payload: {
        schemaVersion: 1,
        type: 'transaction.create',
        amountMinor: '1250',
        currency: 'SAR',
        categoryId: null,
        accountId,
        date: '2026-09-03',
        merchant: 'Shop',
        note: null,
        confidence: 0.9,
      },
    });
    const proposalId = String(saved.proposalId);
    expect(await repository.getVoiceProposal(principal, String(session.id))).toMatchObject({
      id: proposalId,
      status: 'validated',
    });

    const operationId = repository.operationId(
      principal,
      `ai.action.confirm:${proposalId}`,
      'voice-confirm-key-0001',
    );
    const decision = await repository.claimAction(principal, proposalId, 1, operationId);
    const recovered = await repository.claimAction(principal, proposalId, 1, operationId);
    expect(recovered).toMatchObject({ replayed: false, operationId });
    expect(recovered.decisionToken).not.toBe(decision.decisionToken);
    const transactionId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at,source) values($1,$2,'expense','confirmed',1250,'SAR','Shop','2026-09-03T12:00:00Z','voice')",
        [transactionId, userId],
      );
      await client.query('commit');
    });
    await repository.completeAction(
      principal,
      proposalId,
      String(recovered.decisionToken),
      transactionId,
    );
    await expect(
      repository.claimAction(principal, proposalId, 1, operationId),
    ).resolves.toMatchObject({ resourceId: transactionId, replayed: true });
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from public.transactions where id=$1',
          [transactionId],
        )
      ).rows[0]?.count,
    ).toBe('1');
  });
});
