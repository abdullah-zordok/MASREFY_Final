import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { changeLocale, translate } from '@/localization/i18n';
import { financialPlanningService } from '@/services/mocks/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';
import { ObligationDetailScreen } from './ObligationDetailScreen';
import { ObligationForm } from './ObligationForm';
import { ObligationOverviewScreen } from './ObligationOverviewScreen';

jest.mock('@/services/mocks/core-finance-service', () => {
  const actual = jest.requireActual<
    typeof import('@/services/mocks/core-finance-service')
  >('@/services/mocks/core-finance-service');
  return {
    ...actual,
    coreFinanceService: actual.createSeededCoreFinanceService()
  };
});

jest.mock('@/services/mocks/financial-planning-service', () => {
  const actual = jest.requireActual<
    typeof import('@/services/mocks/financial-planning-service')
  >('@/services/mocks/financial-planning-service');
  return {
    ...actual,
    financialPlanningService: actual.createSeededFinancialPlanningService()
  };
});

it('renders obligation overview, form, and detail states', async () => {
  changeLocale('en');
  const form = renderWithProviders(<ObligationForm />);
  const title = await form.findByLabelText('Title');
  expect(
    await form.findByLabelText(/Funding account Daily account/)
  ).toBeTruthy();
  fireEvent.changeText(title, 'Home appliance');
  fireEvent.changeText(form.getByLabelText('Contracted total'), '1200');
  fireEvent.changeText(form.getByLabelText('Installment amount'), '100');
  fireEvent.changeText(form.getByLabelText('Number of installments'), '12');
  fireEvent.press(form.getByText('Save'));
  expect(await form.findByText('Saved')).toBeTruthy();
  form.unmount();

  const overview = renderWithProviders(<ObligationOverviewScreen />);
  expect(await overview.findByText('Home appliance')).toBeTruthy();
  expect(await overview.findByLabelText(/Total payable/)).toBeTruthy();
  expect(
    overview.getByLabelText(/Amounts owed to me.*0\.00.*SAR/)
  ).toBeTruthy();
  overview.unmount();

  const created = (
    await financialPlanningService.listObligations({ status: 'active' })
  ).items.find((item) => item.title === 'Home appliance');
  const detail = renderWithProviders(
    <ObligationDetailScreen obligationId={created!.id} />
  );
  expect(await detail.findByText('Home appliance')).toBeTruthy();
  expect(await detail.findByLabelText(/Contracted total/)).toBeTruthy();
  fireEvent.press(detail.getByText('Pause obligation'));
  expect(await detail.findByText('Paused')).toBeTruthy();
  detail.unmount();
});

it.each([
  ['JPY', '12345'],
  ['SAR', '123.45'],
  ['OMR', '12.345']
])(
  'round-trips %s obligation create and edit amounts without changing minor units',
  async (currencyCode, majorAmount) => {
    changeLocale('en');
    usePreferenceStore.setState({ baseCurrencyCode: currencyCode });
    const title = `Precision ${currencyCode} obligation`;
    const createForm = renderWithProviders(<ObligationForm />);

    fireEvent.changeText(await createForm.findByLabelText('Title'), title);
    fireEvent.changeText(
      createForm.getByLabelText('Contracted total'),
      majorAmount
    );
    fireEvent.changeText(
      createForm.getByLabelText('Installment amount'),
      majorAmount
    );
    fireEvent.changeText(
      createForm.getByLabelText('Number of installments'),
      '1'
    );
    fireEvent.press(createForm.getByText('Save'));
    expect(await createForm.findByText('Saved')).toBeTruthy();
    createForm.unmount();

    const created = (
      await financialPlanningService.listObligations({})
    ).items.find((obligation) => obligation.title === title);
    expect(created).toMatchObject({
      currencyCode,
      contractedTotalMinor: 12_345,
      installmentAmountMinor: 12_345
    });

    const editForm = renderWithProviders(
      <ObligationForm obligationId={created?.id} />
    );
    await waitFor(() =>
      expect(editForm.getAllByDisplayValue(majorAmount)).toHaveLength(2)
    );
    fireEvent.press(editForm.getByText('Save'));
    expect(await editForm.findByText('Saved')).toBeTruthy();

    const updated = await financialPlanningService.getObligation(created!.id);
    expect(updated.obligation).toMatchObject({
      currencyCode,
      contractedTotalMinor: 12_345,
      installmentAmountMinor: 12_345
    });
  }
);

it.each([
  ['en', 'ltr'],
  ['ar', 'rtl']
] as const)(
  'distinguishes remaining, contracted, and paid obligation amounts in %s',
  async (locale, direction) => {
    changeLocale(locale);
    usePreferenceStore.setState({ locale, direction, baseCurrencyCode: 'SAR' });

    const overview = renderWithProviders(<ObligationOverviewScreen />);
    await overview.findByText('Car installment');
    expect(
      overview.getByLabelText(
        new RegExp(
          `Car installment.*${translate('planning.field.remaining')}.*48,000\\.00.*SAR`
        )
      )
    ).toBeTruthy();
    overview.unmount();

    const detail = renderWithProviders(
      <ObligationDetailScreen obligationId="obligation-car" />
    );
    await detail.findByText('Car installment');
    expect(
      detail.getByLabelText(
        new RegExp(
          `^${translate('planning.field.remaining')}.*48,000\\.00.*SAR.*${translate('planning.obligation.total')}.*60,000\\.00.*SAR.*${translate('planning.field.paid')}.*12,000\\.00.*SAR$`
        )
      )
    ).toBeTruthy();
  }
);
