import { HttpException } from '@nestjs/common';

import { buildLedgerEvent } from '../../../src/ledger/ledger.events';
import { LedgerService } from '../../../src/ledger/ledger.service';

const principal = { userId: 'user_1', sessionId: 'session_1', factorAgeSeconds: 120 };
const body = {
  kind: 'income',
  amountMinor: 50000,
  currency: 'SAR',
  accountId: '10000000-0000-4000-8000-000000000001',
  title: 'Salary',
  occurredAt: '2026-08-30T08:00:00.000Z',
};
const response = { transaction: { id: 'tx' }, balances: [], ledgerVersion: 7, requestId: 'req_1' };

function harness(thresholds: Record<string, number> | undefined = { SAR: 50000 }) {
  const repository = {
    mutate: jest.fn().mockResolvedValue(response),
    replayCompleted: jest.fn().mockResolvedValue(undefined),
    effect: jest
      .fn()
      .mockResolvedValue({ amountMinor: 50000, feeMinor: 0, currency: 'SAR', version: 3 }),
    createAccount: jest.fn().mockResolvedValue({ account: { id: 'a' }, openingTransactionId: 't' }),
  };
  const security = { consumeRateLimit: jest.fn().mockResolvedValue(true) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS' ? thresholds : undefined,
    ),
    getRequired: jest.fn(() => 600),
  };
  return {
    service: new LedgerService(repository as never, security as never, config as never),
    repository,
    security,
  };
}

