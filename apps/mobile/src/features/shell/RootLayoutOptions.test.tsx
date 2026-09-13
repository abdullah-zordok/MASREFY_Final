import React from 'react';
import { render } from '@testing-library/react-native';

import RootLayout from '@app/_layout';
import AccountsLayout from '@app/accounts/_layout';
import AssistantLayout from '@app/assistant/_layout';
import ProfileLayout from '@app/profile/_layout';
import SecurityLayout from '@app/security/_layout';

const mockStack = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Stack: (props: unknown) => mockStack(props),
  usePathname: () => '/(public)/legal'
}));

jest.mock('@/design-system/typography', () => ({
  FontGate: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock('@/state/FoundationProviders', () => ({
  FoundationProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock('@/state/AppShellProvider', () => ({
  AppShellProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock('@/features/security/AppPrivacyGate', () => ({
  AppPrivacyGate: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock('@/features/shell/ProtectedRouteGate', () => ({
  NotificationResponseRuntime: () => null,
  ProtectedRouteGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));

describe('RootLayout navigation chrome', () => {
  beforeEach(() => {
    mockStack.mockClear();
  });

  it('does not expose Expo route group names as screen headers', () => {
    render(<RootLayout />);

    expect(mockStack).toHaveBeenCalledWith(
      expect.objectContaining({
        screenOptions: expect.objectContaining({ headerShown: false })
      })
    );
  });

  it.each([
    ['accounts', AccountsLayout],
    ['assistant', AssistantLayout],
    ['profile', ProfileLayout],
    ['security', SecurityLayout]
  ])('does not expose nested %s route filenames as headers', (_name, Layout) => {
    render(<Layout />);

    expect(mockStack).toHaveBeenCalledWith(
      expect.objectContaining({
        screenOptions: { headerShown: false }
      })
    );
  });
});
