import type { OnboardingProgress } from '@/domain/app-shell';
import type { PlatformPath } from './platform-path';

export type OnboardingStep = NonNullable<OnboardingProgress['currentStep']>;
export type StepResult = 'completed' | 'skipped';

const stepsByPath: Record<PlatformPath, readonly OnboardingStep[]> = {
  android: [
    'tracking_intro',
    'keywords',
    'preference',
    'demo',
    'complete'
  ],
  ios: [
    'platform_explanation',
    'capture_options',
    'optional_automation',
    'demo',
    'complete'
  ],
  conservative: ['platform_explanation', 'manual_voice_demo', 'complete']
};

export function applicableOnboardingSteps(path: PlatformPath): readonly OnboardingStep[] {
  return stepsByPath[path];
}

export function createOnboardingProgress(
  platformPath: PlatformPath,
  now: number
): OnboardingProgress {
  return {
    platformPath,
    status: 'in_progress',
    completedSteps: [],
    skippedSteps: [],
    currentStep: stepsByPath[platformPath][0],
    permissionEducationSeen: false,
    trackingPreference: null,
    updatedAt: now
  };
}

export function applyOnboardingStep(
  progress: OnboardingProgress,
  step: OnboardingStep,
  result: StepResult,
  now: number
): OnboardingProgress {
  const completedSteps =
    result === 'completed'
      ? unique([...progress.completedSteps, step])
      : progress.completedSteps;
  const skippedSteps =
    result === 'skipped' ? unique([...progress.skippedSteps, step]) : progress.skippedSteps;
  const nextProgress = {
    ...progress,
    completedSteps,
    skippedSteps,
    permissionEducationSeen:
      progress.permissionEducationSeen || step === 'permission_education',
    updatedAt: now
  };
  const currentStep = resumeOnboardingStep(nextProgress);
  return {
    ...nextProgress,
    currentStep,
    status: currentStep ? 'in_progress' : 'completed'
  };
}

export function resumeOnboardingStep(
  progress: OnboardingProgress
): OnboardingStep | null {
  return (
    stepsByPath[progress.platformPath].find(
      (step) =>
        !progress.completedSteps.includes(step) &&
        !progress.skippedSteps.includes(step)
    ) ?? null
  );
}

export function routeForOnboardingProgress(progress: OnboardingProgress): string {
  // A completed or skipped onboarding must not be re-entered by this resolver.
  // The onboarding layout calls this on every store change; if we returned an
  // onboarding route for a completed user, we would bounce them out of Home
  // whenever any unrelated store field updated.
  if (progress.status === 'completed' || progress.status === 'skipped') {
    return '/(tabs)/home';
  }
  const step = resumeOnboardingStep(progress);
  if (!step) return '/(onboarding)/complete';
  if (progress.platformPath === 'conservative' && step === 'platform_explanation') {
    return '/(onboarding)/tracking-demo';
  }
  return routeByStep[step];
}

const routeByStep: Record<OnboardingStep, string> = {
  tracking_intro: '/(onboarding)/tracking-intro',
  permission_education: '/(onboarding)/android-sms-permission',
  permission_request: '/(onboarding)/android-sms-permission',
  keywords: '/(onboarding)/tracking-keywords',
  preference: '/(onboarding)/tracking-preferences',
  demo: '/(onboarding)/tracking-demo',
  platform_explanation: '/(onboarding)/ios-capture-options',
  capture_options: '/(onboarding)/ios-capture-options',
  optional_automation: '/(onboarding)/ios-automation',
  manual_voice_demo: '/(onboarding)/tracking-demo',
  complete: '/(onboarding)/complete'
};

function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}
