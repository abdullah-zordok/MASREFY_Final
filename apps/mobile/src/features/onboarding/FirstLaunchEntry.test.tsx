import React from 'react';
import { render } from '@testing-library/react-native';

import AppEntry from '@app/index';
import { buildPreferences } from '@/domain/foundation';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props)
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAppShellStore.getState().reset();
  useAppShellStore.setState({ hydrated: true });
  usePreferenceStore.setState({
    ...buildPreferences({ firstLaunchOnboardingCompleted: false }),
    hydrated: true
  });
});

it('routes fresh local state to first-launch onboarding', () => {
  render(<AppEntry />);

  expect(mockRedirect).toHaveBeenCalledWith({ href: '/welcome' });
});

it('routes completed local welcome state to the Clerk integration placeholder', () => {
  usePreferenceStore.setState({ firstLaunchOnboardingCompleted: true });

  render(<AppEntry />);

  expect(mockRedirect).toHaveBeenCalledWith({
    href: '/(public)/auth-pending'
  });
});
