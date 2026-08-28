import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateEnvironment } from '../../src/platform/config/environment.schema';

describe('SPEC-BE-002 runtime configuration contract', () => {
  it('keeps provider and push secret values out of the environment template', () => {
    const template = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');
    for (const name of [
      'CLERK_SECRET_KEY',
      'CLERK_WEBHOOK_SIGNING_SECRET',
      'MASARIFI_PUSH_TOKEN_HASH_KEY',
      'MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS',
    ]) {
      expect(template).toMatch(new RegExp(`^${name}=$`, 'm'));
    }
  });

  it('reports only the missing variable name for an invalid API secret', () => {
    const malformedSecret = ['sk', 'test', 'DO!NOT!ECHO'].join('_');
    try {
      validateEnvironment({ ...process.env, CLERK_SECRET_KEY: malformedSecret });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('CLERK_SECRET_KEY');
      expect(String(error)).not.toContain(malformedSecret);
    }
  });

  it('does not require the webhook signing secret in the worker process', () => {
    const worker = { ...process.env, MASARIFI_PROCESS_KIND: 'worker' };
    Reflect.deleteProperty(worker, 'CLERK_WEBHOOK_SIGNING_SECRET');
    expect(validateEnvironment(worker)).toMatchObject({ MASARIFI_PROCESS_KIND: 'worker' });
  });
});
