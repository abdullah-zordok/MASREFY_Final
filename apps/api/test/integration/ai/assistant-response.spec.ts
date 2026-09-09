import { randomUUID } from 'node:crypto';
import { AiRepository } from '../../../src/ai/ai.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('assistant consent and response lifecycle', () => {
  const pool = createLivePool(),
    repository = new AiRepository(pool);
  const userId = `ai_assistant_${randomUUID()}`,
    adminId = `ai_admin_${randomUUID()}`;
  const principal = { userId, sessionId: 'assistant-session', factorAgeSeconds: 0 };
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active'),($2,'active')", [
      userId,
      adminId,
    ]);
    await pool.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
      adminId,
    ]);
    await pool.query(
      "update private.ai_prompt_versions set status='retired' where workload='financial_assistant' and status='approved'",
    );
    await pool.query(
      "update private.ai_prompt_versions set status='approved',evaluation_passed=true,approved_by=$1,published_at=clock_timestamp() where id='99030000-0000-4000-8000-000000000003'",
      [adminId],
    );
    await pool.query(
      "update private.ai_feature_routes set enabled=true where workload='financial_assistant'",
    );
  });
  afterAll(async () => {
    await pool.query(
      "update private.ai_feature_routes set enabled=false where workload='financial_assistant'",
    );
    await pool.query(
      "update private.ai_prompt_versions set status='draft',evaluation_passed=false,approved_by=null,published_at=null where id='99030000-0000-4000-8000-000000000003'",
    );
    await pool.onModuleDestroy();
  });

  it('enforces consent, persists minimized evidence, and cancels queued work on revocation', async () => {
    await expect(repository.getConsent(principal, 'assistant-privacy-v1')).resolves.toMatchObject({
      granted: false,
      version: 1,
    });
    await expect(
      pool.query(
        "insert into public.assistant_consents(user_id,policy_version) values($1,'assistant-privacy-v0')",
        [userId],
      ),
    ).rejects.toThrow();
    const consent = await repository.setConsent(
      principal,
      'assistant-privacy-v1',
      true,
      1,
      'assistant-consent-key-0001',
    );
    expect(Reflect.get(consent, 'resource')).toMatchObject({ granted: true, version: 2 });
    const created = await repository.createConversation(
      principal,
      'Budget help',
      'assistant-conversation-key-0001',
    );
    const conversation = Reflect.get(created, 'resource') as Record<string, unknown>;
    const queued = await repository.enqueueMessage(
      principal,
      String(conversation.id),
      { content: 'How is my budget?', contextScope: ['budgets'], responseMode: 'async' },
      'assistant-message-key-0001',
    );
    const request = Reflect.get(queued, 'resource') as Record<string, unknown>;
    const [claim] = await repository.claimWork(
      'assistant.respond',
      'assistant-test-worker',
      1,
      120,
    );
    if (!claim) throw new Error('AI_ASSISTANT_CLAIM_MISSING');
    expect(await repository.workInput(claim.kind, claim.id, claim.claim_token)).toMatchObject({
      content: 'How is my budget?',
      evidence: [{ alias: 'BUDGETS-1', data: { count: 0 } }],
    });
    const saved = await repository.saveAssistantResult(claim.id, claim.claim_token, {
      provider: 'openai',
      model: 'openai/gpt-5.2',
      content: 'No budgets yet.',
      evidence: [{ kind: 'budgets', alias: 'BUDGETS-1', version: 0 }],
      preview: null,
    });
    expect(typeof saved.messageId).toBe('string');
    expect(saved.previewId).toBeNull();
    expect(await repository.messageResult(principal, String(request.id))).toMatchObject({
      status: 'completed',
      response: { content: 'No budgets yet.' },
    });
    await repository.enqueueMessage(
      principal,
      String(conversation.id),
      { content: 'Try again', contextScope: ['budgets'], responseMode: 'stream' },
      'assistant-message-key-0002',
    );
    const revoked = await repository.setConsent(
      principal,
      'assistant-privacy-v1',
      false,
      2,
      'assistant-consent-key-0002',
    );
    expect(Reflect.get(revoked, 'resource')).toMatchObject({ granted: false, version: 3 });
    await expect(
      repository.setConsent(
        principal,
        'assistant-privacy-v1',
        true,
        2,
        'assistant-consent-key-stale',
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await repository.listMessages(
          principal,
          String(conversation.id),
          { time: null, id: null },
          10,
        )
      ).some((item) => item.workStatus === 'cancelled'),
    ).toBe(true);
  });
});
