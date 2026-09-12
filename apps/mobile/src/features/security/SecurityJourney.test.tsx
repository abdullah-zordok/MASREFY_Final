import React from 'react';
import { Alert, AppState, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';

import SecuritySettingsRoute from '@app/security/settings';
import { translate } from '@/localization/i18n';
import { createMockBiometricService } from '@/services/mocks/biometric-service';
import { useAppShellStore } from '@/state/app-shell';
import { renderWithProviders } from '@/test-utils/render';
import { AppPrivacyGate } from './AppPrivacyGate';
import { UnlockScreen } from './UnlockScreen';
import { createPinCredential, resetLock } from './privacy-lock';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn()
}));
jest.mock('@/storage/local-data-reset', () => ({
  resetLocalUserData: jest.fn(async (operationId: string) => ({
    deletedRows: 0,
    operationId
  }))
}));
jest.mock('@/features/settings/settings-queries', () => ({
  usePrivacyRequest: jest.fn()
}));

const requestAccountDeletion = jest.fn();
const { usePrivacyRequest } = jest.requireMock(
  '@/features/settings/settings-queries'
) as { usePrivacyRequest: jest.Mock };

const hasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const isEnrolled = jest.mocked(LocalAuthentication.isEnrolledAsync);
const supportedTypes = jest.mocked(
  LocalAuthentication.supportedAuthenticationTypesAsync
);

beforeEach(() => {
  jest.clearAllMocks();
  usePrivacyRequest.mockReturnValue({
    isPending: false,
    mutate: requestAccountDeletion
  });
  useAppShellStore.getState().reset();
});

describe('security journey', () => {
  it('covers PIN, biometrics, background mask, expiry precedence, reset, and sign-out', async () => {
    const credential = await createPinCredential('123456', '123456');
    expect(credential.hash).toMatch(/^pbkdf2-sha256:/);
    if (!credential.hash) return;

    await useAppShellStore.getState().configurePrivacyLock(credential.hash, 1);
    expect(useAppShellStore.getState().privacyLock).toMatchObject({
      appLockStatus: 'locked'
    });

    const onUnlock = jest.fn(() => useAppShellStore.getState().unlock());
    render(
      <UnlockScreen
        biometricService={createMockBiometricService('supported', 'authenticated')}
        expectedHash={credential.hash}
        onUnlock={onUnlock}
      />
    );
    fireEvent.press(screen.getByLabelText('فتح بالبصمة'));
    expect(await screen.findByText('تم الفتح بالبصمة')).toBeOnTheScreen();

    let listener: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
      listener = callback as (state: string) => void;
      return { remove: jest.fn() };
    });
    render(
      <AppPrivacyGate immediate>
        <Text>Protected</Text>
      </AppPrivacyGate>
    );
    act(() => {
      listener?.('background');
    });
    expect(screen.getByText('المحتوى محمي')).toBeOnTheScreen();

    render(<UnlockScreen expectedHash={credential.hash} sessionExpired />);
    expect(screen.getByText('سجل الدخول للمتابعة')).toBeOnTheScreen();

    await useAppShellStore.getState().resetPrivacyLock();
    expect(useAppShellStore.getState().privacyLock).toBeNull();
    await useAppShellStore.getState().setPrivacyLock(resetLock(1));
    await useAppShellStore.getState().signOut();
    expect(useAppShellStore.getState().session?.status).toBe('signed_out');
    expect(useAppShellStore.getState().privacyLock).toBeNull();
  });

  it('confirms account deletion without navigating to privacy settings', async () => {
    hasHardware.mockResolvedValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    renderWithProviders(<SecuritySettingsRoute />);
    await act(async () => {});

    expect(screen.getByText(translate('appShell.security.pin.create'))).toBeTruthy();
    expect(screen.getByText(translate('appShell.security.biometric.requiresPin'))).toBeTruthy();
    expect(screen.getByText(translate('appShell.security.hideBalances'))).toBeTruthy();

    fireEvent.press(screen.getByText(translate('appShell.security.sessions')));
    fireEvent.press(screen.getByText('حذف الحساب'));

    expect(router.push).toHaveBeenCalledWith('/security/sessions');
    expect(alert).toHaveBeenCalledWith(
      'حذف الحساب',
      'هل أنت متأكد من حذف الحساب؟',
      expect.any(Array)
    );

    const actions = alert.mock.calls[0]?.[2] ?? [];
    actions[1]?.onPress?.();
    expect(requestAccountDeletion).toHaveBeenCalledWith({
      kind: 'account_deletion',
      operationId: expect.stringMatching(/^security-account-deletion-/)
    });
    expect(router.push).not.toHaveBeenCalledWith('/profile/privacy');
    alert.mockRestore();
  });

  it('labels the biometric row with the enrolled kind and blocks it without a PIN', async () => {
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(true);
    supportedTypes.mockResolvedValue([2]);

    renderWithProviders(<SecuritySettingsRoute />);

    expect(
      await screen.findByText(translate('appShell.security.biometric.face'))
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('appShell.security.biometric.requiresPin'))
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        `${translate('appShell.security.biometric.face')}, ${translate('appShell.security.biometric.requiresPin')}`
      )
    ).toBeDisabled();
  });

  it('toggles biometrics on and off once a PIN is configured', async () => {
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(true);
    supportedTypes.mockResolvedValue([1]);

    const credential = await createPinCredential('123456', '123456');
    expect(credential.hash).toMatch(/^pbkdf2-sha256:/);
    if (!credential.hash) return;
    await useAppShellStore.getState().configurePrivacyLock(credential.hash, 1);

    renderWithProviders(<SecuritySettingsRoute />);

    const rowLabel = `${translate('appShell.security.biometric.fingerprint')}, ${translate('appShell.security.biometric.subtitle')}`;
    await waitFor(() => {
      expect(screen.getByLabelText(rowLabel)).toBeEnabled();
    });

    fireEvent.press(screen.getByLabelText(rowLabel));
    await waitFor(() => {
      expect(useAppShellStore.getState().privacyLock?.biometricStatus).toBe(
        'enabled'
      );
    });

    fireEvent.press(screen.getByLabelText(rowLabel));
    await waitFor(() => {
      expect(useAppShellStore.getState().privacyLock?.biometricStatus).toBe(
        'disabled'
      );
    });
  });
});
