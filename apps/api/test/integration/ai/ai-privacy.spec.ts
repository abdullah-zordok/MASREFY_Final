import { randomUUID } from 'node:crypto';
import { AiPrivacyHandler } from '../../../src/ai/ai-privacy.handler';
import type { ExportEntry } from '../../../src/security/privacy-handlers';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI privacy export and deletion', () => {
  const pool = createLivePool(),
    userId = `ai_privacy_${randomUUID()}`;
  const userMessageId = randomUUID(),
    assistantMessageId = randomUUID();
  const storage = { delete: jest.fn(() => Promise.resolve()) };
  const handler = new AiPrivacyHandler(pool, storage as never);
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [userId]);
    await pool.query(
      "insert into public.assistant_conversations(user_id,title) select $1,'Conversation '||n from generate_series(1,501) n",
      [userId],
    );
    await pool.query(
      `insert into public.voice_sessions(id,user_id,locale,storage_ref,content_type,size_bytes,duration_ms,expires_at,operation_id)
      select md5($1||':privacy-session:'||n)::uuid,$1,'en','voice/'||md5($1||':privacy-session:'||n)::uuid||'/'||md5($1||':privacy-object:'||n)::uuid,
        'audio/wav',44,1000,now()+interval '24 hours',md5($1||':privacy-operation:'||n)::uuid from generate_series(1,1001) n`,
      [userId],
    );
    await pool.query(
      `insert into public.voice_transcripts(user_id,session_id,provider,model,text_redacted,language)
      select $1,id,'openai','openai/gpt-audio-mini','redacted transcript','en' from public.voice_sessions where user_id=$1 order by id limit 1`,
      [userId],
    );
    await pool.query(
      `insert into public.voice_proposals(user_id,session_id,schema_version,proposal_type,payload,status,expires_at)
      select $1,id,1,'transaction.create','{}','validated',now()+interval '10 minutes' from public.voice_sessions where user_id=$1 order by id limit 1`,
      [userId],
    );
    await pool.query(
      `insert into public.voice_proposal_fields(user_id,proposal_id,field_name,value_json)
      select $1,id,'amountMinor','"1250"' from public.voice_proposals where user_id=$1 limit 1`,
      [userId],
    );
    await pool.query(
      "insert into public.assistant_consents(user_id,policy_version) values($1,'assistant-privacy-v1')",
      [userId],
    );
    await pool.query(
      `insert into public.assistant_messages(id,user_id,conversation_id,role,content_redacted,work_status,response_mode,operation_id)
      select $2,$1,id,'user','redacted question','completed','async',$3 from public.assistant_conversations where user_id=$1 order by id limit 1`,
      [userId, userMessageId, randomUUID()],
    );
    await pool.query(
      `insert into public.assistant_messages(id,user_id,conversation_id,reply_to_message_id,role,content_redacted)
      select $3,$1,id,$2,'assistant','redacted answer' from public.assistant_conversations where user_id=$1 order by id limit 1`,
      [userId, userMessageId, assistantMessageId],
    );
    await pool.query(
      "insert into public.assistant_response_snapshots(user_id,message_id,schema_version,evidence_refs,model,provider) values($1,$2,1,'[]','test/model','openai')",
      [userId, assistantMessageId],
    );
    await pool.query(
      "insert into public.assistant_action_previews(user_id,message_id,schema_version,action_type,payload,status,expires_at) values($1,$2,1,'transaction.create','{}','validated',now()+interval '10 minutes')",
      [userId, assistantMessageId],
    );
    await pool.query(
      'insert into public.assistant_feedback(user_id,message_id,rating) values($1,$2,1)',
      [userId, assistantMessageId],
    );
    await pool.query(
      "insert into public.ai_response_reports(user_id,message_id,report_type,reason) values($1,$2,'privacy','Privacy regression fixture')",
      [userId, assistantMessageId],
    );
    await pool.query(
      "insert into private.ai_usage_events(user_id,workload,model,provider,request_id) values($1,'financial_assistant','test/model','openai',$2)",
      [userId, randomUUID()],
    );
    await pool.query(
      "insert into private.ai_failure_events(user_id,workload,failure_code,request_id) values($1,'financial_assistant','AI_TEST_FAILURE',$2)",
      [userId, randomUUID()],
    );
  });
  afterAll(async () => {
    await pool.onModuleDestroy();
  });

  it('exports equal-timestamp rows without cursor loss and deletes owner AI data restartably', async () => {
    const files: ExportEntry[] = [];
    for await (const entry of handler.export({ userId } as never)) files.push(entry);
    expect(files.map(({ path }) => path)).toEqual([
      'ai/voice_sessions.ndjson',
      'ai/voice_transcripts.ndjson',
      'ai/voice_proposals.ndjson',
      'ai/voice_proposal_fields.ndjson',
      'ai/voice_category_preferences.ndjson',
      'ai/assistant_consents.ndjson',
      'ai/conversations.ndjson',
      'ai/messages.ndjson',
      'ai/assistant_snapshots.ndjson',
      'ai/assistant_previews.ndjson',
      'ai/assistant_feedback.ndjson',
      'ai/response_reports.ndjson',
    ]);
    const conversations = files.find((entry) => entry.path.endsWith('conversations.ndjson'));
    if (!conversations) throw new Error('AI_CONVERSATION_EXPORT_MISSING');
    let count = 0;
    for await (const chunk of conversations.stream)
      count += Buffer.from(chunk).toString('utf8').trim().split('\n').filter(Boolean).length;
    expect(count).toBe(501);
    const outcome = await handler.deleteAccount({ userId } as never);
    expect(outcome.deletedCount).toBeGreaterThan(0);
    expect(storage.delete).toHaveBeenCalledTimes(1001);
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from public.assistant_conversations where user_id=$1',
          [userId],
        )
      ).rows[0]?.count,
    ).toBe('0');
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from public.voice_sessions where user_id=$1 and (storage_ref is not null or deleted_at is null)',
          [userId],
        )
      ).rows[0]?.count,
    ).toBe('0');
    expect(
      (
        await pool.query<{ count: string }>(
          `select sum(count)::text count from (
      select count(*) from public.voice_transcripts where user_id=$1 union all select count(*) from public.voice_proposals where user_id=$1
      union all select count(*) from public.voice_proposal_fields where user_id=$1 union all select count(*) from public.assistant_consents where user_id=$1
      union all select count(*) from public.assistant_messages where user_id=$1 union all select count(*) from public.assistant_response_snapshots where user_id=$1
      union all select count(*) from public.assistant_action_previews where user_id=$1 union all select count(*) from public.assistant_feedback where user_id=$1
      union all select count(*) from public.ai_response_reports where user_id=$1) rows`,
          [userId],
        )
      ).rows[0]?.count,
    ).toBe('0');
    expect(outcome.anonymizedCount).toBe(2);
    expect(
      (
        await pool.query<{ count: string }>(
          `select ((select count(*) from private.ai_usage_events where user_id=$1)+(select count(*) from private.ai_failure_events where user_id=$1))::text count`,
          [userId],
        )
      ).rows[0]?.count,
    ).toBe('0');
  });
});
