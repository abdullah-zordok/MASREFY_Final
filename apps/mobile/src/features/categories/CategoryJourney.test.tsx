import { emptyTransactionFilters } from '@/domain/core-finance';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';

it('creates, favorites, selects, merges, and reclassifies historical records', () => {
  const repo = new CoreFinanceRepository({
    accounts: fixtureAccounts,
    categories: fixtureCategories,
    transactions: fixtureTransactions.slice(0, 20)
  });
  const source = repo.saveCategory({
    labelAr: 'Source',
    labelEn: 'Source',
    financialType: 'expense',
    parentId: 'food',
    isFavorite: true
  });
  const target = repo.saveCategory({
    labelAr: 'Target',
    labelEn: 'Target',
    financialType: 'expense',
    parentId: 'food',
    isFavorite: true
  });
  repo.saveTransaction({
    type: 'expense',
    amountMinor: 100,
    currencyCode: 'SAR',
    accountId: 'account-bank',
    categoryId: source.id,
    title: 'Custom expense',
    occurredAt: 1
  });
  repo.mergeCategory(source.id, target.id);
  expect(repo.requireCategory(source.id).mergedIntoId).toBe(target.id);
  expect(
    repo
      .listTransactions(emptyTransactionFilters)
      .items.some((item) => item.categoryId === source.id)
  ).toBe(false);
});
