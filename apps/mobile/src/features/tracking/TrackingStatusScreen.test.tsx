import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, PixelRatio } from 'react-native';
import { router } from 'expo-router';

import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import { renderWithQueryData } from '@/test-utils/render';
import { changeLocale, translate } from '@/localization/i18n';
import {
  TrackingStatusScreen,
  TrackingSyncPanel
} from './TrackingStatusScreen';
import { createAppShellStorage } from '@/storage/app-shell-storage';
import { defaultKeywordRules } from '@/services/mocks/default-keywords';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import * as trackingPermissionModule from '@/services/platform/tracking-permission-service';
import { permissionState } from '@/services/mocks/tracking-permission-service';
import type { TrackingStatusSnapshot } from '@/domain/automatic-tracking';
import { usePreferenceStore } from '@/state/preferences';
import { bankNotificationService } from '@/services/platform/bank-notification-service';
import { trackingSourcePreferences } from '@/services/tracking-source-preferences';

const openSmsSettings = jest.fn(async () => undefined);

function renderStatus(
  status: TrackingStatusSnapshot,
  requestedPermissionStatus = status.permissionStatus ?? 'not_requested'
) {
  jest.spyOn(automaticTrackingService, 'getStatus').mockResolvedValue(status);
  jest
    .spyOn(bankNotificationService, 'getAccessState')
    .mockResolvedValue(status.notificationAccessStatus ?? 'denied');
  jest.spyOn(trackingSourcePreferences, 'load').mockResolvedValue({
    smsEnabled:
      status.smsTrackingEnabled ??
      (status.mode !== 'paused' && status.permissionStatus === 'granted'),
    notificationEnabled: status.notificationTrackingEnabled ?? false
  });
  jest
    .spyOn(trackingPermissionModule, 'createTrackingPermissionService')
    .mockReturnValue({
      getState: async () =>
        permissionState(status.permissionStatus ?? 'not_requested'),
      requestAfterEducation: jest.fn(async () =>
        permissionState(requestedPermissionStatus)
      ),
      openSettings: openSmsSettings
    });
  return renderWithQueryData(<TrackingStatusScreen />, [
    [automaticTrackingKeys.status, status]
  ]);
}

