import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { changeLocale } from '@/localization/i18n';
import {
  createMockFinancialPlanningService,
  financialPlanningService
} from '@/services/mocks/financial-planning-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { SalaryOverviewScreen } from './SalaryOverviewScreen';
import { SalaryProfileForm } from './SalaryProfileForm';
import { SalaryReceiptReview } from './SalaryReceiptReview';

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

it('renders salary overview, setup, and receipt review states', async () => {
  changeLocale('en');
  usePreferenceStore.setState({ hideBalances: false });
  const { findByLabelText, findByText, unmount } = renderWithProviders(
    <SalaryOverviewScreen />
  );
  expect(await findByText('Your salary cycle')).toBeTruthy();
  expect(await findByLabelText(/Remaining from your salary/)).toBeTruthy();
  // The daily insight shows the reason when suggested daily is unavailable
  // When cycle has elapsed (fixture cycle is Jan 2026, real Date.now() is later), reason is cycle_elapsed
  expect(await findByText('Current salary cycle has ended')).toBeTruthy();
  unmount();

  await financialPlanningService.saveDraft({
    id: 'planning-form-salary',
    kind: 'salary',
    entityId: null,
    payload: {
      amount: '14000',
      salaryDay: '25',
      sourceName: 'Draft Employer',
      accountId: '',
      automaticDetectionEnabled: false
    },
    status: 'editing',
    updatedAt: 1
  });
  const profile = renderWithProviders(<SalaryProfileForm />);
  expect(
    await profile.findByRole('header', { name: 'Salary setup' })
  ).toBeTruthy();
  expect(await profile.findByText('Draft Employer')).toBeTruthy();
  expect(
    await profile.findByLabelText(/Receiving account Daily account/)
  ).toBeTruthy();
  fireEvent.press(
    profile.getByRole('button', { name: /Expected salary amount/ })
  );
  expect(profile.queryByLabelText('Close')).toBeNull();
  fireEvent.changeText(profile.getByDisplayValue('14000'), '15000');
  fireEvent.press(
    profile.getByRole('button', { name: /Employer or salary source/ })
  );
  expect(profile.queryByDisplayValue('15000')).toBeNull();
  fireEvent.changeText(
    profile.getByDisplayValue('Draft Employer'),
    'Example Employer'
  );
  fireEvent.press(profile.getByText('Save'));
  expect(await profile.findByText('Saved')).toBeTruthy();
  expect(
    await financialPlanningService.loadDraft('planning-form-salary')
  ).toBeNull();
  profile.unmount();

  const receipt = renderWithProviders(
    <SalaryReceiptReview receiptId="receipt-jan" />
  );
  expect((await receipt.findAllByText('Confirmed')).length).toBeGreaterThan(0);
  expect(
    await receipt.findByLabelText(/Confirmed.*transaction-salary-jan/)
  ).toBeTruthy();
  fireEvent.press(receipt.getByText('Undo receipt confirmation'));
  expect((await receipt.findAllByText('Undone')).length).toBeGreaterThan(0);
  receipt.unmount();
});

it('submits a three-decimal salary using the selected base currency', async () => {
  changeLocale('en');
  usePreferenceStore.setState({ baseCurrencyCode: 'OMR' });
  await financialPlanningService.discardDraft('planning-form-salary');
  const account = await coreFinanceService.createAccount({
    name: 'Precision account',
    type: 'bank',
    currencyCode: 'OMR',
    openingBalanceMinor: 0,
    institution: null,
    lastFour: null,
    creditLimitMinor: null,
    isDefault: true,
    notes: null
  });
  const save = jest.spyOn(financialPlanningService, 'saveSalaryProfile');
  const profile = renderWithProviders(<SalaryProfileForm />);

  fireEvent.press(
    await profile.findByLabelText(/Receiving account Daily account/)
  );
  expect(profile.queryByTestId('account-picker-list')).toBeNull();
  fireEvent.press(await profile.findByText('Precision account'));
  fireEvent.press(
    profile.getByRole('button', { name: /Expected salary amount/ })
  );
  fireEvent.changeText(profile.getByDisplayValue('15000'), '12.345');
  fireEvent.press(
    profile.getByRole('button', { name: /Employer or salary source/ })
  );
  fireEvent.changeText(
    profile.getByDisplayValue('Example Employer'),
    'Precision employer'
  );
  fireEvent.press(profile.getByText('Save'));

  expect(await profile.findByText('Saved')).toBeTruthy();
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedAmountMinor: 12_345,
      currencyCode: 'OMR',
      receivingAccountId: account.value.id
    }),
    expect.any(String)
  );
  save.mockRestore();
});

