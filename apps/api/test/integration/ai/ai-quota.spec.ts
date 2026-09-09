import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { AiRepository } from '../../../src/ai/ai.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI rolling quota concurrency', () => {
  const pool = createLivePool(),
    repository = new AiRepository(pool);
  const userId = `ai_quota_${randomUUID()}`,
    adminId = `ai_quota_admin_${randomUUID()}`,
    principal = { userId, sessionId: 'quota-session', factorAgeSeconds: 0 };
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active'),($2,'active')", [
      userId,
      adminId,
    ]);
    await pool.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
      adminId,
    ]);
    await pool.query(
      "insert into public.assistant_consents(user_id,policy_version) values($1,'assistant-privacy-v1')",
      [userId],
    );
    await pool.query(
      "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where workload in ('voice_transcription','financial_assistant')",
      [adminId],
    );
    await pool.query(
      "update private.ai_feature_routes set enabled=true where workload in ('voice_transcription','financial_assistant')",
    );
  });
  afterAll(async () => {
    await pool.query(
      "update public.voice_sessions set status='failed',failure_code='AI_TEST_CLEANUP' where user_id=$1 and status in ('uploaded','processing')",
      [userId],
    );
    await pool.query(
      "update private.ai_feature_routes set enabled=false where workload in ('voice_transcription','financial_assistant')",
    );
    await pool.query(
      "update private.ai_prompt_versions set status='draft',evaluation_passed=false,approved_by=null,published_at=null where workload in ('voice_transcription','financial_assistant')",
    );
    await pool.onModuleDestroy();
  });

  it('admits exactly five concurrent accepted requests and replays without consuming another slot', async () => {
    const anyString: unknown = expect.any(String);
    await expect(repository.getAssistantAvailability(principal)).resolves.toMatchObject({
      status: 'available',
      limit: 5,
      used: 0,
      remaining: 5,
      resetsAt: anyString,
    });
    const sessions = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        repository.createVoiceSession(
          principal,
          { locale: 'en', durationMs: 1000, contentType: 'audio/wav', sizeBytes: 44 },
          `quota-create-key-000${index.toString()}`,
        ),
      ),
    );
    const settled = await Promise.allSettled(
      sessions.map((item, index) =>
        repository.processVoiceSession(
          principal,
          String((Reflect.get(item, 'resource') as Record<string, unknown>).id),
          { expectedVersion: 1, contentHash: index.toString().repeat(64) },
          `quota-process-key-000${index.toString()}`,
        ),
      ),
    );
    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(5);
    const failure: unknown = settled.find(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    )?.reason;
    if (!(failure instanceof HttpException)) throw new Error('AI_QUOTA_FAILURE_MISSING');
    expect(failure.getStatus()).toBe(429);
    expect(failure.getResponse()).toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      limit: 5,
      used: 5,
      resetsAt: anyString,
    });
    await expect(repository.getAssistantAvailability(principal)).resolves.toMatchObject({
      status: 'limit_reached',
      limit: 5,
      used: 5,
      remaining: 0,
      resetsAt: anyString,
    });
    const successful = settled.findIndex((item) => item.status === 'fulfilled');
    const replaySession = sessions[successful];
    if (!replaySession) throw new Error('AI_QUOTA_SUCCESS_MISSING');
    await expect(
      repository.processVoiceSession(
        principal,
        String((Reflect.get(replaySession, 'resource') as Record<string, unknown>).id),
        { expectedVersion: 1, contentHash: successful.toString().repeat(64) },
        `quota-process-key-000${successful.toString()}`,
      ),
    ).resolves.toMatchObject({ replayed: true });
  });
});
