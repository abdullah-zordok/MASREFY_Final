import React from 'react';
import { screen } from '@testing-library/react-native';

import IosOptionsRoute from '@app/(onboarding)/ios-capture-options';
import IosAutomationRoute from '@app/(onboarding)/ios-automation';
import { completeAuthenticatedSession } from '@/features/auth/session-controller';
import { resolveEntryRoute } from '@/features/shell/resolve-entry-route';
import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { useAppShellStore } from '@/state/app-shell';
import { authenticatedSession } from '@/test-utils/app-shell-fixtures';
import { renderWithProviders } from '@/test-utils/render';
import {
  applyOnboardingStep,
  createOnboardingProgress,
  routeForOnboardingProgress
} from './onboarding-progress';
import { ConservativeCaptureDemo } from './ConservativeCaptureDemo';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: () => null
}));

beforeEach(() => {
  useAppShellStore.getState().reset();
});

describe('onboarding journey', () => {
  it('starts Android, iOS, and unknown users on platform-honest routes', async () => {
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'android', smsAvailable: true },
        now: () => 1
      })
    ).resolves.toBe('/(onboarding)/tracking-intro');

    useAppShellStore.getState().reset();
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'ios', smsAvailable: false },
        now: () => 1
      })
    ).resolves.toBe('/(onboarding)/ios-capture-options');

    useAppShellStore.getState().reset();
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'web', smsAvailable: false },
        now: () => 1
      })
    ).resolves.toBe('/(onboarding)/tracking-demo');
  });

  it('keeps every permission result skippable with manual and voice fallback', async () => {
    const statuses = ['denied', 'permanently_denied', 'revoked', 'unavailable'] as const;

    for (const status of statuses) {
      const state = await createMockTrackingPermissionService(status).getState();
      expect(state.blocking).toBe(false);
      expect(state.recoveryAction).toBeTruthy();
    }

    const service = createMockTrackingPermissionService('not_requested');
    await expect(service.requestAfterEducation(false)).resolves.toMatchObject({
      status: 'not_requested'
    });
    await expect(service.requestAfterEducation(true)).resolves.toMatchObject({
      status: 'granted'
    });

    renderWithProviders(<ConservativeCaptureDemo />);
    expect(screen.getByText('إضافة يدوية')).toBeOnTheScreen();
    expect(screen.getByText('إضافة صوتية')).toBeOnTheScreen();
  });

  it('keeps iOS free of permission requests and reaches Home after completion', () => {
    renderWithProviders(<IosOptionsRoute />);
    expect(screen.queryByLabelText('تفعيل التتبع')).toBeNull();

    renderWithProviders(<IosAutomationRoute />);
    expect(screen.queryByText(/إذن الرسائل|SMS/)).toBeNull();

    const skipped = applyOnboardingStep(
      createOnboardingProgress('ios', 1),
      'platform_explanation',
      'skipped',
      2
    );
    expect(routeForOnboardingProgress(skipped)).toBe('/(onboarding)/ios-capture-options');

    expect(
      resolveEntryRoute({
        hydrated: true,
        firstLaunchOnboardingCompleted: true,
        profileSetupStatus: 'complete',
        session: authenticatedSession,
        privacyLock: null,
        onboarding: { ...skipped, status: 'completed', currentStep: null },
        pendingDestination: null
      })
    ).toBe('/(tabs)/home');
  });

  it('resumes the earliest incomplete Android step after interruption', () => {
    const progress = applyOnboardingStep(
      applyOnboardingStep(
        createOnboardingProgress('android', 1),
        'tracking_intro',
        'completed',
        2
      ),
      'permission_education',
      'completed',
      3
    );

    expect(routeForOnboardingProgress(progress)).toBe(
      '/(onboarding)/android-sms-permission'
    );
  });
});
