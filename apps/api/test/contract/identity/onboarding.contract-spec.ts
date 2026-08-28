import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('onboarding OpenAPI contract', () => {
  it('defines only guarded GET and PUT operations with the approved errors', () => {
    const contract = load(readFileSync(resolve(
      __dirname,
      '../../../specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml',
    ), 'utf8')) as {
      paths: Record<string, Record<string, { operationId: string; security: unknown[]; responses: Record<string, unknown> }>>;
    };
    const path = contract.paths['/api/v1/me/onboarding'];
    expect(Object.keys(path ?? {}).sort()).toEqual(['get', 'put']);
    if (!path?.get || !path.put) throw new Error('ONBOARDING_CONTRACT_MISSING');
    expect(path.get.operationId).toBe('getMyOnboardingProgress');
    expect(path.put.operationId).toBe('replaceMyOnboardingProgress');
    expect(path.get.security).toHaveLength(1);
    expect(Object.keys(path.put.responses).sort()).toEqual([
      '200', '400', '401', '403', '409', '429', '503',
    ]);
  });
});
