import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { radius } from '@/design-system/tokens';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import {
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { renderWithProviders, renderWithQueryData } from '@/test-utils/render';
import { CategoryListScreen } from './CategoryListScreen';
import { GroupFormModal } from './GroupFormModal';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() }
}));

const categoryListQuerySeeds = [
  [coreFinanceKeys.categories(true), fixtureCategories],
  [coreFinanceKeys.transactions(), { items: [], nextCursor: null, total: 0 }]
] as const;

const customCategory = {
  ...fixtureCategories[0],
  id: 'custom-housing',
  kind: 'custom' as const
};

it('renders system hierarchy, favorites, search, and add action', () => {
  renderWithQueryData(<CategoryListScreen />, categoryListQuerySeeds);

  // Category labels appear
  expect(screen.getByText(fixtureCategories[0].labelAr)).toBeTruthy();

  // Quick action button "إضافة فئة" (Arabic locale) or accessibilityLabel "إضافة تصنيف"
  expect(
    screen.getByLabelText(translate('coreFinance.categories.add'))
  ).toBeTruthy();
  expect(screen.getByText('إضافة فئة').props.numberOfLines).toBeUndefined();
  expect(screen.getByText('إضافة مجموعة').props.numberOfLines).toBeUndefined();

  // Category rows render
  const rows = screen.getAllByTestId('category-row');
  expect(rows.length).toBeGreaterThan(0);

  expect(rows[0]).toHaveStyle({ borderRadius: radius.card });
  expect(
    screen.queryByLabelText(translate('coreFinance.categories.delete'))
  ).toBeNull();

  fireEvent.press(screen.getByText(fixtureCategories[0].labelAr));
  expect(router.push).toHaveBeenCalledWith(
    `/categories/${fixtureCategories[0].id}?edit=1`
  );
});

it('makes the category form a modal region', () => {
  renderWithQueryData(<CategoryListScreen />, categoryListQuerySeeds);

  fireEvent.press(
    screen.getByLabelText(translate('coreFinance.categories.add'))
  );
  expect(screen.getByTestId('category-form-modal-content')).toHaveProp(
    'accessibilityViewIsModal',
    true
  );
});

it('makes the group form a modal region', () => {
  renderWithProviders(
    <GroupFormModal visible onClose={jest.fn()} onCreated={jest.fn()} />
  );

  expect(screen.getByTestId('group-form-modal-content')).toHaveProp(
    'accessibilityViewIsModal',
    true
  );
  expect(
    screen.UNSAFE_getByProps({ testID: 'group-form-modal-backdrop' }).props
      .importantForAccessibility
  ).toBe('no-hide-descendants');
});

it('does not present a partial transaction page as the category total', () => {
  const transaction = {
    ...fixtureTransactions[0],
    categoryId: fixtureCategories[0].id
  };
  renderWithQueryData(<CategoryListScreen />, [
    [coreFinanceKeys.categories(true), fixtureCategories],
    [
      coreFinanceKeys.transactions(),
      { items: [transaction], nextCursor: 'next-page', total: 2 }
    ]
  ]);

  expect(
    screen.queryByText(translate('coreFinance.categories.txCountOne'))
  ).toBeNull();
});

it('deletes an unused custom category after confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  const preview = { linkedTransactionCount: 0, version: 7 };
  jest.spyOn(coreFinanceService, 'getCategoryUsage').mockResolvedValue(preview);
  const setStatus = jest
    .spyOn(coreFinanceService, 'setCategoryStatus')
    .mockResolvedValue({
      value: { ...customCategory, status: 'archived' },
      affectedScopes: []
    });
  renderWithQueryData(<CategoryListScreen />, [
    [coreFinanceKeys.categories(true), [customCategory, ...fixtureCategories]],
    [coreFinanceKeys.transactions(), { items: [], nextCursor: null, total: 0 }]
  ]);

  fireEvent.press(
    screen.getByLabelText(
      `${translate('coreFinance.categories.delete')}: ${customCategory.labelAr}`
    ),
    { stopPropagation: jest.fn() }
  );
  await waitFor(() => expect(alert).toHaveBeenCalled());
  const confirm = alert.mock.calls.at(-1)?.[2]?.find(
    (button) => button.style === 'destructive'
  );
  confirm?.onPress?.();

  await waitFor(() =>
    expect(setStatus).toHaveBeenCalledWith(
      customCategory.id,
      'archived',
      preview
    )
  );
});

it('does not offer direct deletion for system categories', () => {
  renderWithQueryData(<CategoryListScreen />, categoryListQuerySeeds);

  expect(
    screen.queryByLabelText(
      `${translate('coreFinance.categories.delete')}: ${fixtureCategories[0].labelAr}`
    )
  ).toBeNull();
});

it('offers archiving instead of deleting a category linked to transactions', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  jest.spyOn(coreFinanceService, 'getCategoryUsage').mockResolvedValue({
    linkedTransactionCount: 3,
    version: 7
  });
  renderWithQueryData(<CategoryListScreen />, [
    [coreFinanceKeys.categories(true), [customCategory, ...fixtureCategories]],
    [coreFinanceKeys.transactions(), { items: [], nextCursor: null, total: 0 }]
  ]);

  fireEvent.press(
    screen.getByLabelText(
      `${translate('coreFinance.categories.delete')}: ${customCategory.labelAr}`
    ),
    { stopPropagation: jest.fn() }
  );
  await waitFor(() => expect(alert).toHaveBeenCalled());

  expect(alert.mock.calls.at(-1)?.[1]).toContain('3');
  expect(alert.mock.calls.at(-1)?.[2]?.at(-1)?.text).toBe(
    translate('coreFinance.categories.archive')
  );
});
