import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVoice, processVoice } from '../../../src/ai/ai.dto';
import { parseVoiceProposal } from '../../../src/ai/ai.schemas';

describe('Phase 09 voice security boundary', () => {
  it('rejects media abuse, unknown fields, and untrusted proposal controls', () => {
    expect(() =>
      createVoice({ locale: 'en', durationMs: 120001, contentType: 'audio/wav', sizeBytes: 44 }),
    ).toThrow();
    expect(() =>
      processVoice({
        uploadCompleted: true,
        expectedVersion: 1,
        contentHash: 'a'.repeat(64),
        model: 'attacker/model',
      }),
    ).toThrow();
    expect(() =>
      parseVoiceProposal({
        schemaVersion: 1,
        type: 'transaction.create',
        amountMinor: '1',
        currency: 'SAR',
        categoryId: null,
        accountId: null,
        date: '2026-09-03',
        merchant: null,
        note: null,
        confidence: 1,
        sql: 'drop table transactions',
      }),
    ).toThrow('AI_SCHEMA_INVALID');
  });

  it('keeps owner checks, private storage, and ledger-only confirmation in the implementation', () => {
    const functions = readFileSync(
      resolve(
        process.cwd(),
        '..',
        '..',
        'supabase/migrations/20260903090200_phase09_ai_functions.sql',
      ),
      'utf8',
    );
    const access = readFileSync(
      resolve(
        process.cwd(),
        '..',
        '..',
        'supabase/migrations/20260903090300_phase09_ai_access_seeds.sql',
      ),
      'utf8',
    );
    const service = readFileSync('src/ai/ai.service.ts', 'utf8');
    expect(functions).toContain('perform private.ai_assert_owner(p_user_id)');
    expect(access).toContain("values('voice-temp','voice-temp',false,12582912");
    expect(service).toContain('this.ledger.createTransaction');
    expect(service).not.toMatch(/insert\s+into\s+public\.transactions/i);
  });
});