describe('LedgerService create transaction', () => {
  it('rate-limits, applies the configured currency threshold, and delegates one normalized command', async () => {
    const { service, repository, security } = harness();
    await expect(
      service.createTransaction({
        principal,
        body,
        idempotencyKey: 'request-key',
        requestId: 'req_1',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).resolves.toBe(response);
    expect(security.consumeRateLimit).toHaveBeenCalledWith(principal, 'ledger.write', 60, 60, null);
    expect(repository.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'createTransaction',
        scope: 'ledger.transaction.create',
        principal,
        idempotencyKey: 'request-key',
        requestId: 'req_1',
        status: 201,
        command: {
          kind: 'income',
          amountMinor: 50000,
          currency: 'SAR',
          accountId: body.accountId,
          categoryId: null,
          title: 'Salary',
          merchant: null,
          paymentMethod: null,
          note: null,
          occurredAt: body.occurredAt,
          source: 'manual',
          externalRef: null,
        },
      }),
    );
  });

  it.each([null, 601])(
    'fails closed on missing or stale factor age %s at threshold',
    async (factorAgeSeconds) => {
      const { service, repository } = harness();
      await expect(
        service.createTransaction({
          principal: { ...principal, factorAgeSeconds },
          body,
          idempotencyKey: 'request-key',
          requestId: 'req_1',
          now: new Date('2026-08-30T08:01:00Z'),
        }),
      ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
      expect(repository.mutate).not.toHaveBeenCalled();
    },
  );

  it('does not require recent auth below threshold or for an unconfigured currency', async () => {
    for (const candidate of [
      { ...body, amountMinor: 49999 },
      { ...body, currency: 'USD' },
    ]) {
      const { service } = harness();
      await expect(
        service.createTransaction({
          principal: { ...principal, factorAgeSeconds: null },
          body: candidate,
          idempotencyKey: 'request-key',
          requestId: 'req_1',
          now: new Date('2026-08-30T08:01:00Z'),
        }),
      ).resolves.toBe(response);
    }
  });

  it('rejects a rate-limited request before a money transaction', async () => {
    const { service, repository, security } = harness();
    security.consumeRateLimit.mockResolvedValue(false);
    await expect(
      service.createTransaction({
        principal,
        body,
        idempotencyKey: 'request-key',
        requestId: 'req_1',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(repository.mutate).not.toHaveBeenCalled();
  });
});

describe('ledger event allowlist', () => {
  it('builds a bounded redacted transaction-created event', () => {
    expect(
      buildLedgerEvent('transaction.created', {
        transactionId: '10000000-0000-4000-8000-000000000003',
        kind: 'income',
        accountIds: ['10000000-0000-4000-8000-000000000001'],
        version: 1,
        ledgerVersion: 7,
        occurredAt: '2026-08-30T08:00:00.000Z',
        requestId: 'req_1',
      }),
    ).toEqual({
      transactionId: '10000000-0000-4000-8000-000000000003',
      kind: 'income',
      accountIds: ['10000000-0000-4000-8000-000000000001'],
      version: 1,
      ledgerVersion: 7,
      occurredAt: '2026-08-30T08:00:00.000Z',
      requestId: 'req_1',
    });
  });

  it.each([
    'amountMinor',
    'balance',
    'note',
    'merchant',
    'paymentMethod',
    'reason',
    'idempotencyKey',
    'requestHash',
  ])('rejects sensitive field %s', (field) => {
    expect(() =>
      buildLedgerEvent('transaction.created', {
        ...body,
        transactionId: '10000000-0000-4000-8000-000000000003',
        accountIds: [body.accountId],
        version: 1,
        ledgerVersion: 1,
        requestId: 'req_1',
        [field]: 'secret',
      }),
    ).toThrow('LEDGER_EVENT_INVALID');
  });
  it.each([
    ['transfer.created', 'transfer'],
    ['transaction.refunded', 'refund'],
    ['transaction.reversed', 'reversal'],
  ] as const)('builds the Master Plan %s event', (type, kind) => {
    expect(
      buildLedgerEvent(type, {
        transactionId: '10000000-0000-4000-8000-000000000003',
        kind,
        accountIds: ['10000000-0000-4000-8000-000000000001'],
        version: 1,
        ledgerVersion: 7,
        occurredAt: '2026-08-30T08:00:00.000Z',
        requestId: 'req_1',
      }),
    ).toMatchObject({ kind, ledgerVersion: 7 });
  });
  it('builds the Master Plan reconciliation failure event without financial values', () => {
    expect(
      buildLedgerEvent('ledger.reconciliation_failed', {
        accountId: '10000000-0000-4000-8000-000000000001',
        mismatchKind: 'confirmed',
        ledgerVersion: 7,
        observedAt: '2026-08-30T08:00:00.000Z',
        requestId: 'job_1',
      }),
    ).toEqual({
      accountId: '10000000-0000-4000-8000-000000000001',
      mismatchKind: 'confirmed',
      ledgerVersion: 7,
      observedAt: '2026-08-30T08:00:00.000Z',
      requestId: 'job_1',
    });
  });
  it('builds one redacted balance-change event for sorted touched accounts', () => {
    expect(
      buildLedgerEvent('balance.changed', {
        transactionId: '10000000-0000-4000-8000-000000000003',
        accountIds: [
          '10000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000004',
        ],
        ledgerVersion: 7,
        requestId: 'req_1',
      }),
    ).toEqual({
      transactionId: '10000000-0000-4000-8000-000000000003',
      accountIds: ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'],
      ledgerVersion: 7,
      requestId: 'req_1',
    });
  });
  it.each([
    ['10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'],
    ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'],
  ])('rejects unsorted or duplicate balance-change account IDs', (...accountIds) => {
    expect(() =>
      buildLedgerEvent('balance.changed', {
        transactionId: '10000000-0000-4000-8000-000000000003',
        accountIds,
        ledgerVersion: 7,
        requestId: 'req_1',
      }),
    ).toThrow('LEDGER_EVENT_INVALID');
  });
  it('allows only fixed delete and restore lifecycle metadata', () => {
    expect(
      buildLedgerEvent('transaction.deleted', {
        transactionId: '10000000-0000-4000-8000-000000000003',
        version: 2,
        undoExpiresAt: '2026-08-30T08:00:30.000Z',
        ledgerVersion: 3,
        requestId: 'req',
      }),
    ).toEqual({
      transactionId: '10000000-0000-4000-8000-000000000003',
      version: 2,
      undoExpiresAt: '2026-08-30T08:00:30.000Z',
      ledgerVersion: 3,
      requestId: 'req',
    });
    expect(
      buildLedgerEvent('transaction.restored', {
        transactionId: '10000000-0000-4000-8000-000000000003',
        version: 3,
        ledgerVersion: 4,
        requestId: 'req',
      }),
    ).toEqual({
      transactionId: '10000000-0000-4000-8000-000000000003',
      version: 3,
      ledgerVersion: 4,
      requestId: 'req',
    });
  });
});

describe('LedgerService transfer', () => {
  const transfer = {
    sourceAccountId: body.accountId,
    destinationAccountId: '10000000-0000-4000-8000-000000000004',
    amountMinor: 49990,
    feeMinor: 10,
    currency: 'SAR',
    occurredAt: body.occurredAt,
    title: 'Move',
  };
  it('applies recent auth to the amount plus fee and delegates deterministic transfer data', async () => {
    const { service, repository } = harness();
    await expect(
      service.transfer({
        principal,
        body: transfer,
        idempotencyKey: 'transfer-key-1',
        requestId: 'req_2',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).resolves.toBe(response);
    expect(repository.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'transfer',
        scope: 'ledger.transfer.create',
        status: 201,
        command: {
          sourceAccountId: body.accountId,
          destinationAccountId: '10000000-0000-4000-8000-000000000004',
          amountMinor: 49990,
          currency: 'SAR',
          feeMinor: 10,
          feeAccountId: body.accountId,
          occurredAt: body.occurredAt,
          title: 'Move',
          note: null,
        },
      }),
    );
  });
  it('fails closed at the configured total effect and validates before repository access', async () => {
    const { service, repository } = harness();
    await expect(
      service.transfer({
        principal: { ...principal, factorAgeSeconds: 601 },
        body: transfer,
        idempotencyKey: 'transfer-key-1',
        requestId: 'req_2',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
    await expect(
      service.transfer({
        principal,
        body: { ...transfer, destinationAccountId: body.accountId },
        idempotencyKey: 'transfer-key-1',
        requestId: 'req_2',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(repository.mutate).not.toHaveBeenCalled();
  });
});

describe('LedgerService revision', () => {
  const revision = { expectedVersion: 3, reason: 'Correction', amountMinor: 60000 };
  it('checks the current version/effect and delegates a fixed patch', async () => {
    const { service, repository } = harness();
    await expect(
      service.reviseTransaction({
        principal,
        transactionId: '10000000-0000-4000-8000-000000000003',
        body: revision,
        idempotencyKey: 'revise-key-1',
        requestId: 'req_3',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).resolves.toBe(response);
    expect(repository.effect).toHaveBeenCalledWith(
      principal,
      '10000000-0000-4000-8000-000000000003',
    );
    expect(repository.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'reviseTransaction',
        scope: 'ledger.transaction.revise',
        command: {
          transactionId: '10000000-0000-4000-8000-000000000003',
          expectedVersion: 3,
          reason: 'Correction',
          patch: { amountMinor: 60000 },
        },
      }),
    );
  });
  it('fails stale/current high-effect auth before write', async () => {
    const { service, repository } = harness();
    await expect(
      service.reviseTransaction({
        principal: { ...principal, factorAgeSeconds: 601 },
        transactionId: '10000000-0000-4000-8000-000000000003',
        body: revision,
        idempotencyKey: 'revise-key-1',
        requestId: 'req_3',
      }),
    ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
    repository.effect.mockResolvedValue({
      amountMinor: 10,
      feeMinor: 0,
      currency: 'SAR',
      version: 4,
    });
    await expect(
      service.reviseTransaction({
        principal,
        transactionId: '10000000-0000-4000-8000-000000000003',
        body: revision,
        idempotencyKey: 'revise-key-1',
        requestId: 'req_3',
      }),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 4 } });
    expect(repository.mutate).not.toHaveBeenCalled();
  });
});

describe('LedgerService linked compensation', () => {
  const transactionId = '10000000-0000-4000-8000-000000000003';
  it('checks current effect/version and delegates refund and reversal relationships', async () => {
    const { service, repository } = harness();
    await service.refundTransaction({
      principal,
      transactionId,
      body: {
        expectedVersion: 3,
        amountMinor: 100,
        occurredAt: '2026-08-30T08:00:00Z',
        reason: 'Return',
      },
      idempotencyKey: 'refund-key-1',
      requestId: 'req_4',
      now: new Date('2026-08-30T08:01:00Z'),
    });
    expect(repository.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'refundTransaction',
        scope: 'ledger.transaction.refund',
        command: {
          transactionId,
          expectedVersion: 3,
          amountMinor: 100,
          accountId: null,
          occurredAt: '2026-08-30T08:00:00.000Z',
          reason: 'Return',
        },
      }),
    );
    await service.reverseTransaction({
      principal,
      transactionId,
      body: { expectedVersion: 3, reason: 'Duplicate' },
      idempotencyKey: 'reverse-key-1',
      requestId: 'req_5',
      now: new Date('2026-08-30T08:01:00Z'),
    });
    expect(repository.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'reverseTransaction',
        scope: 'ledger.transaction.reverse',
        command: {
          transactionId,
          expectedVersion: 3,
          occurredAt: '2026-08-30T08:01:00.000Z',
          reason: 'Duplicate',
        },
      }),
    );
  });
  it('fails stale or high-value stale-auth before compensation', async () => {
    const { service, repository } = harness();
    await expect(
      service.refundTransaction({
        principal: { ...principal, factorAgeSeconds: 601 },
        transactionId,
        body: {
          expectedVersion: 3,
          amountMinor: 100,
          occurredAt: '2026-08-30T08:00:00Z',
          reason: 'Return',
        },
        idempotencyKey: 'refund-key-1',
        requestId: 'req_4',
        now: new Date('2026-08-30T08:01:00Z'),
      }),
    ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
    repository.effect.mockResolvedValue({ ...(await repository.effect()), version: 4 });
    await expect(
      service.reverseTransaction({
        principal,
        transactionId,
        body: { expectedVersion: 3, reason: 'x' },
        idempotencyKey: 'reverse-key-1',
        requestId: 'req_5',
      }),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 4 } });
  });
});

describe('LedgerService delete and restore', () => {
  const transactionId = '10000000-0000-4000-8000-000000000003';
  it('checks current effect and delegates fixed delete/restore commands', async () => {
    const { service, repository } = harness();
    await service.deleteTransaction({
      principal,
      transactionId,
      body: { expectedVersion: 3, reason: 'Mistake' },
      idempotencyKey: 'delete-key-1',
      requestId: 'req_6',
    });
    expect(repository.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'deleteTransaction',
        scope: 'ledger.transaction.delete',
        command: { transactionId, expectedVersion: 3, reason: 'Mistake' },
      }),
    );
    await service.restoreTransaction({
      principal,
      transactionId,
      body: { expectedVersion: 3 },
      idempotencyKey: 'restore-key-1',
      requestId: 'req_7',
    });
    expect(repository.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'restoreTransaction',
        scope: 'ledger.transaction.restore',
        command: { transactionId, expectedVersion: 3 },
      }),
    );
  });
  it('fails stale version or stale high-value auth before mutation', async () => {
    const { service, repository } = harness();
    await expect(
      service.deleteTransaction({
        principal: { ...principal, factorAgeSeconds: 601 },
        transactionId,
        body: { expectedVersion: 3, reason: 'x' },
        idempotencyKey: 'delete-key-1',
        requestId: 'req_6',
      }),
    ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
    repository.effect.mockResolvedValue({
      amountMinor: 10,
      feeMinor: 0,
      currency: 'SAR',
      version: 4,
    });
    await expect(
      service.restoreTransaction({
        principal,
        transactionId,
        body: { expectedVersion: 3 },
        idempotencyKey: 'restore-key-1',
        requestId: 'req_7',
      }),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 4 } });
    expect(repository.mutate).not.toHaveBeenCalled();
  });
});

