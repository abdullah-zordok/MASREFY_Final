import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ProfileSetupScreen } from './ProfileSetupScreen';
import type { ProfileSetupSnapshot } from '@/domain/settings';
import { changeLocale } from '@/localization/i18n';
import { completeSelectionSession } from '@/design-system/components/selection/selection-session';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args)
  }
}));

const snapshot: ProfileSetupSnapshot = {
  complete: false,
  profile: {
    name: 'Backend Name',
    avatar: 'default',
    phone: null,
    googleAccount: 'a***@example.test',
    email: 'a***@example.test',
    country: 'SA',
    currency: 'SAR',
    timeZone: 'Asia/Riyadh',
    completion: [],
    version: 2
  },
  preferences: {
    defaultCurrency: 'SAR',
    language: 'ar',
    theme: 'system',
    calendar: 'gregorian',
    weekStart: 6,
    privacySettings: {},
    version: 3
  },
  onboarding: {
    step: 'welcome',
    completedSteps: [],
    completedAt: null,
    version: 4
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  useAppShellStore.getState().reset();
  useAppShellStore.setState({
    hydrated: true,
    profileSetupStatus: 'incomplete',
    profileSetupSnapshot: snapshot
  });
});

test('matches the Arabic reference and prefills from Clerk before backend name', () => {
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => 'Adel Mohamed'}
      navigateHome={mockReplace}
      service={service()}
    />
  );

  expect(screen.getByTestId('profile-setup-content')).toHaveStyle({
    direction: 'rtl'
  });
  expect(screen.getByText('وش ناديلك؟')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'rtl',
    width: '100%'
  });
  expect(screen.getByText('نستخدمه لتخصيص تجربتك في مصاريفي.')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'rtl',
    width: '100%'
  });
  expect(screen.getByDisplayValue('Adel Mohamed')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'auto'
  });
  expect(screen.queryByText('الاسم')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('الاسم')).toBeOnTheScreen();
  expect(screen.getByText('من حسابك، ويمكنك تعديله في أي وقت.')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'rtl'
  });
  expect(screen.getByText('العملة الأساسية')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'rtl',
    width: '100%'
  });
  expect(screen.getByText('اختر العملة اللي تستخدمها غالبًا.')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'rtl',
    width: '100%'
  });
});

test('keeps Arabic currency code and label in separate deterministic runs', () => {
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => 'Dana'}
      navigateHome={mockReplace}
      service={service()}
    />
  );

  expect(screen.getByText('SAR')).toHaveStyle({ writingDirection: 'ltr' });
  expect(screen.getByText('الريال السعودي')).toHaveStyle({
    writingDirection: 'rtl'
  });
  expect(screen.getByRole('button', { name: /العملة الأساسية/ })).toHaveStyle({
    direction: 'ltr',
    flexDirection: 'row-reverse'
  });
  expect(screen.queryByText(/SAR.*الريال السعودي/)).not.toBeOnTheScreen();
});

test('falls back to the backend name and requires a non-empty value', async () => {
  const saveProfileSetup = jest.fn();
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({ saveProfileSetup })}
    />
  );

  const name = screen.getByLabelText('الاسم');
  expect(name).toHaveDisplayValue('Backend Name');
  fireEvent.changeText(name, '   ');
  fireEvent.press(screen.getByLabelText('متابعة'));

  expect(screen.getByText('اكتب اسمك للمتابعة.')).toBeOnTheScreen();
  expect(saveProfileSetup).not.toHaveBeenCalled();
});

test('keeps edits while switching to English and uses concise LTR copy', async () => {
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service()}
    />
  );
  fireEvent.changeText(screen.getByLabelText('الاسم'), 'My preferred name');

  await act(async () => {
    changeLocale('en');
    usePreferenceStore.setState({ locale: 'en', direction: 'ltr' });
  });

  expect(screen.getByText('What should we call you?')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'ltr',
    width: '100%'
  });
  expect(screen.getByText('We use it to personalize Masarifi.')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'ltr',
    width: '100%'
  });
  expect(screen.getByDisplayValue('My preferred name')).toBeOnTheScreen();
  expect(screen.getByTestId('profile-setup-content')).toHaveStyle({
    direction: 'ltr'
  });
  expect(
    screen.getByText('From your account. You can edit it anytime.')
  ).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'ltr'
  });
  expect(screen.getByText('Base currency')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'ltr',
    width: '100%'
  });
  expect(screen.getByText('Choose the currency you use most.')).toHaveStyle({
    textAlign: 'auto',
    writingDirection: 'ltr',
    width: '100%'
  });
  expect(screen.getByText('Saudi Riyal')).toHaveStyle({
    writingDirection: 'ltr'
  });
  expect(screen.getByRole('button', { name: /Base currency/ })).toHaveStyle({
    direction: 'ltr',
    flexDirection: 'row'
  });
});

test('uses the existing supported-currency selector without losing the name', () => {
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service()}
    />
  );
  fireEvent.changeText(screen.getByLabelText('الاسم'), 'Edited Name');
  fireEvent.press(screen.getByRole('button', { name: /العملة الأساسية/ }));

  const sessionId = mockPush.mock.calls[0]?.[0]?.params?.sessionId as string;
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/currency',
    params: { sessionId }
  });
  act(() => completeSelectionSession(sessionId, 'AED'));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/AED/)).toBeOnTheScreen();
  expect(screen.getByDisplayValue('Edited Name')).toBeOnTheScreen();
});

test('blocks duplicate submission and navigates only after server completion', async () => {
  let resolveSave!: (value: unknown) => void;
  const saveProfileSetup = jest.fn(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      })
  );
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({ saveProfileSetup })}
    />
  );

  fireEvent.press(screen.getByLabelText('متابعة'));
  fireEvent.press(screen.getByLabelText('متابعة'));
  expect(saveProfileSetup).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();

  await act(async () => {
    resolveSave({ value: { ...snapshot, complete: true } });
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  expect(useAppShellStore.getState().profileSetupStatus).toBe('complete');
});

test('preserves the form after save failure and succeeds on retry', async () => {
  const saveProfileSetup = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ value: { ...snapshot, complete: true } });
  const getProfileSetup = jest.fn().mockResolvedValue(snapshot);
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({ getProfileSetup, saveProfileSetup })}
    />
  );
  fireEvent.changeText(screen.getByLabelText('الاسم'), 'Still Here');

  fireEvent.press(screen.getByLabelText('متابعة'));
  await screen.findByText('تعذر حفظ البيانات. حاول مرة ثانية.');
  expect(screen.getByDisplayValue('Still Here')).toBeOnTheScreen();

  await waitFor(() =>
    expect(screen.getByLabelText('متابعة')).toHaveAccessibilityState({
      busy: false
    })
  );

  fireEvent.press(screen.getByLabelText('متابعة'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
});

test('recovers a failed initial server check without inventing local completion', async () => {
  useAppShellStore.setState({
    profileSetupStatus: 'error',
    profileSetupSnapshot: null
  });
  const getProfileSetup = jest.fn().mockResolvedValue(snapshot);
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({ getProfileSetup })}
    />
  );

  fireEvent.press(screen.getByLabelText('إعادة المحاولة'));
  await screen.findByDisplayValue('Backend Name');
  expect(useAppShellStore.getState().profileSetupStatus).toBe('incomplete');
});

function service(overrides: Record<string, unknown> = {}) {
  return {
    getProfileSetup: jest.fn().mockResolvedValue(snapshot),
    saveProfileSetup: jest
      .fn()
      .mockResolvedValue({ value: { ...snapshot, complete: true } }),
    ...overrides
  } as never;
}
