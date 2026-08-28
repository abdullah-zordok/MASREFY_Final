import { ValidationPipe } from '@nestjs/common';

import {
  normalizeOnboarding,
  ONBOARDING_STEPS,
  OnboardingReplaceDto,
} from '../../../src/identity/identity.dto';

describe('onboarding DTO', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });

  async function body(value: unknown): Promise<OnboardingReplaceDto> {
    return (await pipe.transform(value, {
      type: 'body',
      metatype: OnboardingReplaceDto,
    })) as OnboardingReplaceDto;
  }

  it('keeps the exact 12-step vocabulary and canonical order', async () => {
    expect(ONBOARDING_STEPS).toHaveLength(12);
    const dto = await body({
      step: 'permission_education',
      completedSteps: ['tracking_intro', 'welcome'],
      complete: false,
      expectedVersion: 1,
    });
    expect(normalizeOnboarding(dto).completedSteps).toEqual(['welcome', 'tracking_intro']);
  });

  it('accepts a consistent completed projection', async () => {
    const dto = await body({
      step: 'complete',
      completedSteps: [...ONBOARDING_STEPS],
      complete: true,
      expectedVersion: 4,
    });
    expect(normalizeOnboarding(dto)).toMatchObject({ step: 'complete', complete: true });
  });

  it.each([
    { step: 'unknown', completedSteps: [], complete: false, expectedVersion: 1 },
    { step: 'welcome', completedSteps: ['welcome', 'welcome'], complete: false, expectedVersion: 1 },
    { step: 'welcome', completedSteps: ['unknown'], complete: false, expectedVersion: 1 },
    { step: 'welcome', completedSteps: [''], complete: false, expectedVersion: 1 },
    { step: 'welcome', completedSteps: [...ONBOARDING_STEPS, 'welcome'], complete: false, expectedVersion: 1 },
    { step: 'welcome', completedSteps: [], complete: false, expectedVersion: 0 },
    { step: 'welcome', completedSteps: [], complete: false, expectedVersion: 1, permissionState: 'granted' },
    { step: 'welcome', completedSteps: [], complete: false, expectedVersion: 1, pin: '0000' },
    { step: 'welcome', completedSteps: [], complete: false, expectedVersion: 1, biometric: true },
    { step: 'welcome', completedSteps: [], complete: false, expectedVersion: 1, navigationPath: '/home' },
  ])('rejects invalid or platform-only onboarding state', async (value) => {
    await expect(body(value)).rejects.toBeDefined();
  });

  it.each([
    { step: 'complete', completedSteps: ['complete'], complete: false, expectedVersion: 1 },
    { step: 'complete', completedSteps: ['welcome'], complete: true, expectedVersion: 1 },
    { step: 'tracking_intro', completedSteps: ['tracking_intro'], complete: false, expectedVersion: 1 },
    { step: 'tracking_intro', completedSteps: ['welcome', 'complete'], complete: false, expectedVersion: 1 },
  ])('rejects inconsistent completion state', async (value) => {
    const dto = await body(value);
    expect(() => {
      normalizeOnboarding(dto);
    }).toThrow('ONBOARDING_STATE_INVALID');
  });
});
