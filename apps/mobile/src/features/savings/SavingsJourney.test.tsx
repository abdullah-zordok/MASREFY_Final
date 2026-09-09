import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { changeLocale } from '@/localization/i18n';
import { financialPlanningService } from '@/services/mocks/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';
import { SavingsGoalDetailScreen } from './SavingsGoalDetailScreen';
import { SavingsGoalForm } from './SavingsGoalForm';
import { SavingsGoalsScreen } from './SavingsGoalsScreen';
import { SavingsMovementForm } from './SavingsMovementForm';

it('creates, pauses, and records progress for savings goals', async () => {
  changeLocale('en');
  usePreferenceStore.setState({ hideBalances: false });
  const form = renderWithProviders(<SavingsGoalForm />);
  expect(await form.findByLabelText(/Linked account Unavailable/)).toBeTruthy();
  fireEvent.changeText(await form.findByLabelText('Goal name'), 'Travel fund');
  fireEvent.changeText(form.getByLabelText('Target amount'), '5000');
  fireEvent.press(form.getByText('Save'));
  expect(await form.findByText('Saved')).toBeTruthy();
  form.unmount();

  const overview = renderWithProviders(<SavingsGoalsScreen />);
  expect(await overview.findByText('Travel fund')).toBeTruthy();
  expect(await overview.findByLabelText(/Active goals/)).toBeTruthy();
  overview.unmount();

  const detail = renderWithProviders(
    <SavingsGoalDetailScreen goalId="goal-emergency" />
  );
  expect(await detail.findByText('Emergency fund')).toBeTruthy();
  expect(await detail.findByLabelText(/Emergency fund/)).toBeTruthy();
  fireEvent.press(detail.getByText('Pause goal'));
  expect(await detail.findByText('Paused')).toBeTruthy();
  detail.unmount();

  const movement = renderWithProviders(
    <SavingsMovementForm goalId="goal-emergency" />
  );
  fireEvent.changeText(
    await movement.findByLabelText('Movement amount'),
    '100'
  );
  fireEvent.press(movement.getByText('Review movement'));
  expect(await movement.findByText('100.00 SAR')).toBeTruthy();
  fireEvent.press(movement.getByText('Confirm movement'));
  expect(await movement.findByText('Saved')).toBeTruthy();
  movement.unmount();
});

it('does not offer unsupported live savings movements', async () => {
  changeLocale('en');
  Object.assign(financialPlanningService.metadata, { kind: 'live' });
  try {
    const detail = renderWithProviders(
      <SavingsGoalDetailScreen goalId="goal-emergency" />
    );
    expect(await detail.findByText('Unavailable')).toBeTruthy();
    expect(detail.queryByText('Add movement')).toBeNull();
    detail.unmount();

    const movement = renderWithProviders(
      <SavingsMovementForm goalId="goal-emergency" />
    );
    expect(await movement.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(movement.queryByText('Review movement')).toBeNull();
    movement.unmount();
  } finally {
    Object.assign(financialPlanningService.metadata, { kind: 'mock' });
  }
});

it.each([
  ['JPY', '12345'],
  ['SAR', '123.45'],
  ['OMR', '12.345']
])(
  'round-trips %s savings-goal create and edit amounts without changing minor units',
  async (currencyCode, majorAmount) => {
    changeLocale('en');
    usePreferenceStore.setState({ baseCurrencyCode: currencyCode });
    const title = `Precision ${currencyCode} goal`;
    const createForm = renderWithProviders(<SavingsGoalForm />);

    fireEvent.changeText(await createForm.findByLabelText('Goal name'), title);
    fireEvent.changeText(
      createForm.getByLabelText('Target amount'),
      majorAmount
    );
    fireEvent.changeText(
      createForm.getByLabelText('Already saved'),
      majorAmount
    );
    fireEvent.press(createForm.getByText('Save'));
    expect(await createForm.findByText('Saved')).toBeTruthy();
    createForm.unmount();

    const created = (await financialPlanningService.listGoals({})).find(
      (goal) => goal.title === title
    );
    expect(created).toMatchObject({
      currencyCode,
      targetMinor: 12_345,
      openingTrackedMinor: 12_345
    });

    const editForm = renderWithProviders(
      <SavingsGoalForm goalId={created?.id} />
    );
    await waitFor(() =>
      expect(editForm.getAllByDisplayValue(majorAmount)).toHaveLength(2)
    );
    fireEvent.press(editForm.getByText('Save'));
    expect(await editForm.findByText('Saved')).toBeTruthy();

    const updated = await financialPlanningService.getGoal(created!.id);
    expect(updated.goal).toMatchObject({
      currencyCode,
      targetMinor: 12_345,
      openingTrackedMinor: 12_345
    });
  }
);
