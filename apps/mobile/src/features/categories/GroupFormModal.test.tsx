import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Category } from '@/domain/core-finance';
import { changeLocale, translate } from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { renderWithProviders } from '@/test-utils/render';
import { GroupFormModal } from './GroupFormModal';

afterEach(() => changeLocale('ar'));

it('persists the selected income meaning and returns it after save', async () => {
  changeLocale('en');
  const onCreated = jest.fn();
  renderWithProviders(
    <GroupFormModal visible onClose={() => undefined} onCreated={onCreated} />
  );

  expect(screen.getByLabelText(/Expense selected/i)).toHaveAccessibilityState({
    selected: true
  });
  fireEvent.press(screen.getByLabelText(/Income available/i));
  fireEvent.changeText(
    screen.getByPlaceholderText(
      translate('coreFinance.categories.groupNamePlaceholder')
    ),
    'Income sources'
  );
  fireEvent.press(
    screen.getByLabelText(translate('coreFinance.categories.save'))
  );

  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  const created = onCreated.mock.calls[0][0] as Category;
  expect(created.financialType).toBe('income');
  await expect(coreFinanceService.listCategories(true)).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        labelEn: 'Income sources',
        financialType: 'income'
      })
    ])
  );
  expect(screen.queryByText('Transfer')).toBeNull();
});

it('uses Android-sized header actions', () => {
  renderWithProviders(
    <GroupFormModal visible onClose={jest.fn()} onCreated={jest.fn()} />
  );

  expect(screen.getByLabelText(translate('coreFinance.cancel'))).toHaveStyle({
    height: 48,
    width: 48
  });
  expect(
    screen.getByLabelText(translate('coreFinance.categories.save'))
  ).toHaveStyle({ height: 48, width: 48 });
});
