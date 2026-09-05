import { emptyTransactionFilters } from '@/domain/core-finance';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions,
  makeConflict
} from '@/test-utils/core-finance-fixtures';
import { CoreFinanceRepository } from './core-finance-repository';

function repository() {
  return new CoreFinanceRepository({
    accounts: fixtureAccounts,
    categories: fixtureCategories,
    transactions: fixtureTransactions.slice(0, 10)
  });
}

it('keeps one default account and derives balances from the ledger', () => {
  const repo = repository();
  const created = repo.saveAccount({
    name: 'Cash',
    type: 'cash',
    currencyCode: 'SAR',
    openingBalanceMinor: 10_000,
    isDefault: true
  });
  expect(repo.listAccounts().filter((item) => item.isDefault)).toEqual([
    created
  ]);
  expect(repo.accountBalance('account-bank')).not.toBe(
    fixtureAccounts[0].openingBalanceMinor
  );
});

it('preserves the per-account automatic-tracking opt-out', () => {
  const repo = repository();
  const created = repo.saveAccount({
    name: 'Tracked card',
    type: 'credit_card',
    currencyCode: 'SAR',
    openingBalanceMinor: 0,
    automaticTrackingEnabled: false
  });
  expect(repo.requireAccount(created.id).automaticTrackingEnabled).toBe(false);
  expect(
    repo.saveAccount(
      { ...created, automaticTrackingEnabled: true },
      created.id
    ).automaticTrackingEnabled
  ).toBe(true);
});

it('paginates without duplicate records', () => {
  const repo = repository();
  const first = repo.listTransactions(emptyTransactionFilters, null, 4);
  const second = repo.listTransactions(
    emptyTransactionFilters,
    first.nextCursor,
    4
  );
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size
  ).toBe(8);
});

it('persists and discards drafts', () => {
  const repo = repository();
  repo.saveDraft({
    id: 'draft',
    transactionType: 'expense',
    amountText: '10',
    accountId: null,
    destinationAccountId: null,
    categoryId: null,
    merchant: null,
    notes: null,
    occurredAt: null,
    status: 'editing',
    updatedAt: 0
  });
  expect(repo.loadDraft('draft')?.amountText).toBe('10');
  repo.discardDraft('draft');
  expect(repo.loadDraft('draft')).toBeNull();
});

it('rejects archived references before writing a transaction', () => {
  const repo = repository();
  const before = repo.allTransactions().length;
  expect(() =>
    repo.saveTransaction({
      type: 'expense',
      amountMinor: 100,
      currencyCode: 'SAR',
      accountId: 'account-archived',
      categoryId: 'food',
      title: 'Blocked',
      occurredAt: 1
    })
  ).toThrow('archived');
  expect(repo.allTransactions()).toHaveLength(before);
});

it('allows an unchanged legacy cross-currency transfer to be edited', () => {
  const legacyTransfer = {
    ...fixtureTransactions[0],
    id: 'legacy-cross-currency-transfer',
    type: 'transfer' as const,
    accountId: 'account-bank',
    destinationAccountId: 'account-usd',
    currencyCode: 'SAR',
    categoryId: null
  };
  const repo = new CoreFinanceRepository({
    accounts: fixtureAccounts,
    categories: fixtureCategories,
    transactions: [legacyTransfer]
  });

  const updated = repo.saveTransaction(
    {
      type: legacyTransfer.type,
      amountMinor: legacyTransfer.amountMinor,
      currencyCode: legacyTransfer.currencyCode,
      accountId: legacyTransfer.accountId,
      destinationAccountId: legacyTransfer.destinationAccountId,
      feeMinor: legacyTransfer.feeMinor,
      categoryId: null,
      title: 'Edited legacy transfer',
      merchant: legacyTransfer.merchant,
      occurredAt: legacyTransfer.occurredAt,
      notes: legacyTransfer.notes,
      originalTransactionId: legacyTransfer.originalTransactionId,
      obligationId: legacyTransfer.obligationId
    },
    legacyTransfer.id
  );

  expect(updated.title).toBe('Edited legacy transfer');
  expect(updated.destinationAccountId).toBe('account-usd');
});

it('deletes with a persisted deadline and rejects late undo', () => {
  const repo = repository();
  const deleted = repo.deleteTransaction('transaction-0', 1000);
  expect(deleted.undoExpiresAt).toBe(31_000);
  expect(() => repo.undoDelete('transaction-0', 31_001)).toThrow('expired');
});

it('preserves both conflict snapshots until explicit supported resolution', () => {
  const repo = repository();
  const conflict = makeConflict(repo.requireTransaction('transaction-0'));
  repo.addConflict(conflict);
  const before = repo.allTransactions().length;
  expect(repo.requireConflict(conflict.id)).toMatchObject({
    localSnapshot: conflict.localSnapshot,
    laterSnapshot: conflict.laterSnapshot,
    status: 'pending',
    resolution: null
  });
  expect(() => repo.resolveConflict(conflict.id, 'keep_both')).toThrow(
    'validation'
  );
  expect(repo.allTransactions()).toHaveLength(before);
  expect(repo.requireConflict(conflict.id)).toMatchObject({
    status: 'pending',
    resolution: null
  });

  const resolved = repo.resolveConflict(conflict.id, 'keep_later');
  expect(resolved.title).toBe(conflict.laterSnapshot.title);
  expect(repo.requireConflict(conflict.id)).toMatchObject({
    localSnapshot: conflict.localSnapshot,
    laterSnapshot: conflict.laterSnapshot,
    status: 'resolved',
    resolution: 'keep_later'
  });
});

it('merges categories and reclassifies all source records atomically', () => {
  const repo = repository();
  const source = repo.saveCategory({
    labelAr: 'مصدر',
    labelEn: 'Source',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });
  const target = repo.saveCategory({
    labelAr: 'هدف',
    labelEn: 'Target',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });
  repo.saveTransaction({
    type: 'expense',
    amountMinor: 100,
    currencyCode: 'SAR',
    accountId: 'account-bank',
    categoryId: source.id,
    title: 'Linked',
    occurredAt: 1
  });
  repo.setCategoryStatus(source.id, 'archived');
  repo.mergeCategory(source.id, target.id);
  expect(repo.requireCategory(source.id).status).toBe('merged');
  expect(
    repo.allTransactions().filter((item) => item.categoryId === source.id)
  ).toHaveLength(0);
});

it('assigns a nonempty repository ID to a newly created category', () => {
  const repo = repository();
  const created = repo.saveCategory({
    labelAr: 'اختبار',
    labelEn: 'Test',
    financialType: 'expense',
    parentId: null,
    iconKey: null,
    colorKey: null,
    isFavorite: false
  });

  expect(created.id).toEqual(expect.stringMatching(/^category-.+/));
  expect(repo.requireCategory(created.id)).toEqual(created);
});

it('rolls back a staged planning ledger write when planning fails', async () => {
  const repo = repository();
  const before = repo.allTransactions().length;
  await expect(
    repo.withPlanningLedgerWrite(
      {
        type: 'expense',
        amountMinor: 100,
        currencyCode: 'SAR',
        accountId: fixtureAccounts[0].id,
        destinationAccountId: null,
        feeMinor: 0,
        categoryId: fixtureCategories[0].id,
        title: 'Planning payment',
        merchant: null,
        occurredAt: Date.now(),
        notes: null,
        originalTransactionId: null,
        obligationId: 'obligation-car'
      },
      'op-planning-rollback',
      'manual',
      () => {
        throw new Error('planning failed');
      }
    )
  ).rejects.toThrow('planning failed');
  expect(repo.allTransactions()).toHaveLength(before);
});
