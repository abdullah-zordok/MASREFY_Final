import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import type { TrackingStatusSnapshot } from '@/domain/automatic-tracking';
import { changeLocale, translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { TrackingHomeCard } from './TrackingHomeCard';
import { useTrackingStatus } from './useAutomaticTracking';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./useAutomaticTracking', () => ({ useTrackingStatus: jest.fn() }));

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
});

it('shows the onboarding card for an eligible authenticated user', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.getByText("Let's get started.")).toBeTruthy();
  expect(screen.getByText(translate('tracking.home.enableTitle'))).toBeTruthy();
  expect(screen.getByText(translate('tracking.home.enableBody'))).toBeTruthy();
  expect(
    screen.getByLabelText(translate('tracking.home.dismissAction'))
  ).toBeTruthy();
  expect(screen.getByTestId('tracking-home-message-icon')).toBeTruthy();
  expect(screen.getAllByTestId(/tracking-home-message-dot-/)).toHaveLength(3);
});

it('shows the message icon without a badge at ninety percent size in light green', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(
    StyleSheet.flatten(screen.getByTestId('tracking-home-message-icon').props.style)
  ).toMatchObject({
    backgroundColor: 'transparent',
    height: 36,
    width: 36
  });
  expect(
    StyleSheet.flatten(screen.getByTestId('tracking-home-message-bubble').props.style)
  ).toMatchObject({ backgroundColor: '#2E8A76' });
});

it('opens the existing tracking setup flow without enabling tracking directly', () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);
  fireEvent.press(
    screen.getByRole('button', {
      name: translate('tracking.home.enableAction')
    })
  );

  expect(router.push).toHaveBeenCalledWith('/tracking');
});

it('dismisses only the card and does not navigate', async () => {
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);
  await act(async () => {
    fireEvent.press(
      screen.getByLabelText(translate('tracking.home.dismissAction'))
    );
  });

  expect(screen.queryByTestId('tracking-home-onboarding')).toBeNull();
  expect(useAppShellStore.getState().trackingHomeCardDismissed).toBe(true);
  expect(router.push).not.toHaveBeenCalled();
});

it('stays hidden after the current user dismissed it', () => {
  useAppShellStore.setState({ trackingHomeCardDismissed: true });
  mockUseTrackingStatus.mockReturnValue({
    data: status(),
    isLoading: false,
    isError: false
  });

  renderWithProviders(<TrackingHomeCard />);

  expect(screen.queryByTestId('tracking-home-onboarding')).toBeNull();
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

it.each([
  'granted',
  'denied',
  'permanently_denied',
  'revoked',
  'unavailable'
] as const)(
  'stays hidden after Android permission is %s',
  (permissionStatus) => {
    mockUseTrackingStatus.mockReturnValue({
      data: status({ permissionStatus }),
      isLoading: false,
      isError: false
    });

    renderWithProviders(<TrackingHomeCard />);

    expect(screen.queryByRole('button')).toBeNull();
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

  expect(screen.queryByRole('button')).toBeNull();
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
        screen.getByTestId('tracking-home-card-header').props.style
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
