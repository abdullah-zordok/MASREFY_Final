import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { currentLocale, translate } from '@/localization/i18n';
import { fixtureCategories } from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { categoryLifecycleService } from '@/services/mocks/core-finance-service';
import {
  completeCategorySelection,
  getCategorySelectionSession
} from './category-selection-session';
import { CategoryDetailScreen } from './CategoryDetailScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
}));

const customCategory = {
  ...fixtureCategories[1],
  id: 'custom-food',
  kind: 'custom' as const
};
const customTarget = {
  ...fixtureCategories.find((item) => item.id === 'shopping')!,
  id: 'custom-shopping',
  kind: 'custom' as const
};
const archivedTarget = {
  ...customTarget,
  id: 'archived-target',
  status: 'archived' as const
};
const incompatibleTarget = {
  ...customTarget,
  id: 'incompatible-target',
  financialType: customCategory.financialType === 'expense' ? 'income' as const : 'expense' as const
};
const categories = [
  customCategory,
  customTarget,
  archivedTarget,
  incompatibleTarget,
  ...fixtureCategories
];

it('keeps system category lifecycle read-only', () => {
  renderWithQueryData(<CategoryDetailScreen id="food" />, [
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);
  expect(screen.getByText(fixtureCategories[1].labelAr)).toBeTruthy();
  expect(
    screen.getByText(
      new RegExp(translate('coreFinance.categories.origin.system'))
    )
  ).toBeTruthy();
  expect(
    screen.queryByText(translate('coreFinance.categories.archive'))
  ).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.categories.merge'))
  ).toBeNull();
});

it('fetches and shows canonical usage before changing category lifecycle', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  jest
    .spyOn(categoryLifecycleService, 'getCategoryUsage')
    .mockResolvedValue({ linkedTransactionCount: 3, version: 7 });
  const setStatus = jest.spyOn(categoryLifecycleService, 'setCategoryStatus');
  renderWithQueryData(<CategoryDetailScreen id={customCategory.id} />, [
    [coreFinanceKeys.categories(true), categories]
  ]);

  fireEvent.press(
    screen.getByText(translate('coreFinance.categories.archive'))
  );

  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(alert.mock.calls[0]?.[1]).toContain('3');
  expect(setStatus).not.toHaveBeenCalled();
});

it('does not preselect the first merge target', () => {
  renderWithQueryData(<CategoryDetailScreen id={customCategory.id} />, [
    [coreFinanceKeys.categories(true), categories]
  ]);

  expect(
    screen.getByText(translate('coreFinance.categories.merge'))
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: translate('coreFinance.categories.merge')
    })
  ).toBeDisabled();
});

it('uses the canonical picker for a merge target and excludes the source', () => {
  renderWithQueryData(<CategoryDetailScreen id={customCategory.id} />, [
    [coreFinanceKeys.categories(true), categories]
  ]);

  fireEvent.press(
    screen.getByLabelText(
      `${translate('coreFinance.categories.selectMergeTarget')} ${translate('coreFinance.categories.selectMergeTarget')}`
    )
  );
  const route = jest.mocked(router.push).mock.calls.at(-1)?.[0] as unknown as {
    params: { requestId: string };
  };
  const session = getCategorySelectionSession(route.params.requestId);
  expect(session?.excludedIds).toEqual(
    expect.arrayContaining([
      customCategory.id,
      archivedTarget.id,
      incompatibleTarget.id,
      fixtureCategories[0].id
    ])
  );
  expect(session?.excludedIds).not.toContain(customTarget.id);
  act(() => completeCategorySelection(route.params.requestId, customTarget.id));

  expect(
    screen.getByText(
      currentLocale() === 'ar' ? customTarget.labelAr : customTarget.labelEn
    )
  ).toBeTruthy();
});
