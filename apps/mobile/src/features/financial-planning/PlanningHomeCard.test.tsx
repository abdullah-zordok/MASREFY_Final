import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { PlanningHomeCard } from './PlanningHomeCard';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

it('hides budgets while keeping the available planning destinations', async () => {
  renderWithProviders(<PlanningHomeCard />);

  expect(
    await screen.findByText(translate('coreFinance.home.financialProgress'))
  ).toBeTruthy();
  await waitFor(() => {
    expect(
      screen.getAllByLabelText(new RegExp(translate('planning.field.progress')))
        .length
    ).toBeGreaterThan(0);
  });

  expect(screen.queryByText(translate('planning.budgets.title'))).toBeNull();

  fireEvent.press(screen.getByText(translate('planning.savings.title')));
  expect(router.push).toHaveBeenCalledWith('/savings');
});