describe('LedgerService account opening', () => {
  it('applies absolute configured recent auth and delegates the atomic account boundary', async () => {
    const { service, repository } = harness({ SAR: 500 });
    const reference = { createAccountOnClient: jest.fn() };
    const input = {
      operation: 'createAccount',
      principal,
      requestId: 'account-open',
      idempotencyKey: 'account-opening-key',
      query: {},
      params: {},
      body: { name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: -500 },
    };
    await expect(service.createAccount(input as never, reference as never)).resolves.toEqual({
      account: { id: 'a' },
      openingTransactionId: 't',
    });
    expect(repository.createAccount).toHaveBeenCalledWith(input, reference);
    await expect(
      service.createAccount(
        { ...input, principal: { ...principal, factorAgeSeconds: 601 } },
        reference as never,
      ),
    ).rejects.toMatchObject({ response: { code: 'RECENT_AUTH_REQUIRED' } });
  });
});

describe('LedgerService completed replay ordering', () => {
  const transactionId = '10000000-0000-4000-8000-000000000003';
  const common = {
    principal: { ...principal, factorAgeSeconds: null },
    idempotencyKey: 'completed-replay-key',
    requestId: 'completed-replay',
    now: new Date('2026-08-30T08:01:00Z'),
  };
  const calls: Array<[string, (service: LedgerService) => Promise<unknown>]> = [
    ['create', (service) => service.createTransaction({ ...common, body })],
    [
      'transfer',
      (service) =>
        service.transfer({
          ...common,
          body: {
            sourceAccountId: body.accountId,
            destinationAccountId: '10000000-0000-4000-8000-000000000004',
            amountMinor: 10,
            currency: 'SAR',
            occurredAt: body.occurredAt,
            title: 'Move',
          },
        }),
    ],
    [
      'revise',
      (service) =>
        service.reviseTransaction({
          ...common,
          transactionId,
          body: { expectedVersion: 1, reason: 'Correction', title: 'New' },
        }),
    ],
    [
      'refund',
      (service) =>
        service.refundTransaction({
          ...common,
          transactionId,
          body: {
            expectedVersion: 1,
            amountMinor: 10,
            occurredAt: body.occurredAt,
            reason: 'Return',
          },
        }),
    ],
    [
      'reverse',
      (service) =>
        service.reverseTransaction({
          ...common,
          transactionId,
          body: { expectedVersion: 1, reason: 'Duplicate' },
        }),
    ],
    [
      'delete',
      (service) =>
        service.deleteTransaction({
          ...common,
          transactionId,
          body: { expectedVersion: 1, reason: 'Mistake' },
        }),
    ],
    [
      'restore',
      (service) =>
        service.restoreTransaction({ ...common, transactionId, body: { expectedVersion: 1 } }),
    ],
    [
      'account opening',
      (service) =>
        service.createAccount(
          {
            ...common,
            operation: 'createAccount',
            query: {},
            params: {},
            body: { name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: 500 },
          },
          { createAccountOnClient: jest.fn() } as never,
        ),
    ],
  ];

  it.each(calls)('returns a completed %s before mutable business gates', async (_name, call) => {
    const { service, repository, security } = harness({ SAR: 1 });
    repository.replayCompleted.mockResolvedValue(response);
    repository.effect.mockResolvedValue({
      amountMinor: 50000,
      feeMinor: 0,
      currency: 'SAR',
      version: 4,
    });
    security.consumeRateLimit.mockResolvedValue(false);

    await expect(call(service)).resolves.toBe(response);
    expect(repository.replayCompleted).toHaveBeenCalledTimes(1);
    expect(repository.effect).not.toHaveBeenCalled();
    expect(security.consumeRateLimit).not.toHaveBeenCalled();
    expect(repository.mutate).not.toHaveBeenCalled();
    expect(repository.createAccount).not.toHaveBeenCalled();
  });
});
