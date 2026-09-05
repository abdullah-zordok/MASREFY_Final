import { emptyTransactionFilters } from '@/domain/core-finance';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { createMockCoreFinanceService } from './core-finance-service';

function service() {
  return createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: fixtureTransactions.slice(0, 20)
    })
  );
}

it('creates bilingual categories and archives and restores them', async () => {
  const sut = service();
  const created = await sut.createCategory({
    labelAr: 'اختبار',
    labelEn: 'Test',
    financialType: 'expense',
    parentId: null,
    isFavorite: true
  });
  await sut.setCategoryStatus(created.value.id, 'archived');
  expect(
    (await sut.listCategories()).some((item) => item.id === created.value.id)
  ).toBe(false);
  await sut.setCategoryStatus(created.value.id, 'active');
  expect(
    (await sut.listCategories()).some((item) => item.id === created.value.id)
  ).toBe(true);
});

it('merges a category and reclassifies historical records', async () => {
  const sut = service();
  const source = await sut.createCategory({
    labelAr: 'مصدر',
    labelEn: 'Source',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });
  const target = await sut.createCategory({
    labelAr: 'هدف',
    labelEn: 'Target',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });
  await sut.createTransaction({
    type: 'expense',
    amountMinor: 100,
    title: 'Linked transaction',
    currencyCode: 'SAR',
    accountId: 'account-bank',
    destinationAccountId: null,
    categoryId: source.value.id,
    merchant: null,
    occurredAt: Date.now(),
    notes: null
  });
  await sut.mergeCategory(source.value.id, target.value.id);
  expect(
    (await sut.listCategories(true)).find((item) => item.id === source.value.id)
      ?.mergedIntoId
  ).toBe(target.value.id);
  expect(
    (await sut.listTransactions(emptyTransactionFilters)).items.some(
      (item) => item.categoryId === source.value.id
    )
  ).toBe(false);
});

it('returns the canonical transaction count used by category lifecycle confirmations', async () => {
  const sut = service();
  const created = await sut.createCategory({
    labelAr: 'اختبار',
    labelEn: 'Test',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });

  await expect(sut.getCategoryUsage(created.value.id)).resolves.toEqual({
    linkedTransactionCount: 0,
    version: expect.any(Number)
  });
});

it('rejects archive when the previewed count changed', async () => {
  const sut = service();
  const created = await sut.createCategory({
    labelAr: 'اختبار',
    labelEn: 'Test',
    financialType: 'expense',
    parentId: null,
    isFavorite: false
  });
  const preview = await sut.getCategoryUsage(created.value.id);
  await sut.createTransaction({
    type: 'expense',
    amountMinor: 100,
    title: 'New linked transaction',
    currencyCode: 'SAR',
    accountId: 'account-bank',
    destinationAccountId: null,
    categoryId: created.value.id,
    merchant: null,
    occurredAt: Date.now(),
    notes: null
  });

  await expect(
    sut.setCategoryStatus(created.value.id, 'archived', preview)
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('does not expose system categories to lifecycle mutation', async () => {
  const sut = service();
  await expect(sut.getCategoryUsage('food')).rejects.toMatchObject({
    code: 'not_found'
  });
  await expect(sut.setCategoryStatus('food', 'archived')).rejects.toMatchObject(
    { code: 'validation' }
  );
});
