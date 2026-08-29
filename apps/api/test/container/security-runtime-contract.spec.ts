import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { inspectImage, runNode } from './docker-test.utils';

describe('SPEC-BE-003 production image security contract', () => {
  it('ships compiled security workers without source or baked security secrets', () => {
    const config = (inspectImage().Config ?? {}) as { User?: string; Env?: string[] };
    expect(config.User).toBe('65532:65532');
    expect(config.Env ?? []).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /MASARIFI_(?:SECURITY_IP_HASH_KEYS|ADMIN_INVITATION_REDIRECT_URL)=.+/,
        ),
      ]),
    );
    expect(
      JSON.parse(
        runNode(`
      const fs=require('node:fs');
      console.log(JSON.stringify({
        worker:fs.existsSync('/app/dist/src/security/security.worker.js'),
        guard:fs.existsSync('/app/dist/src/security/admin-auth.guard.js'),
        source:fs.existsSync('/app/src/security')
      }));
    `),
      ),
    ).toEqual({ worker: true, guard: true, source: false });
  });

  it('keeps every Phase 03 secret/config placeholder value empty', () => {
    const template = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');
    for (const name of ['MASARIFI_SECURITY_IP_HASH_KEYS', 'SUPABASE_SERVICE_ROLE_KEY']) {
      expect(template).toMatch(new RegExp(`^${name}=$`, 'm'));
    }
  });
});