describe('TrackingStatusScreen', () => {
  beforeEach(async () => {
    openSmsSettings.mockClear();
    const storage = createAppShellStorage();
    await storage.saveKeywords(defaultKeywordRules);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders tracking status, how it works, and keyword chips with dynamic count', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 12,
      reviewCount: 3,
      activeKeywordCount: 22,
      activeSenderCount: 5,
      lastUpdatedAt: Date.now()
    });

    // 1. Header & Status
    expect(
      await screen.findByText(translate('tracking.header.title'))
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.source.smsTrackingDescription'))
    ).toBeOnTheScreen();
    expect(screen.getByTestId('tracking-sms-switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true })
    );

    // 2. How it works explanations
    expect(
      screen.getByText(translate('tracking.howItWorks.detection'))
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.howItWorks.privacy'))
    ).toBeOnTheScreen();

    // 3. Keywords section with real keywords
    await waitFor(() => {
      expect(
        screen.getByText(
          new RegExp(translate('tracking.keywords.sectionTitle'))
        )
      ).toBeOnTheScreen();
    });

    // Grocery / مصروف should be in the default keywords
    expect(screen.getByText('Grocery')).toBeOnTheScreen();
    expect(screen.getByText('مصروف')).toBeOnTheScreen();
  });

  it('shows independent SMS and transaction notification tracking switches', async () => {
    changeLocale('en');
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: true,
      notificationTrackingEnabled: false,
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    } as TrackingStatusSnapshot);

    expect(await screen.findByText('SMS tracking')).toBeOnTheScreen();
    expect(
      screen.getByText('Read financial SMS and match your tracking keywords')
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Transaction notification tracking')
    ).toBeOnTheScreen();
    expect(screen.getByTestId('tracking-sms-switch')).toBeOnTheScreen();
    expect(
      screen.getByTestId('tracking-notification-switch')
    ).toBeOnTheScreen();
    expect(screen.getByTestId('tracking-sms-switch')).toBeEnabled();
    expect(screen.getByTestId('tracking-notification-switch')).toBeEnabled();
  });

  it('turns off SMS tracking without pausing enabled notification tracking', async () => {
    const saveSource = jest
      .spyOn(trackingSourcePreferences, 'set')
      .mockResolvedValue({ smsEnabled: false, notificationEnabled: true });
    const setMode = jest
      .spyOn(automaticTrackingService, 'setMode')
      .mockResolvedValue({} as never);
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true,
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    });

    fireEvent.press(await screen.findByTestId('tracking-sms-switch'));

    await waitFor(() => expect(saveSource).toHaveBeenCalledWith('sms', false));
    expect(setMode).not.toHaveBeenCalledWith('paused');
  });

  it.each(['denied', 'revoked'] as const)(
    'requests Android SMS permission directly from the SMS switch when permission is %s',
    async (permissionStatus) => {
      const saveSource = jest
        .spyOn(trackingSourcePreferences, 'set')
        .mockResolvedValue({ smsEnabled: true, notificationEnabled: false });
      const setMode = jest
        .spyOn(automaticTrackingService, 'setMode')
        .mockResolvedValue({} as never);
      const push = jest.spyOn(router, 'push');
      renderStatus(
        {
          platform: 'android',
          mode: 'paused',
          permissionStatus,
          smsPermissionStatus: permissionStatus,
          notificationAccessStatus: 'denied',
          smsTrackingEnabled: false,
          notificationTrackingEnabled: false,
          serviceState: 'healthy',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 0,
          reviewCount: 0,
          activeKeywordCount: 0,
          activeSenderCount: 0,
          lastUpdatedAt: 1
        },
        'granted'
      );

      fireEvent.press(await screen.findByTestId('tracking-sms-switch'));

      await waitFor(() => expect(saveSource).toHaveBeenCalledWith('sms', true));
      expect(setMode).toHaveBeenCalledWith('automatic_clear');
      expect(push).not.toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/tracking/permission' })
      );
    }
  );

  it('opens app settings when Android reports never ask again for SMS', async () => {
    const saveSource = jest.spyOn(trackingSourcePreferences, 'set');
    const setMode = jest.spyOn(automaticTrackingService, 'setMode');
    renderStatus(
      {
        platform: 'android',
        mode: 'paused',
        permissionStatus: 'denied',
        smsPermissionStatus: 'denied',
        notificationAccessStatus: 'denied',
        smsTrackingEnabled: false,
        notificationTrackingEnabled: false,
        serviceState: 'healthy',
        lastDetectedAt: null,
        lastSuccessfulTransactionId: null,
        detectedThisMonth: 0,
        reviewCount: 0,
        activeKeywordCount: 0,
        activeSenderCount: 0,
        lastUpdatedAt: 1
      },
      'permanently_denied'
    );

    fireEvent.press(await screen.findByTestId('tracking-sms-switch'));

    await waitFor(() => expect(openSmsSettings).toHaveBeenCalledTimes(1));
    expect(saveSource).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
  });

  it('enables notification tracking directly when Android access is already granted', async () => {
    const saveSource = jest
      .spyOn(trackingSourcePreferences, 'set')
      .mockResolvedValue({ smsEnabled: false, notificationEnabled: true });
    const setMode = jest
      .spyOn(automaticTrackingService, 'setMode')
      .mockResolvedValue({} as never);
    const openSettings = jest.spyOn(bankNotificationService, 'openSettings');
    const setCaptureEnabled = jest
      .spyOn(bankNotificationService, 'setCaptureEnabled')
      .mockResolvedValue();
    renderStatus({
      platform: 'android',
      mode: 'paused',
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: false,
      notificationTrackingEnabled: false,
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    });

    fireEvent.press(await screen.findByTestId('tracking-notification-switch'));

    await waitFor(() =>
      expect(saveSource).toHaveBeenCalledWith('notification', true)
    );
    expect(setMode).toHaveBeenCalledWith('automatic_clear');
    expect(setCaptureEnabled).toHaveBeenCalledWith(true);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('turns off notification capture without pausing enabled SMS tracking', async () => {
    const saveSource = jest
      .spyOn(trackingSourcePreferences, 'set')
      .mockResolvedValue({ smsEnabled: true, notificationEnabled: false });
    const setCaptureEnabled = jest
      .spyOn(bankNotificationService, 'setCaptureEnabled')
      .mockResolvedValue();
    const setMode = jest.spyOn(automaticTrackingService, 'setMode');
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      smsPermissionStatus: 'granted',
      notificationAccessStatus: 'granted',
      smsTrackingEnabled: true,
      notificationTrackingEnabled: true,
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    });

    fireEvent.press(await screen.findByTestId('tracking-notification-switch'));

    await waitFor(() =>
      expect(saveSource).toHaveBeenCalledWith('notification', false)
    );
    expect(setCaptureEnabled).toHaveBeenCalledWith(false);
    expect(setMode).not.toHaveBeenCalledWith('paused');
  });

  it('finishes notification activation after Android settings grants access', async () => {
    const appStateListeners = new Set<(state: AppStateStatus) => void>();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListeners.add(listener);
        return { remove: () => appStateListeners.delete(listener) } as never;
      });
    const saveSource = jest
      .spyOn(trackingSourcePreferences, 'set')
      .mockResolvedValue({ smsEnabled: false, notificationEnabled: true });
    const setCaptureEnabled = jest
      .spyOn(bankNotificationService, 'setCaptureEnabled')
      .mockResolvedValue();
    const setMode = jest
      .spyOn(automaticTrackingService, 'setMode')
      .mockResolvedValue({} as never);
    const openSettings = jest
      .spyOn(bankNotificationService, 'openSettings')
      .mockResolvedValue();
    renderStatus({
      platform: 'android',
      mode: 'paused',
      permissionStatus: 'denied',
      smsPermissionStatus: 'denied',
      notificationAccessStatus: 'denied',
      smsTrackingEnabled: false,
      notificationTrackingEnabled: false,
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    });

    fireEvent.press(await screen.findByTestId('tracking-notification-switch'));
    await waitFor(() => expect(openSettings).toHaveBeenCalledTimes(1));
    jest
      .mocked(bankNotificationService.getAccessState)
      .mockResolvedValue('granted');
    act(() => appStateListeners.forEach((listener) => listener('active')));

    await waitFor(() => {
      expect(setCaptureEnabled).toHaveBeenCalledWith(true);
      expect(saveSource).toHaveBeenCalledWith('notification', true);
      expect(setMode).toHaveBeenCalledWith('automatic_clear');
    });
  });

  it('keeps keyword management roomy without changing its layout', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    expect(await screen.findByTestId('tracking-keywords-card')).toHaveStyle({
      marginHorizontal: -4,
      padding: 18
    });
    expect(
      screen.getByTestId('tracking-keyword-chip-expense-en-default')
    ).toHaveStyle({ minHeight: 40 });
  });

  it('anchors Arabic tracking rows to a physical LTR canvas and mirrors them explicitly', async () => {
    changeLocale('ar');
    usePreferenceStore.setState({ direction: 'rtl', locale: 'ar' });
    const rendered = renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    await screen.findByTestId('tracking-status-screen');
    expect(screen.getByTestId('tracking-sms-switch-row')).toHaveStyle({
      flexDirection: 'row-reverse'
    });
    expect(screen.getByTestId('tracking-sms-switch-text')).toHaveStyle({
      alignItems: 'flex-end'
    });
    expect(screen.getAllByTestId('tracking-explanation-row')[0]).toHaveStyle({
      flexDirection: 'row-reverse'
    });

    rendered.unmount();
    usePreferenceStore.setState({ direction: 'ltr', locale: 'en' });
    changeLocale('en');
  });

  it('displays actionable permission warning when permission is not granted', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'denied',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    expect(
      await screen.findByTestId('tracking-permission-warning-banner')
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.permission.warning'))
    ).toBeOnTheScreen();

    const setMode = jest.spyOn(automaticTrackingService, 'setMode');
    const push = jest.spyOn(router, 'push').mockImplementation(jest.fn());
    fireEvent.press(screen.getByTestId('tracking-permission-warning-banner'));

    expect(push).toHaveBeenCalledWith({
      pathname: '/tracking/permission',
      params: { mode: 'automatic_clear' }
    });
    expect(setMode).not.toHaveBeenCalled();
  });

  it.each(['ar', 'en'] as const)(
    'labels unavailable tracking honestly and disables its controls in %s',
    async (locale) => {
      changeLocale(locale);
      renderStatus({
        platform: 'conservative',
        mode: 'automatic_clear',
        permissionStatus: 'unavailable',
        serviceState: 'unavailable',
        lastDetectedAt: null,
        lastSuccessfulTransactionId: null,
        detectedThisMonth: 0,
        reviewCount: 0,
        activeKeywordCount: 0,
        activeSenderCount: 0,
        lastUpdatedAt: Date.now()
      });

      expect(
        await screen.findByText(translate('tracking.status.unavailable'))
      ).toBeOnTheScreen();
      expect(screen.getByTestId('tracking-mode-switch')).toBeDisabled();
      expect(screen.getByTestId('tracking-add-keyword-toggle')).toBeDisabled();
      const warning = screen.getByTestId('tracking-permission-warning-banner');
      expect(warning).toBeDisabled();
      expect(warning).toHaveProp(
        'accessibilityLabel',
        translate('tracking.permission.unavailableMessage')
      );
    }
  );

  it.each([
    ['scanning', 'tracking.state.loading'],
    ['processing', 'tracking.state.loading'],
    ['queued', 'tracking.service.offline'],
    ['imported', 'tracking.status.enabled'],
    ['account_required', 'coreFinance.accounts.noEligible'],
    ['error', 'tracking.state.error']
  ] as const)('renders coordinator state %s', (status, titleKey) => {
    renderWithQueryData(
      <TrackingSyncPanel
        state={{
          status,
          sessionId: null,
          reviewId: null,
          duplicateId: null,
          errorCode: status === 'error' ? 'offline' : null
        }}
        onRetry={jest.fn()}
      />,
      []
    );

    expect(screen.getByText(translate(titleKey))).toBeOnTheScreen();
  });

  it.each([
    ['review', 'reviewId', 'review-1', '/tracking/review/review-1'],
    [
      'duplicate',
      'duplicateId',
      'duplicate-1',
      '/tracking/duplicates/duplicate-1'
    ]
  ] as const)('opens the real %s result ID', (status, idKey, id, route) => {
    const push = jest.spyOn(router, 'push').mockImplementation(jest.fn());
    renderWithQueryData(
      <TrackingSyncPanel
        state={{
          status,
          sessionId: 'session-1',
          reviewId: null,
          duplicateId: null,
          errorCode: null,
          [idKey]: id
        }}
        onRetry={jest.fn()}
      />,
      []
    );

    fireEvent.press(
      screen.getByLabelText(
        translate(
          status === 'review'
            ? 'tracking.action.review'
            : 'tracking.action.open'
        )
      )
    );
    expect(push).toHaveBeenCalledWith(route);
  });

  it.each(['ar', 'en'] as const)(
    'labels demo tracking as non-production in %s',
    async (locale) => {
      const previous = process.env.EXPO_PUBLIC_DEMO_MODE;
      process.env.EXPO_PUBLIC_DEMO_MODE = '1';
      changeLocale(locale);
      try {
        renderStatus({
          platform: 'android',
          mode: 'automatic_clear',
          permissionStatus: 'granted',
          serviceState: 'healthy',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 1,
          reviewCount: 0,
          activeKeywordCount: 1,
          activeSenderCount: 1,
          lastUpdatedAt: Date.now()
        });

        expect(
          await screen.findByLabelText(translate('tracking.status.demo'))
        ).toHaveTextContent(translate('tracking.status.demo'));
      } finally {
        if (previous === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
        else process.env.EXPO_PUBLIC_DEMO_MODE = previous;
      }
    }
  );

  it('allows adding and removing custom keywords', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    // Open add keyword draft input
    await waitFor(() => {
      expect(
        screen.getByTestId('tracking-add-keyword-toggle')
      ).toBeOnTheScreen();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('tracking-add-keyword-toggle'));
    });

    // Type new keyword
    const input = screen.getByTestId('tracking-new-keyword-input');
    await act(async () => {
      fireEvent.changeText(input, 'StarbucksCoffee');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('tracking-submit-add-keyword'));
    });

    // Should appear in list
    await waitFor(() => {
      expect(screen.getByText('StarbucksCoffee')).toBeOnTheScreen();
    });
    fireEvent.press(
      screen.getByTestId('tracking-keyword-remove-expense-ar-starbuckscoffee')
    );
    await waitFor(() =>
      expect(screen.queryByText('StarbucksCoffee')).toBeNull()
    );
    fireEvent.press(
      screen.getByTestId('tracking-keyword-remove-expense-en-default')
    );
    await waitFor(() => expect(screen.queryByText('Grocery')).toBeNull());
  });

  it('allows editing a keyword', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    await screen.findByText('Grocery');
    fireEvent.press(
      screen.getByTestId('tracking-keyword-edit-expense-en-default')
    );
    fireEvent.changeText(
      screen.getByTestId('tracking-keyword-edit-input-expense-en-default'),
      'Groceries'
    );
    fireEvent.press(
      screen.getByTestId('tracking-keyword-save-expense-en-default')
    );

    expect(await screen.findByText('Groceries')).toBeOnTheScreen();
  });

  it('allows restoring default keywords', async () => {
    renderStatus({
      platform: 'android',
      mode: 'automatic_clear',
      permissionStatus: 'granted',
      serviceState: 'healthy',
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: Date.now()
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('tracking-restore-keywords-button')
      ).toBeOnTheScreen();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('tracking-restore-keywords-button'));
    });

    expect(screen.getByText('Salary')).toBeOnTheScreen();
    expect(screen.getByText('راتب')).toBeOnTheScreen();
  });

  it.each(['ar', 'en'] as const)(
    'stacks the keyword header at 200%% text in %s',
    async (locale) => {
      jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
      changeLocale(locale);
      renderStatus({
        platform: 'android',
        mode: 'automatic_clear',
        permissionStatus: 'granted',
        serviceState: 'healthy',
        lastDetectedAt: null,
        lastSuccessfulTransactionId: null,
        detectedThisMonth: 12,
        reviewCount: 3,
        activeKeywordCount: 22,
        activeSenderCount: 5,
        lastUpdatedAt: Date.now()
      });

      expect(await screen.findByTestId('tracking-keyword-header')).toHaveStyle({
        alignItems: 'stretch',
        flexDirection: 'column'
      });
    }
  );
});
