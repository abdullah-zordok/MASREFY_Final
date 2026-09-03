import { readFileSync } from 'node:fs';

describe('tracking ledger ownership boundary', () => {
  it('uses LedgerService and cannot call ledger storage or private commands directly', () => {
    const service = readFileSync('src/tracking/tracking.service.ts', 'utf8');
    const worker = readFileSync('src/tracking/tracking.worker.ts', 'utf8');
    const production = `${service}\n${worker}`;
    expect(production).toContain('LedgerService');
    expect(production).not.toMatch(
      /LedgerRepository|private\.post_transaction|insert\s+into\s+public\.transactions/i,
    );
  });
});
