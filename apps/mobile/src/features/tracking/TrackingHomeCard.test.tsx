import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, Dimensions, StyleSheet } from 'react-native';

import type { TrackingStatusSnapshot } from '@/domain/automatic-tracking';
import { createNotificationPreferences } from '@/domain/notifications';
import { spacing } from '@/design-system/tokens';
import { changeLocale, translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { TrackingHomeCard } from './TrackingHomeCard';
import { useTrackingStatus } from './useAutomaticTracking';

const mockRequestPermission = jest.fn();
const mockOpenSettings = jest.fn();
const mockRefetchPermission = jest.fn();
const mockRefetchTrackingStatus = jest.fn();
const mockSavePreferences = jest.fn();
const mockRefetchPreferences = jest.fn();
let mockNotificationPreferences = {
  ...createNotificationPreferences(1),
  version: 1
};
let mockNotificationPermission:
  | 'not_requested'
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'unavailable' = 'not_requested';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./useAutomaticTracking', () => ({ useTrackingStatus: jest.fn() }));
jest.mock('@/features/notifications/notification-preferences-queries', () => ({
  useNotificationPreferences: () => ({
    data: mockNotificationPreferences,
    isLoading: false,
    isError: false,
    refetch: mockRefetchPreferences
  }),
  useNotificationPermission: () => ({
    data: mockNotificationPermission,
    isLoading: false,
    isError: false,
    refetch: mockRefetchPermission
  }),
  useOpenNotificationSettings: () => ({
    isPending: false,
    mutate: mockOpenSettings
  }),
  useRequestNotificationPermission: () => ({
    isPending: false,
    mutate: mockRequestPermission,
    mutateAsync: mockRequestPermission
  }),
  useSaveNotificationPreferences: () => ({
    isPending: false,
    mutateAsync: mockSavePreferences
  })
}));

const mockUseTrackingStatus = useTrackingStatus as jest.Mock;

function status(
  overrides: Partial<TrackingStatusSnapshot> = {}
): TrackingStatusSnapshot {
  return {
    platform: 'android',
    mode: 'review_all',
    permissionStatus: 'not_requested',
    serviceState: 'healthy',
    lastDetectedAt: null,
    lastSuccessfulTransactionId: null,
    detectedThisMonth: 0,
    reviewCount: 0,
    activeKeywordCount: 0,
    activeSenderCount: 0,
    lastUpdatedAt: 0,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotificationPreferences = {
    ...createNotificationPreferences(1),
    version: 1
  };
  mockNotificationPermission = 'not_requested';
  changeLocale('en');
  useAppShellStore.getState().reset();
  useAppShellStore.setState({
    hydrated: true,
    profileSetupStatus: 'complete',
    session: {
      status: 'authenticated',
      userId: 'user-1',
      method: 'google',
      issuedAt: 10,
      expiresAt: 20,
      restoration: 'restored'
    },
    trackingHomeCardDismissed: false
  });
  mockRequestPermission.mockResolvedValue('granted');
  mockRefetchPreferences.mockResolvedValue({
    data: {
      ...mockNotificationPreferences,
      version: 2,
      permissionState: 'granted'
    }
  });
  mockSavePreferences.mockResolvedValue(undefined);
});

it('shows reference-sized setup cards in one horizontal rail', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByText('Turn on notifications')).toBeTruthy();
  expect(
    screen.getByText(translate('tracking.source.smsTracking'))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('tracking.source.notificationTracking'))
  ).toBeTruthy();
  expect(screen.getByTestId('home-setup-cards-rail').props.horizontal).toBe(
    true
  );
  expect(
    StyleSheet.flatten(
      screen.getByTestId('home-setup-cards-rail').props.contentContainerStyle
    )
  ).toMatchObject({
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center'
  });
  const notificationCardStyle = StyleSheet.flatten(
    screen.getByTestId('notification-home-card').props.style
  );
  const smsCardStyle = StyleSheet.flatten(
    screen.getByTestId('sms-tracking-home-card').props.style
  );
  const transactionNotificationCardStyle = StyleSheet.flatten(
    screen.getByTestId('notification-tracking-home-card').props.style
  );
  expect(notificationCardStyle).toMatchObject({
    borderRadius: 18 * 1.05,
    height: (168 + spacing.sm) * 1.05,
    padding: spacing.lg * 1.05,
    width: smsCardStyle.width
  });
  expect(smsCardStyle).toEqual(notificationCardStyle);
  expect(transactionNotificationCardStyle).toEqual(notificationCardStyle);
});

