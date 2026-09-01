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
  await sut.mergeCategory('food', 'restaurants');
  expect(
    (await sut.listCategories(true)).find((item) => item.id === 'food')
      ?.mergedIntoId
  ).toBe('restaurants');
  expect(
    (await sut.listTransactions(emptyTransactionFilters)).items.some(
      (item) => item.categoryId === 'food'
    )
  ).toBe(false);
});
