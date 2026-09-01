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
  const custom = repo.saveCategory({
    labelAr: 'Custom',
    labelEn: 'Custom',
    financialType: 'expense',
    parentId: 'food',
    isFavorite: true
  });
  repo.mergeCategory('food', custom.id);
  expect(repo.requireCategory('food').mergedIntoId).toBe(custom.id);
  expect(
    repo
      .listTransactions(emptyTransactionFilters)
      .items.some((item) => item.categoryId === 'food')
  ).toBe(false);
});
