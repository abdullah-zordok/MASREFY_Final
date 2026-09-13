import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AuthPendingScreen } from '@app/(public)/auth-pending';
import { changeLocale } from '@/localization/i18n';
import { createMockSettingsService } from '@/services/mocks/subscription-settings-service';
import { useAppShellStore } from '@/state/app-shell';
import { renderWithProviders } from '@/test-utils/render';

beforeEach(() => {
  jest.clearAllMocks();
  useAppShellStore.getState().reset();
});

test('opens profile setup from the temporary Clerk gate in preview mode', async () => {
  changeLocale('ar');
  renderWithProviders(
    <AuthPendingScreen
      previewService={createMockSettingsService()}
      previewEnabled
    />
  );

  expect(screen.getByText('تسجيل الدخول قريبًا')).toBeOnTheScreen();
  expect(
    screen.getByText('هذه الصفحة مؤقتة وفي انتظار ربط تسجيل الدخول عبر Clerk.')
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'متابعة للتجربة' }));

  await waitFor(() =>
    expect(useAppShellStore.getState().profileSetupStatus).toBe('incomplete')
  );
  expect(useAppShellStore.getState().profileSetupSnapshot?.complete).toBe(
    false
  );
});

test('does not offer the preview bypass in live mode', () => {
  changeLocale('ar');
  renderWithProviders(
    <AuthPendingScreen
      previewService={createMockSettingsService()}
      previewEnabled={false}
    />
  );

  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
