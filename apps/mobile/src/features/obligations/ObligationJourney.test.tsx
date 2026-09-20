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

it('shows the approved obligation overview hierarchy and filters completed records', async () => {
  changeLocale('en');
  usePreferenceStore.setState({ locale: 'en', direction: 'ltr' });
  const completed = await financialPlanningService.createObligation(
    {
      direction: 'payable',
      type: 'personal_loan',
      scheduleKind: 'fixed_term',
      title: 'Completed loan',
      currencyCode: 'SAR',
      contractedTotalMinor: 1_000_00,
      installmentAmountMinor: 1_000_00,
      installmentCount: 1,
      dueDay: 1,
      startDate: '2026-01-01'
    },
    'overview-completed-create'
  );
  await financialPlanningService.setObligationStatus(
    completed.value.id,
    completed.value.version,
    'completed',
    'overview-completed-status'
  );

  const screen = renderWithProviders(<ObligationOverviewScreen />);
  expect(await screen.findByText('Due soon')).toBeTruthy();
  expect(screen.getByText('Total payable')).toBeTruthy();
  expect(screen.getByText('Owed to me')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Upcoming' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
  expect(await screen.findByRole('button', { name: /Completed loan/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Car installment/ })).toBeNull();
});

it('renders obligation overview, form, and detail states', async () => {
  changeLocale('en');
  const form = renderWithProviders(<ObligationForm />);
  const title = await form.findByLabelText('Title');
  fireEvent.changeText(title, 'Home appliance');
  fireEvent.changeText(form.getByLabelText('Contracted total'), '1200');
  fireEvent.press(form.getByText('Next'));
  fireEvent.changeText(form.getByLabelText('Installment amount'), '100');
  fireEvent.changeText(form.getByLabelText('Number of installments'), '12');
  fireEvent.press(form.getByRole('button', { name: 'Review' }));
  expect(await form.findByLabelText(/Funding account Daily account/)).toBeTruthy();
  fireEvent.press(form.getByText('Save'));
  expect(await form.findByText('Saved')).toBeTruthy();
  form.unmount();

  const overview = renderWithProviders(<ObligationOverviewScreen />);
  expect(await overview.findByText('Home appliance')).toBeTruthy();
  expect((await overview.findAllByLabelText(/Total payable/)).length).toBeGreaterThan(0);
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
  expect((await detail.findAllByLabelText(/Contracted total/)).length).toBeGreaterThan(0);
  fireEvent.press(detail.getByText('More actions'));
  fireEvent.press(detail.getByText('Pause obligation'));
  expect(await detail.findByText('Resume obligation')).toBeTruthy();
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
    fireEvent.press(createForm.getByText('Next'));
    fireEvent.changeText(
      createForm.getByLabelText('Installment amount'),
      majorAmount
    );
    fireEvent.changeText(
      createForm.getByLabelText('Number of installments'),
      '1'
    );
    fireEvent.press(createForm.getByRole('button', { name: 'Review' }));
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
    await waitFor(() => expect(editForm.getByDisplayValue(majorAmount)).toBeTruthy());
    fireEvent.press(editForm.getByText('Next'));
    await waitFor(() => expect(editForm.getByDisplayValue(majorAmount)).toBeTruthy());
    fireEvent.press(editForm.getByRole('button', { name: 'Review' }));
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

it('keeps the obligation detail card free of Masarifi branding', async () => {
  changeLocale('ar');
  usePreferenceStore.setState({
    locale: 'ar',
    direction: 'rtl',
    baseCurrencyCode: 'SAR',
    hideBalances: false
  });

  const detail = renderWithProviders(
    <ObligationDetailScreen obligationId="obligation-car" />
  );

  await detail.findByText('Car installment');
  expect(detail.queryByText('مصاريفي')).toBeNull();
  expect(detail.queryByText('م')).toBeNull();
});

it('keeps obligation rows in the native RTL order without reversing them twice', async () => {
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });

  const screen = renderWithProviders(<ObligationOverviewScreen />);

  expect(await screen.findByTestId('obligations-summary')).toHaveStyle({
    flexDirection: 'row'
  });
  expect(screen.getByTestId('obligations-hero')).toHaveStyle({
    minHeight: 292
  });
  expect(screen.getByTestId('obligations-filters')).toHaveStyle({
    flexDirection: 'row'
  });
  expect(screen.getByTestId('obligation-row-obligation-car')).toHaveStyle({
    flexDirection: 'row'
  });
});

it.each([
  ['en', 'ltr', 'left'],
  ['ar', 'rtl', 'right']
] as const)(
  'renders the simplified obligation detail layout in %s',
  async (locale, direction, progressSide) => {
    changeLocale(locale);
    usePreferenceStore.setState({
      locale,
      direction,
      baseCurrencyCode: 'SAR',
      hideBalances: false
    });

    const detail = renderWithProviders(
      <ObligationDetailScreen obligationId="obligation-car" />
    );

    await detail.findByText('Car installment');
    expect(detail.getByTestId('obligation-detail-title-copy')).toHaveStyle({
      alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start',
      direction: 'ltr'
    });
    expect(detail.getByTestId('obligation-detail-title')).toHaveStyle({
      textAlign: direction === 'rtl' ? 'right' : 'left',
      width: '100%'
    });
    expect(detail.getByTestId('obligation-detail-provider')).toHaveStyle({
      textAlign: direction === 'rtl' ? 'right' : 'left',
      width: '100%'
    });
    expect(detail.getByTestId('obligation-detail-progress-fill')).toHaveStyle({
      width: '20%',
      [progressSide]: 0
    });
    expect(detail.getByTestId('obligation-detail-schedule-row-1')).toHaveStyle({
      flexDirection: 'row'
    });
    expect(detail.getByText(translate('planning.obligation.recordPayment'))).toBeTruthy();
    expect(detail.getByText(translate('planning.action.edit'))).toBeTruthy();
    expect(detail.getByText(translate('planning.obligation.moreActions'))).toBeTruthy();
    expect(detail.queryByText(translate('planning.obligation.pause'))).toBeNull();
    expect(detail.queryByText(translate('planning.obligation.paymentHistory'))).toBeNull();

    fireEvent.press(detail.getByText(translate('planning.obligation.moreActions')));
    expect(await detail.findByText(translate('planning.obligation.pause'))).toBeTruthy();
    expect(await detail.findByText(translate('planning.obligation.paymentHistory'))).toBeTruthy();
  }
);

it('keeps record payment available for live planning providers', async () => {
  const originalKind = financialPlanningService.metadata.kind;
  Object.assign(financialPlanningService.metadata, { kind: 'live' });

  try {
    changeLocale('en');
    usePreferenceStore.setState({
      locale: 'en',
      direction: 'ltr',
      baseCurrencyCode: 'SAR',
      hideBalances: false
    });

    const detail = renderWithProviders(
      <ObligationDetailScreen obligationId="obligation-car" />
    );

    expect(
      await detail.findByRole('button', { name: 'Record payment' })
    ).toBeTruthy();
  } finally {
    Object.assign(financialPlanningService.metadata, { kind: originalKind });
  }
});

it('masks all obligation detail amounts in privacy mode', async () => {
  changeLocale('en');
  usePreferenceStore.setState({
    locale: 'en',
    direction: 'ltr',
    baseCurrencyCode: 'SAR',
    hideBalances: true
  });

  const detail = renderWithProviders(
    <ObligationDetailScreen obligationId="obligation-car" />
  );

  expect(await detail.findAllByText('Values are hidden')).toBeTruthy();
  expect(detail.queryByText(/48,000\.00/)).toBeNull();
  expect(detail.queryByText(/60,000\.00/)).toBeNull();
  expect(detail.queryByText(/12,000\.00/)).toBeNull();
  expect(detail.queryByText(/2,000\.00/)).toBeNull();

  fireEvent.press(detail.getByText('More actions'));
  expect(await detail.findByText('Payment history')).toBeTruthy();
  expect(detail.queryByText(/2,000\.00/)).toBeNull();

  detail.unmount();
  usePreferenceStore.setState({ hideBalances: false });
});

it('rejects fractional installment counts before creating an obligation', async () => {
  changeLocale('en');
  await financialPlanningService.discardDraft('planning-form-obligation:new');
  const form = renderWithProviders(<ObligationForm />);
  const title = 'Fractional installment regression';

  fireEvent.changeText(await form.findByLabelText('Title'), title);
  fireEvent.changeText(form.getByLabelText('Contracted total'), '1200');
  fireEvent.press(form.getByText('Next'));
  fireEvent.changeText(form.getByLabelText('Installment amount'), '100');
  fireEvent.changeText(form.getByLabelText('Number of installments'), '1.5');
  fireEvent.press(form.getByRole('button', { name: 'Review' }));

  expect(
    await form.findByText('Complete the required fields with valid values.')
  ).toBeTruthy();
  expect(
    (await financialPlanningService.listObligations({})).items.some(
      (obligation) => obligation.title === title
    )
  ).toBe(false);
});

it.each([
  ['en', 'ltr'],
  ['ar', 'rtl']
] as const)(
  'distinguishes remaining, contracted, and paid obligation amounts in %s',
  async (locale, direction) => {
    changeLocale(locale);
    usePreferenceStore.setState({ locale, direction, baseCurrencyCode: 'SAR' });

    const overview = renderWithProviders(<ObligationOverviewScreen />);
    await overview.findAllByText('Car installment');
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

it('keeps overview row amounts masked when privacy mode is on', async () => {
  changeLocale('en');
  usePreferenceStore.setState({
    locale: 'en',
    direction: 'ltr',
    baseCurrencyCode: 'SAR',
    hideBalances: true
  });

  const overview = renderWithProviders(<ObligationOverviewScreen />);

  expect(await overview.findAllByText('Values are hidden')).toBeTruthy();
  expect(overview.queryByText(/48,000\.00/)).toBeNull();

  overview.unmount();
  usePreferenceStore.setState({ hideBalances: false });
});
