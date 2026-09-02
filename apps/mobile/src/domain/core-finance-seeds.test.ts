import {
  createDefaultCategories,
  createDemoTransactions
} from './core-finance-seeds';

it('initializes income or expense reference categories with one remittance category', () => {
  const categories = createDefaultCategories();

  expect(categories.filter((category) => category.id === 'remittance')).toEqual(
    [
      expect.objectContaining({
        kind: 'system',
        financialType: 'expense',
        iconKey: 'transfers',
        status: 'active'
      })
    ]
  );
  expect(categories.some((category) => category.id === 'transfers')).toBe(
    false
  );
  expect(
    categories.every(
      (category) =>
        category.financialType === 'income' ||
        category.financialType === 'expense'
    )
  ).toBe(true);
});

it('keeps demo transfers category-free', () => {
  const transfers = createDemoTransactions(1_800_000_000_000).filter(
    (transaction) => transaction.type === 'transfer'
  );

  expect(transfers).toHaveLength(1);
  expect(transfers[0].categoryId).toBeNull();
});