it('loads the active salary profile before editing', async () => {
  changeLocale('en');
  await financialPlanningService.discardDraft('planning-form-salary');
  const currentProfile = await financialPlanningService.getSalaryProfile();
  const profile = renderWithProviders(<SalaryProfileForm />);

  expect(
    await profile.findByText(
      formatMinorAmount(
        currentProfile!.expectedAmountMinor,
        currentProfile!.currencyCode,
        'en'
      ).replace('\u00a0', ' ')
    )
  ).toBeTruthy();
  expect(profile.getByText(currentProfile!.sourceName)).toBeTruthy();
});

it('keeps multiline Arabic salary copy aligned to the right', async () => {
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  const profile = renderWithProviders(<SalaryProfileForm />);

  expect(
    await profile.findByText('جهة العمل أو مصدر الراتب')
  ).toHaveStyle({ textAlign: 'left', writingDirection: 'rtl' });
  expect(
    profile.getByText('سنكتشف إيداع راتبك تلقائيًا في الحساب المحدد.')
  ).toHaveStyle({ textAlign: 'left', writingDirection: 'rtl' });
  profile.unmount();
});

it('shows a configured salary cycle before the first receipt', async () => {
  changeLocale('en');
  const configuredService = createMockFinancialPlanningService();
  await configuredService.saveSalaryProfile(
    {
      expectedAmountMinor: 10_000_00,
      currencyCode: 'SAR',
      salaryDay: 25,
      sourceName: 'New employer',
      receivingAccountId: 'account-daily',
      automaticDetectionEnabled: false
    },
    'salary-profile-no-receipt'
  );
  const cycle = await configuredService.getSalaryOverview({
    today: '2026-01-15',
    timeZone: 'Asia/Riyadh'
  });
  const loadSalary = jest
    .spyOn(financialPlanningService, 'getSalaryOverview')
    .mockResolvedValue(cycle);
  const overview = renderWithProviders(<SalaryOverviewScreen />);

  expect(await overview.findByText('Remaining from your salary')).toBeTruthy();
  expect(overview.queryByText('Plan from payday to payday')).toBeNull();
  loadSalary.mockRestore();
});

it('shows the detected transaction before salary confirmation', async () => {
  changeLocale('en');
  const account = (await coreFinanceService.listAccounts())[0];
  const transaction = await coreFinanceService.createTransaction(
    {
      type: 'income',
      amountMinor: 12_000_00,
      currencyCode: 'SAR',
      accountId: account.id,
      destinationAccountId: null,
      feeMinor: 0,
      categoryId: 'salary',
      title: 'Salary',
      merchant: 'Pending employer',
      occurredAt: Date.UTC(2026, 8, 18, 12),
      notes: null
    },
    'pending-salary-transaction',
    'manual'
  );
  const receiptLookup = jest
    .spyOn(financialPlanningService, 'getSalaryReceiptReview')
    .mockResolvedValue(null);
  const receipt = renderWithProviders(
    <SalaryReceiptReview receiptId={transaction.value.id} />
  );

  expect(
    await receipt.findByLabelText(/12,000\.00.*SAR.*Pending employer/)
  ).toBeTruthy();
  receiptLookup.mockRestore();
});

it('guides an unconfigured user to set up a salary cycle', async () => {
  changeLocale('en');
  const emptyService = createMockFinancialPlanningService();
  const emptyCycle = await emptyService.getSalaryOverview({
    today: '2026-08-26',
    timeZone: 'Asia/Riyadh'
  });
  const loadSalary = jest
    .spyOn(financialPlanningService, 'getSalaryOverview')
    .mockResolvedValue(emptyCycle);

  const overview = renderWithProviders(<SalaryOverviewScreen />);

  expect(
    await overview.findByRole('header', { name: 'Plan from payday to payday' })
  ).toBeTruthy();
  expect(overview.getByRole('button', { name: 'Salary setup' })).toBeTruthy();
  loadSalary.mockRestore();
});
