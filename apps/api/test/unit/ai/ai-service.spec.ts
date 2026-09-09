import { AiService } from '../../../src/ai/ai.service';

const owner = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
const proposalId = '99000000-0000-4000-8000-000000000011';
const transactionId = '99000000-0000-4000-8000-000000000012';
const accountId = '99000000-0000-4000-8000-000000000013';

describe('AiService financial action bridge', () => {
  const repository = {
    operationId: jest.fn(() => '99000000-0000-4000-8000-000000000014'),
    claimAction: jest.fn(),
    completeAction: jest.fn(() => Promise.resolve({})),
    setConsent: jest.fn(() =>
      Promise.resolve({ resource: { policyVersion: 'assistant-privacy-v1', version: 4 } }),
    ),
  };
  const ledger = {
    createTransaction: jest.fn<
      Promise<unknown>,
      [{ principal: typeof owner; body: Record<string, unknown>; idempotencyKey?: string }]
    >(),
    reviseTransaction: jest.fn(),
  };
  const service = new AiService(
    repository as never,
    {} as never,
    ledger as never,
    {} as never,
    {} as never,
    { getRequired: jest.fn(() => false) } as never,
  );

  it('maps a voice proposal to the existing ledger command exactly once', async () => {
    repository.claimAction.mockResolvedValueOnce({
      id: proposalId,
      actionType: 'transaction.create',
      decisionToken: '99000000-0000-4000-8000-000000000015',
      replayed: false,
      payload: {
        amountMinor: '1250',
        currency: 'SAR',
        accountId,
        categoryId: null,
        date: '2026-09-03',
        merchant: 'Shop',
        note: null,
      },
    });
    ledger.createTransaction.mockResolvedValueOnce({
      transaction: { transaction: { id: transactionId } },
    });
    await expect(
      service.confirmVoice(owner, proposalId, { expectedVersion: 1 }, 'voice-confirm-key-0001'),
    ).resolves.toMatchObject({ resourceId: transactionId, status: 'executed', replayed: false });
    expect(ledger.createTransaction).toHaveBeenCalledTimes(1);
    const call = ledger.createTransaction.mock.calls[0]?.[0] as
      { principal?: unknown; body?: Record<string, unknown> } | undefined;
    expect(call).toMatchObject({
      principal: owner,
      body: { kind: 'expense', amountMinor: 1250, accountId, source: 'voice' },
    });
    expect(repository.completeAction).toHaveBeenCalledWith(
      owner,
      proposalId,
      expect.any(String),
      transactionId,
    );
  });

  it('returns a durable replay without invoking a domain command', async () => {
    repository.claimAction.mockResolvedValueOnce({
      actionType: 'transaction.create',
      resourceId: transactionId,
      replayed: true,
    });
    await expect(
      service.confirmVoice(owner, proposalId, { expectedVersion: 1 }, 'voice-confirm-key-0001'),
    ).resolves.toMatchObject({ resourceId: transactionId, replayed: true });
    expect(ledger.createTransaction).not.toHaveBeenCalled();
  });

  it('reuses the domain idempotency key when linking must be retried', async () => {
    repository.claimAction
      .mockResolvedValueOnce({
        id: proposalId,
        actionType: 'transaction.create',
        decisionToken: '99000000-0000-4000-8000-000000000015',
        replayed: false,
        payload: {
          amountMinor: '1250',
          currency: 'SAR',
          accountId,
          categoryId: null,
          date: '2026-09-03',
          merchant: null,
          note: null,
        },
      })
      .mockResolvedValueOnce({
        id: proposalId,
        actionType: 'transaction.create',
        decisionToken: '99000000-0000-4000-8000-000000000016',
        replayed: false,
        payload: {
          amountMinor: '1250',
          currency: 'SAR',
          accountId,
          categoryId: null,
          date: '2026-09-03',
          merchant: null,
          note: null,
        },
      });
    ledger.createTransaction.mockResolvedValue({
      transaction: { transaction: { id: transactionId } },
    });
    repository.completeAction
      .mockRejectedValueOnce(new Error('LINK_TEMPORARILY_UNAVAILABLE'))
      .mockResolvedValueOnce({});
    await expect(
      service.confirmVoice(owner, proposalId, { expectedVersion: 1 }, 'voice-confirm-key-0001'),
    ).rejects.toThrow('LINK_TEMPORARILY_UNAVAILABLE');
    await expect(
      service.confirmVoice(owner, proposalId, { expectedVersion: 1 }, 'voice-confirm-key-0001'),
    ).resolves.toMatchObject({ resourceId: transactionId, status: 'executed' });
    expect(ledger.createTransaction.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      `ai-action:${proposalId}:v1`,
      `ai-action:${proposalId}:v1`,
    ]);
  });

  it('passes the consent version through grant and revoke commands', async () => {
    await expect(
      service.grantConsent(
        owner,
        { policyVersion: 'assistant-privacy-v1', accepted: true, expectedVersion: 3 },
        'grant-consent-key',
      ),
    ).resolves.toMatchObject({ version: 4 });
    await service.revokeConsent(owner, 4, 'revoke-consent-key');

    expect(repository.setConsent.mock.calls).toEqual([
      [owner, 'assistant-privacy-v1', true, 3, 'grant-consent-key'],
      [owner, 'assistant-privacy-v1', false, 4, 'revoke-consent-key'],
    ]);
  });
});
