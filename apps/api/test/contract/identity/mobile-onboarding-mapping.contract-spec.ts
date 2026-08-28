import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ONBOARDING_STEPS } from '../../../src/identity/identity.dto';

describe('Mobile onboarding mapping', () => {
  it('matches the current Mobile vocabulary plus the backend welcome marker', () => {
    const mobile = readFileSync(
      resolve(__dirname, '../../../../mobile/src/domain/app-shell.ts'),
      'utf8',
    );
    for (const step of ONBOARDING_STEPS.filter((value) => value !== 'welcome')) {
      expect(mobile).toContain(`'${step}'`);
    }
  });

  it.each([
    'platformPath',
    'skippedSteps',
    'permissionEducationSeen',
    'trackingPreference',
    'pinConfigured',
    'biometricStatus',
    'requestedDestination',
  ])('keeps %s outside the backend onboarding DTO', (field) => {
    const dto = readFileSync(resolve(__dirname, '../../../src/identity/identity.dto.ts'), 'utf8');
    const onboarding = dto.slice(dto.indexOf('export class OnboardingReplaceDto'), dto.indexOf('@ApiSchema({ name: \'OnboardingProgress\' })'));
    expect(onboarding).not.toContain(field);
  });
});
