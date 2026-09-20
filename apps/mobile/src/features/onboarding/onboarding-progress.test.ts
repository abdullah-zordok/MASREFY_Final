import {
  applyOnboardingStep,
  applicableOnboardingSteps,
  createOnboardingProgress,
  resumeOnboardingStep,
  routeForOnboardingProgress
} from './onboarding-progress';
import { createMockOnboardingService } from '@/services/mocks/onboarding-service';

describe('onboarding progress', () => {
  it('orders Android, iOS, and conservative steps', () => {
    expect(applicableOnboardingSteps('android')).toEqual([
      'tracking_intro',
      'keywords',
      'preference',
      'demo',
      'complete'
    ]);
    expect(applicableOnboardingSteps('ios')).not.toContain('permission_request');
    expect(applicableOnboardingSteps('conservative')).toEqual([
      'platform_explanation',
      'manual_voice_demo',
      'complete'
    ]);
  });

  it('preserves completed/skipped steps and resumes earliest incomplete step', () => {
    const progress = applyOnboardingStep(
      createOnboardingProgress('android', 1),
      'tracking_intro',
      'completed',
      2
    );

    expect(progress.completedSteps).toContain('tracking_intro');
    expect(resumeOnboardingStep(progress)).toBe('keywords');
  });

  it('persists completed, skipped, reset, and resume through the mock service', async () => {
    const service = createMockOnboardingService();
    const progress = applyOnboardingStep(
      createOnboardingProgress('ios', 1),
      'platform_explanation',
      'completed',
      2
    );

    await service.saveProgress(progress);
    await expect(service.loadProgress()).resolves.toMatchObject({
      currentStep: 'capture_options'
    });
    await service.resetProgress();
    await expect(service.loadProgress()).resolves.toBeNull();
  });

  it('routes a completed onboarding to Home even when prior steps were not individually marked', () => {
    // Regression: complete.tsx sets status 'completed' with completedSteps
    // containing only 'complete'. The onboarding layout re-runs
    // routeForOnboardingProgress on every store change, so a completed user
    // must land on Home — not be bounced back to tracking-intro because
    // resumeOnboardingStep still sees unmarked early steps.
    const completedProgress = {
      ...createOnboardingProgress('android', 1),
      status: 'completed' as const,
      completedSteps: ['complete' as const],
      currentStep: null
    };

    expect(routeForOnboardingProgress(completedProgress)).toBe('/(tabs)/home');
  });

  it('routes a skipped onboarding to Home', () => {
    const skippedProgress = {
      ...createOnboardingProgress('android', 1),
      status: 'skipped' as const,
      skippedSteps: ['tracking_intro' as const]
    };

    expect(routeForOnboardingProgress(skippedProgress)).toBe('/(tabs)/home');
  });

  it('keeps iOS manual flow usable when optional automation is skipped', () => {
    const progress = applyOnboardingStep(
      {
        ...createOnboardingProgress('ios', 1),
        completedSteps: ['platform_explanation', 'capture_options'],
        currentStep: 'optional_automation'
      },
      'optional_automation',
      'skipped',
      2
    );

    expect(routeForOnboardingProgress(progress)).toBe('/(onboarding)/tracking-demo');
  });
});
