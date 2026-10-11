import { voiceBatchResultSchema } from './voice-batch-api-service';

const tx = '33333333-3333-4333-8333-333333333333';
const receipt = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  batchId: '22222222-2222-4222-8222-222222222222',
  status: 'completed',
  transactionIds: [tx],
  addedCount: 1,
  ledgerVersion: 1
};
const outcomes = [
  {
    ordinal: 0,
    kind: 'expense',
    status: 'committed',
    reason: null,
    transactionId: tx
  },
  {
    ordinal: 1,
    kind: null,
    status: 'skipped',
    reason: 'ambiguous_account',
    transactionId: null
  },
  {
    ordinal: 2,
    kind: null,
    status: 'skipped',
    reason: 'unsupported_event',
    transactionId: null
  }
];
it('accepts strict negotiated outcomes while retaining legacy receipts', () => {
  expect(voiceBatchResultSchema.parse(receipt)).toEqual(receipt);
  expect(
    voiceBatchResultSchema.parse({ ...receipt, outcomes }).outcomes
  ).toEqual(outcomes);
});
it.each(
  [
    [{ ...outcomes[0], transcript: 'private audio' }],
    [{ ...outcomes[0], status: 'skipped', reason: 'ambiguous_account' }],
    [{ ...outcomes[0], transactionId: null }],
    [{ ...outcomes[0], reason: 'unknown provider text' }],
    [outcomes[0], outcomes[0]],
    [outcomes[1], outcomes[0]],
    [outcomes[1]],
    [{ ...outcomes[0], ordinal: 10 }],
    [{ ...outcomes[0], status: 'execution_failed', transactionId: tx }]
  ].map((invalid) => ({ invalid }))
)(
  'rejects untruthful, unordered, private, or unsupported event results %#',
  ({ invalid }) => {
    expect(
      voiceBatchResultSchema.safeParse({ ...receipt, outcomes: invalid })
        .success
    ).toBe(false);
  }
);