it('keeps the notification card first and centered in the Arabic rail', () => {
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  const railStyle = StyleSheet.flatten(
    screen.getByTestId('home-setup-cards-rail').props.contentContainerStyle
  );
  const cardStyle = StyleSheet.flatten(
    screen.getByTestId('notification-home-card').props.style
  );
  expect(railStyle.flexDirection).toBe('row');
  expect(railStyle.paddingHorizontal).toBe(
    Math.max(
      1,
      (Dimensions.get('window').width - spacing.xxl * 1.05 - cardStyle.width) /
        2
    )
  );
});

it('requests OS permission directly from the Home notification card', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);
  fireEvent.press(screen.getByRole('button', { name: 'Enable notifications' }));

  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  expect(mockSavePreferences).not.toHaveBeenCalled();
});

it.each(['denied', 'permanently_denied'] as const)(
  'opens system settings when notification permission is %s',
  (permissionState) => {
    mockNotificationPermission = permissionState;
    mockUseTrackingStatus.mockReturnValue({
      data: status(),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);
    fireEvent.press(
      screen.getByRole('button', { name: 'Open notification settings' })
    );

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  }
);

it('refreshes notification and tracking permissions when the app becomes active', () => {
  const listeners: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    listeners.push(listener as (state: string) => void);
    return { remove: jest.fn() };
  });
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false,
    refetch: mockRefetchTrackingStatus
  });

  renderWithProviders(<TrackingHomeCard />);
  act(() => listeners.forEach((listener) => listener('active')));

  expect(mockRefetchPermission).toHaveBeenCalledTimes(1);
  expect(mockRefetchTrackingStatus).toHaveBeenCalledTimes(1);
});

it('shows source-specific tracking cards for an eligible authenticated user', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByText("Let's get started.")).toBeTruthy();
  expect(
    screen.getByText(translate('tracking.source.smsTracking'))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('tracking.source.notificationTracking'))
  ).toBeTruthy();
  expect(
    screen.queryByLabelText(translate('tracking.home.dismissAction'))
  ).toBeNull();
  expect(screen.getByTestId('sms-tracking-home-icon')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-icon')).toBeTruthy();
});

it('shows the tracking logo without a background badge', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(
    StyleSheet.flatten(screen.getByTestId('sms-tracking-home-icon').props.style)
  ).toMatchObject({
    backgroundColor: 'transparent',
    height: 36 * 1.05,
    width: 36 * 1.05
  });
});

it('opens the existing tracking setup flow from either source card', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);
  const actionName = translate('tracking.home.enableAction');
  fireEvent.press(
    within(screen.getByTestId('sms-tracking-home-card')).getByRole('button', {
      name: actionName
    })
  );
  fireEvent.press(
    within(screen.getByTestId('notification-tracking-home-card')).getByRole(
      'button',
      { name: actionName }
    )
  );

  expect(router.push).toHaveBeenCalledTimes(2);
  expect(router.push).toHaveBeenNthCalledWith(1, '/tracking');
  expect(router.push).toHaveBeenNthCalledWith(2, '/tracking');
});

it.each([
  { session: null, profileSetupStatus: 'complete' as const },
  {
    session: useAppShellStore.getState().session,
    profileSetupStatus: 'incomplete' as const
  }
])(
  'stays hidden before authentication and profile setup are complete',
  (shell) => {
    useAppShellStore.setState(shell);
    mockUseTrackingStatus.mockReturnValue({
      data: status(),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);

    expect(screen.queryByTestId('tracking-home-onboarding')).toBeNull();
  }
);

it.each(['denied', 'permanently_denied', 'revoked'] as const)(
  'shows tracking setup while Android sources are %s',
  (permissionStatus) => {
    mockUseTrackingStatus.mockReturnValue({
      data: status({
        permissionStatus,
        smsPermissionStatus: permissionStatus,
        notificationAccessStatus: 'denied'
      }),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);

    expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
    expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
  }
);

it('hides tracking setup when both Android sources are unavailable', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'unavailable',
      smsPermissionStatus: 'unavailable',
      notificationAccessStatus: 'unavailable',
      serviceState: 'unavailable'
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('sms-tracking-home-card')).toBeNull();
  expect(screen.queryByTestId('notification-tracking-home-card')).toBeNull();
});

