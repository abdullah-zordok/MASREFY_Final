import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  Redirect,
  router,
  usePathname,
  useRootNavigationState
} from 'expo-router';

import LanguageRoute from '@app/(public)/language';
import WelcomeRoute from '@app/(public)/welcome';
import SignInRoute from '@app/(public)/sign-in';
import SignUpRoute from '@app/(public)/sign-up';
import PhoneRoute from '@app/(public)/phone';
import OtpRoute from '@app/(public)/otp';
import GoogleRoute from '@app/(public)/google';
import LegalRoute from '@app/(public)/legal';
import AppEntry from '@app/index';
import PublicLayout from '@app/(public)/_layout';
import { changeLocale, translate } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';
import { authenticatedSession } from '@/test-utils/app-shell-fixtures';

jest.mock('@/config/demo-mode', () => ({
  isDemoModeEnabled: () => true
}));
jest.mock('@/services/mocks/client-demo-locale', () => ({
  synchronizeClientDemoLocale: jest.fn().mockResolvedValue(true)
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn()
  },
  Redirect: jest.fn(() => null),
  Stack: () => null,
  usePathname: jest.fn(() => '/welcome'),
  useRootNavigationState: jest.fn(() => ({ key: 'root' }))
}));

const mockRouter = jest.mocked(router);
const mockRedirect = jest.mocked(Redirect);
const mockUsePathname = jest.mocked(usePathname);
const mockUseRootNavigationState = jest.mocked(useRootNavigationState);
const setLocale = usePreferenceStore.getState().setLocale;

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/welcome');
  mockUseRootNavigationState.mockReturnValue({ key: 'root' } as never);
  changeLocale('ar');
  useAppShellStore.getState().reset();
  usePreferenceStore.setState({
    locale: 'ar',
    direction: 'rtl',
    hydrated: true,
    setLocale
  });
});

describe('public auth routes', () => {
  it('persists language and opens welcome', async () => {
    renderWithProviders(<LanguageRoute />);

    fireEvent.press(screen.getByLabelText('الإنجليزية'));

    await waitFor(() => {
      expect(usePreferenceStore.getState().locale).toBe('en');
      expect(mockRouter.replace).toHaveBeenCalledWith('/(public)/welcome');
    });

    renderWithProviders(<WelcomeRoute />);
    expect(
      screen.getByText(translate('appShell.public.welcome.body', 'en'))
    ).toBeTruthy();
  });

  it('stays on language selection when locale synchronization fails', async () => {
    usePreferenceStore.setState({
      setLocale: jest.fn().mockResolvedValue(false)
    });
    renderWithProviders(<LanguageRoute />);

    fireEvent.press(screen.getByLabelText('الإنجليزية'));

    await waitFor(() =>
      expect(usePreferenceStore.getState().setLocale).toHaveBeenCalledWith('en')
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens welcome, sign-in, sign-up, legal, phone, and Google paths without passwords', () => {
    renderWithProviders(<WelcomeRoute />);
    fireEvent.press(screen.getByLabelText('تسجيل الدخول'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(public)/sign-in');
    fireEvent.press(screen.getByLabelText('إنشاء حساب'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(public)/sign-up');

    renderWithProviders(<SignInRoute />);
    expect(screen.queryByText(/password/i)).toBeNull();
    fireEvent.press(screen.getByLabelText('رقم الهاتف'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(public)/phone');
    fireEvent.press(screen.getByLabelText('جوجل'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(public)/google');

    renderWithProviders(<SignUpRoute />);
    expect(screen.queryByText(/password/i)).toBeNull();

    renderWithProviders(<LegalRoute />);
    expect(
      screen.getByText(translate('appShell.public.privacyBody'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('appShell.public.termsBody'))
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('رجوع'));

    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('runs phone, OTP, and Google mock auth into the app-shell store', async () => {
    renderWithProviders(<PhoneRoute />);
    expect(screen.getByText(translate('appShell.auth.phone.title'))).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('رمز الدولة'), '+20');
    fireEvent.changeText(screen.getByLabelText('رقم الهاتف'), '5550100');
    fireEvent.press(screen.getByLabelText('إرسال الرمز'));

    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith('/(public)/otp')
    );

    renderWithProviders(<OtpRoute />);
    expect(screen.getByText(translate('appShell.auth.otp.title'))).toBeTruthy();
    fireEvent.changeText(
      screen.getAllByLabelText(/رمز من ستة أرقام/)[0],
      '000000'
    );
    fireEvent.press(screen.getByLabelText('تحقق'));

    await waitFor(() =>
      expect(useAppShellStore.getState().session?.status).toBe('authenticated')
    );

    useAppShellStore.getState().reset();
    renderWithProviders(<GoogleRoute />);
    expect(screen.getByText(translate('appShell.auth.google.title'))).toBeTruthy();
    fireEvent.press(screen.getByLabelText('اختر حساب جوجل'));

    await waitFor(() =>
      expect(useAppShellStore.getState().session?.method).toBe('google')
    );
  });

  it('redirects authenticated users out of public credential routes', () => {
    useAppShellStore.setState({
      hydrated: true,
      session: authenticatedSession
    });

    renderWithProviders(<PublicLayout />);

    expect(mockRedirect.mock.calls[0]?.[0]).toMatchObject({
      href: '/(tabs)/home'
    });
  });

  it('keeps the registered tab route when refreshing the authenticated app root', () => {
    useAppShellStore.setState({
      hydrated: true,
      session: authenticatedSession
    });

    renderWithProviders(<AppEntry />);

    expect(mockRedirect.mock.calls[0]?.[0]).toMatchObject({
      href: '/(tabs)/home'
    });
  });

  it('2026-08-10 regression keeps the public navigator mounted until the root navigator is ready', () => {
    mockUseRootNavigationState.mockReturnValue(undefined as never);
    useAppShellStore.setState({
      hydrated: true,
      session: authenticatedSession
    });

    renderWithProviders(<PublicLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not override a protected deep-link destination after leaving public routes', () => {
    mockUsePathname.mockReturnValue('/tracking');
    useAppShellStore.setState({
      hydrated: true,
      session: authenticatedSession,
      pendingDestination: null
    });

    renderWithProviders(<PublicLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
