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

jest.mock('@/services/live/clerk-provider', () => ({
  getLiveClerkDisplayName: () => null
}));

test('does not switch a usable profile form to global Loading while refreshing after a failed save', async () => {
  let finish!: (value: ProfileSetupSnapshot) => void;
  let started!: () => void;
  const refreshStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const refresh = new Promise<ProfileSetupSnapshot>((resolve) => {
    finish = resolve;
  });
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({
        saveProfileSetup: async () => {
          throw new Error('offline');
        },
        getProfileSetup: () => {
          started();
          return refresh;
        }
      })}
    />
  );
  fireEvent.press(screen.getByLabelText('متابعة'));
  await act(async () => {
    await refreshStarted;
  });
  const status = useAppShellStore.getState().profileSetupStatus;
  await act(async () => {
    finish(snapshot);
  });
  expect(status).toBe('incomplete');
});

test('does not complete or navigate the replacement owner after an old profile save resolves', async () => {
  useAppShellStore.setState({
    session: {
      status: 'authenticated',
      userId: 'user_live_old',
      method: 'google',
      issuedAt: 1,
      expiresAt: 4_000_000_000_000,
      restoration: 'restored'
    }
  });
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => null}
      navigateHome={mockReplace}
      service={service({ saveProfileSetup: () => pending })}
    />
  );
  fireEvent.press(screen.getByLabelText('متابعة'));
  act(() =>
    useAppShellStore.setState({
      session: {
        status: 'authenticated',
        userId: 'user_live_new',
        method: 'google',
        issuedAt: 2,
        expiresAt: 4_000_000_000_000,
        restoration: 'restored'
      },
      profileSetupSnapshot: {
        ...snapshot,
        profile: { ...snapshot.profile, name: 'New owner' }
      }
    })
  );
  await act(async () => {
    finish({ value: { ...snapshot, complete: true } });
  });
  expect(useAppShellStore.getState().profileSetupSnapshot?.profile.name).toBe(
    'New owner'
  );
  expect(mockReplace).not.toHaveBeenCalled();
});

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
    currencySelectionRequired: false,
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

test('requires an explicit currency choice for a new customer before onboarding can save', async () => {
  useAppShellStore.setState({
    profileSetupSnapshot: {
      ...snapshot,
      preferences: {
        ...snapshot.preferences,
        version: 3,
        currencySelectionRequired: true
      },
      onboarding: {
        ...snapshot.onboarding,
        completedSteps: ['welcome'],
        step: 'tracking_intro'
      }
    }
  });
  const saveProfileSetup = jest.fn();
  renderWithProviders(
    <ProfileSetupScreen service={service({ saveProfileSetup })} />
  );
  expect(screen.queryByText('SAR')).not.toBeOnTheScreen();
  fireEvent.press(screen.getByLabelText('متابعة'));
  expect(saveProfileSetup).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: /العملة الأساسية/ }));
  const sessionId = mockPush.mock.calls[0]?.[0]?.params?.sessionId as string;
  act(() => completeSelectionSession(sessionId, 'AED'));
  fireEvent.press(screen.getByLabelText('متابعة'));
  await waitFor(() =>
    expect(saveProfileSetup).toHaveBeenCalledWith(
      { name: 'Backend Name', currency: 'AED' },
      expect.anything(),
      expect.any(String)
    )
  );
});

test('requires a picker choice when an older API omits currency provenance despite completed welcome', () => {
  useAppShellStore.setState({
    profileSetupSnapshot: {
      ...snapshot,
      preferences: {
        ...snapshot.preferences,
        currencySelectionRequired: undefined
      },
      onboarding: {
        ...snapshot.onboarding,
        step: 'tracking_intro',
        completedSteps: ['welcome']
      }
    }
  });
  const saveProfileSetup = jest.fn();
  renderWithProviders(
    <ProfileSetupScreen service={service({ saveProfileSetup })} />
  );
  expect(screen.queryByText('SAR')).not.toBeOnTheScreen();
  fireEvent.press(screen.getByLabelText('متابعة'));
  expect(saveProfileSetup).not.toHaveBeenCalled();
});

test('does not preselect a fallback when the confirmed backend currency is unsupported', () => {
  useAppShellStore.setState({
    profileSetupSnapshot: {
      ...snapshot,
      preferences: {
        ...snapshot.preferences,
        defaultCurrency: 'XXX',
        currencySelectionRequired: false
      }
    }
  });
  renderWithProviders(<ProfileSetupScreen service={service()} />);
  expect(screen.queryByText('SAR')).not.toBeOnTheScreen();
});

test('matches the Arabic reference and keeps the saved name ahead of Clerk prefill', () => {
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
  expect(screen.getByDisplayValue('Backend Name')).toHaveStyle({
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

test.each(['Typed Person', ''])(
  'preserves active typing %s when a delayed saved profile arrives',
  (typedName) => {
    useAppShellStore.setState({
      profileSetupSnapshot: null,
      profileSetupStatus: 'loading'
    });
    renderWithProviders(
      <ProfileSetupScreen
        getClerkName={() => 'Provider Person'}
        service={service()}
      />
    );
    fireEvent.changeText(screen.getByLabelText('الاسم'), 'Typed Person');
    fireEvent.changeText(screen.getByLabelText('الاسم'), typedName);
    act(() =>
      useAppShellStore.setState({
        profileSetupSnapshot: snapshot,
        profileSetupStatus: 'incomplete'
      })
    );
    expect(screen.getByLabelText('الاسم')).toHaveDisplayValue(typedName);
  }
);

test('replaces only the provider prefill when a delayed saved name arrives', () => {
  useAppShellStore.setState({
    profileSetupSnapshot: null,
    profileSetupStatus: 'loading'
  });
  renderWithProviders(
    <ProfileSetupScreen
      getClerkName={() => 'Provider Person'}
      service={service()}
    />
  );
  expect(screen.getByLabelText('الاسم')).toHaveDisplayValue('Provider Person');
  act(() =>
    useAppShellStore.setState({
      profileSetupSnapshot: snapshot,
      profileSetupStatus: 'incomplete'
    })
  );
  expect(screen.getByLabelText('الاسم')).toHaveDisplayValue('Backend Name');
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