it('shows only tracking when push is enabled and tracking sources are disabled', () => {
  mockNotificationPermission = 'granted';
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'denied',
      smsPermissionStatus: 'denied',
      notificationAccessStatus: 'denied'
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('notification-home-card')).toBeNull();
  expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
});

it('shows both cards when push and tracking sources are disabled', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'denied',
      smsPermissionStatus: 'denied',
      notificationAccessStatus: 'denied'
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByTestId('notification-home-card')).toBeTruthy();
  expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
});

it('shows one setup card for each disabled notification and tracking source', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: false,
      notificationTrackingEnabled: false
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByTestId('notification-home-card')).toBeTruthy();
  expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
});

it('restores only the affected source cards after Android permissions are revoked', () => {
  mockNotificationPermission = 'granted';
  useAppShellStore.setState({ trackingHomeCardDismissed: true });
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'denied',
      smsPermissionStatus: 'denied',
      notificationAccessStatus: 'denied',
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('notification-home-card')).toBeNull();
  expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
});

it.each([
  [
    'SMS',
    {
      smsPermissionStatus: 'granted' as const,
      notificationAccessStatus: 'denied' as const,
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true
    },
    'sms-tracking-home-card',
    'notification-tracking-home-card'
  ],
  [
    'transaction notifications',
    {
      smsPermissionStatus: 'denied' as const,
      notificationAccessStatus: 'granted' as const,
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true
    },
    'notification-tracking-home-card',
    'sms-tracking-home-card'
  ]
] as const)(
  'hides only the enabled %s source card',
  (_source, sourceStatus, hiddenCard, visibleCard) => {
    mockNotificationPermission = 'granted';
    mockUseTrackingStatus.mockReturnValue({
      data: status({
        permissionStatus: 'granted',
        ...sourceStatus
      }),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);

    expect(screen.queryByTestId(hiddenCard)).toBeNull();
    expect(screen.getByTestId(visibleCard)).toBeTruthy();
  }
);

it.each([
  { data: status({ platform: 'ios', permissionStatus: null }) },
  { data: undefined, isLoading: true },
  { data: undefined, isError: true }
])('stays hidden for an ineligible or unresolved state', (query) => {
  mockUseTrackingStatus.mockReturnValue({
    isLoading: false,
    isError: false,
    ...query
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('sms-tracking-home-card')).toBeNull();
  expect(screen.queryByTestId('notification-tracking-home-card')).toBeNull();
});

it('hides the setup section when notifications and tracking are already enabled', () => {
  mockNotificationPermission = 'granted';
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('tracking-home-onboarding')).toBeNull();
});

it('shows both tracking cards when permissions exist but both sources are off', () => {
  mockNotificationPermission = 'granted';
  mockUseTrackingStatus.mockReturnValue({
    data: status({
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: false,
      notificationTrackingEnabled: false
    }),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByTestId('sms-tracking-home-card')).toBeTruthy();
  expect(screen.getByTestId('notification-tracking-home-card')).toBeTruthy();
});

it.each([
  ['ar', 'rtl', 'row-reverse'],
  ['en', 'ltr', 'row']
] as const)(
  'uses the physical %s layout direction',
  (locale, direction, flexDirection) => {
    changeLocale(locale);
    usePreferenceStore.setState({ locale, direction });
    mockUseTrackingStatus.mockReturnValue({
      data: status(),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);

    expect(
      StyleSheet.flatten(
        screen.getByTestId('sms-tracking-home-card-header').props.style
      )
    ).toMatchObject({ direction: 'ltr', flexDirection });
    expect(
      StyleSheet.flatten(
        screen.getByTestId('tracking-home-onboarding').props.style
      )
    ).toMatchObject({ direction: 'ltr' });
    expect(
      StyleSheet.flatten(
        screen.getByTestId('tracking-home-heading').props.style
      )
    ).toMatchObject({ textAlign: direction === 'rtl' ? 'right' : 'left' });
  }
);
