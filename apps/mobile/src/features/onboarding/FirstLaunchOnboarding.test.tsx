import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import WelcomeRoute from '@app/(public)/welcome';
import { colorTokens } from '@/design-system/tokens';
import { buildPreferences } from '@/domain/foundation';
import { changeLocale } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { savePreferences } from '@/storage/secure-preferences';
import { renderWithProviders } from '@/test-utils/render';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() }
}));
jest.mock('@/storage/secure-preferences', () => ({
  loadPreferences: jest.fn(),
  savePreferences: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('@/services/pre-signup-reminder-service', () => ({
  preSignupReminderService: {
    prepare: jest.fn(async () => ({ shouldRequestPermission: false })),
    scheduleAfterPermission: jest.fn(async () => undefined)
  }
}));
jest.mock('@/services/platform/phone-notification-service', () => ({
  phoneNotificationService: {
    requestPermission: jest.fn(async () => 'denied')
  }
}));

const mockSavePreferences = jest.mocked(savePreferences);

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('ar');
  usePreferenceStore.setState({
    ...buildPreferences({ firstLaunchOnboardingCompleted: false }),
    hydrated: true
  });
  useAppShellStore.getState().reset();
});

it('renders the Arabic first-launch experience in RTL', () => {
  renderWithProviders(<WelcomeRoute />);

  expect(screen.getByTestId('first-launch-content')).toHaveStyle({
    direction: 'rtl'
  });
  expect(screen.getByTestId('first-launch-language')).toHaveStyle({
    alignSelf: 'flex-start',
    direction: 'rtl'
  });
  expect(
    screen.getByText('سجّل وتابع صرفك بالـ\u2068AI\u2069..\nوبشكل تلقائي.')
  ).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
  expect(screen.getByTestId('first-launch-copy')).toHaveStyle({
    alignItems: 'flex-end',
    direction: 'ltr'
  });
  expect(
    screen.getByText(
      'رسائل البنوك، \u2068Apple Pay\u2069، \u2068mada\u2069، \u2068STC Pay\u2069\nكلها محفوظة تلقائيًا.'
    )
  ).toBeOnTheScreen();
  expect(screen.getByText('ابدأ الحين')).toBeOnTheScreen();
  const transactionExamples = screen.getAllByTestId(/^transaction-example-/);
  expect(transactionExamples).toHaveLength(3);
  screen.getAllByTestId(/^transaction-saved-status-/).forEach((status) => {
    expect(status).toHaveStyle({
      direction: 'ltr',
      flexDirection: 'row-reverse'
    });
  });
  expect(
    screen.getByTestId('transaction-saved-check-1-symbol', {
      includeHiddenElements: true
    }).props
  ).toMatchObject({
    name: 'checkmark',
    tintColor: colorTokens.raw['007A3D']
  });
  expect(screen.getAllByLabelText('تسجيل تلقائيًا')[0]).toHaveStyle({
    color: colorTokens.raw['007A3D']
  });
  expect(
    screen.getByTestId('transaction-saved-check-1', {
      includeHiddenElements: true
    })
  ).toHaveStyle({ height: 16, width: 16 });
  expect(screen.getByTestId('transaction-merchant-1')).toHaveStyle({
    alignItems: 'flex-end'
  });
  expect(screen.getByTestId('transaction-amount-1')).toHaveStyle({
    alignItems: 'flex-start'
  });
  transactionExamples.forEach((example) => {
    expect(example).toHaveStyle({
      direction: 'ltr',
      flexDirection: 'row-reverse',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12
    });
  });
});

it('switches to natural English copy and LTR layout', async () => {
  renderWithProviders(<WelcomeRoute />);

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'English' }));
  });

  expect(screen.getByTestId('first-launch-content')).toHaveStyle({
    direction: 'ltr'
  });
  expect(screen.getByTestId('first-launch-language')).toHaveStyle({
    alignSelf: 'flex-end',
    direction: 'rtl'
  });
  expect(
    screen.getByText('Track spending automatically with AI.')
  ).toHaveStyle({ textAlign: 'left', writingDirection: 'ltr' });
  expect(
    screen.getByText(
      'Bank SMS, Apple Pay, mada, and STC Pay are saved for you.'
    )
  ).toBeOnTheScreen();
  expect(screen.getAllByLabelText('Auto-saved')).toHaveLength(3);
  expect(screen.getByText('Start now')).toBeOnTheScreen();
  expect(usePreferenceStore.getState().firstLaunchOnboardingCompleted).toBe(
    false
  );
});

it('persists completion and opens the temporary Clerk destination', async () => {
  renderWithProviders(<WelcomeRoute />);

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'ابدأ الحين' }));
  });

  expect(usePreferenceStore.getState().firstLaunchOnboardingCompleted).toBe(
    true
  );
  expect(router.replace).toHaveBeenCalledWith('/(public)/auth-pending');
});

it('shows a recoverable error when first-launch persistence fails', async () => {
  mockSavePreferences
    .mockRejectedValueOnce(new Error('storage unavailable'))
    .mockResolvedValueOnce(undefined);
  renderWithProviders(<WelcomeRoute />);

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'ابدأ الحين' }));
  });

  expect(screen.getByRole('alert')).toHaveTextContent(
    'تعذر الحفظ محليًا.'
  );
  expect(router.replace).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'ابدأ الحين' }));
  });

  expect(router.replace).toHaveBeenCalledWith('/(public)/auth-pending');
});

it('keeps transaction examples presentation-only', () => {
  const shellBefore = useAppShellStore.getState();

  renderWithProviders(<WelcomeRoute />);

  expect(useAppShellStore.getState()).toMatchObject({
    session: shellBefore.session,
    onboarding: shellBefore.onboarding,
    pendingDestination: shellBefore.pendingDestination
  });
  expect(screen.getAllByLabelText('تسجيل تلقائيًا')).toHaveLength(3);
});
