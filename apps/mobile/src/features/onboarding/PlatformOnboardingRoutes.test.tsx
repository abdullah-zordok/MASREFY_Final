import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AndroidIntroRoute from '@app/(onboarding)/tracking-intro';
import AndroidPermissionRoute from '@app/(onboarding)/android-sms-permission';
import IosOptionsRoute from '@app/(onboarding)/ios-capture-options';
import IosAutomationRoute from '@app/(onboarding)/ios-automation';
import DemoRoute from '@app/(onboarding)/tracking-demo';
import CompleteRoute from '@app/(onboarding)/complete';
import OnboardingLayout from '@app/(onboarding)/_layout';
import { ConservativeCaptureDemo } from './ConservativeCaptureDemo';
import { translate } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';
import { renderWithProviders } from '@/test-utils/render';
import { androidOnboarding } from '@/test-utils/app-shell-fixtures';

const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: (props: { href: string }) => mockRedirect(props),
  usePathname: () => '/tracking-intro',
  Stack: () => null
}));

beforeEach(() => useAppShellStore.getState().reset());

describe('platform onboarding routes', () => {
  it('allows onboarding to open without a current session', () => {
    useAppShellStore.setState({
      hydrated: true,
      session: {
        status: 'authenticated',
        userId: 'user-expired',
        method: 'phone',
        issuedAt: 1,
        expiresAt: 2,
        restoration: 'restored'
      }
    });

    renderWithProviders(<OnboardingLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('shows Android tracking as unavailable and continues without requesting SMS access', async () => {
    useAppShellStore.setState({ onboarding: androidOnboarding });
    renderWithProviders(<AndroidIntroRoute />);
    expect(screen.getByText('إعداد التتبع التلقائي')).toBeOnTheScreen();
    expect(screen.queryByText(/الراتب|ميزانية/)).toBeNull();

    renderWithProviders(<AndroidPermissionRoute />);
    await waitFor(() => expect(screen.getByText('الإذن غير متاح')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('متابعة'));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/(onboarding)/tracking-demo')
    );
    expect(useAppShellStore.getState().onboarding?.skippedSteps).toEqual(
      expect.arrayContaining([
        'permission_education',
        'permission_request',
        'keywords',
        'preference'
      ])
    );
  });

  it('keeps iOS and conservative routes free of SMS permission actions', () => {
    renderWithProviders(<IosOptionsRoute />);
    expect(screen.getByText('الإدخال على iOS')).toBeOnTheScreen();
    expect(screen.queryByLabelText('تفعيل التتبع')).toBeNull();

    renderWithProviders(<IosAutomationRoute />);
    expect(screen.queryByLabelText('تفعيل التتبع')).toBeNull();

    renderWithProviders(<ConservativeCaptureDemo />);
    fireEvent.press(screen.getByLabelText(translate('capture.manual')));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/add');
    fireEvent.press(screen.getByLabelText(translate('capture.voice')));
    expect(router.push).toHaveBeenCalledWith('/assistant');
    expect(screen.queryByText(/SMS|إذن الرسائل/)).toBeNull();
    expect(screen.getByText('إضافة يدوية')).toBeOnTheScreen();
    expect(screen.getByText('إضافة صوتية')).toBeOnTheScreen();
  });

  it('routes iOS manual and voice fallbacks safely', () => {
    renderWithProviders(<IosOptionsRoute />);

    fireEvent.press(screen.getByLabelText(translate('capture.manual')));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/add');

    fireEvent.press(screen.getByLabelText(translate('capture.voice')));
    expect(router.push).toHaveBeenCalledWith('/assistant');
  });

  it('shows safe demo and completion without requiring profile data', () => {
    renderWithProviders(<DemoRoute />);
    fireEvent.press(screen.getByLabelText(translate('trust.undo')));
    expect(screen.getByText(translate('appShell.tracking.demo.undo'))).toBeOnTheScreen();
    expect(screen.getByText('معاينة التتبع')).toBeOnTheScreen();
    expect(screen.getByLabelText('تراجع')).toBeOnTheScreen();

    renderWithProviders(<CompleteRoute />);
    expect(screen.getAllByText('جاهز للمتابعة')).toHaveLength(1);
    expect(screen.getByText(translate('appShell.onboarding.complete.destinations'))).toBeOnTheScreen();
    expect(screen.getByLabelText(translate('appShell.onboarding.complete.openHome'))).toBeOnTheScreen();
  });
});
