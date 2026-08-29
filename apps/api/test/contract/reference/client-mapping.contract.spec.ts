import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { supportedCurrencies } from '../../../../mobile/src/domain/currencies';

describe('Phase 04 client mapping', () => {
  it('pins executable Mobile reference keys without importing fixtures into production', () => {
    expect(supportedCurrencies.map(({ code }) => code)).toEqual([
      'EGP',
      'USD',
      'EUR',
      'GBP',
      'AED',
      'SAR',
      'OMR',
      'KWD',
      'QAR',
      'BHD',
      'JOD',
      'JPY',
    ]);
    const seedSource = readFileSync(
      resolve(__dirname, '../../../../mobile/src/domain/core-finance-seeds.ts'),
      'utf8',
    );
    const keys = [...seedSource.matchAll(/^ {2}\['([^']+)',/gm)].map((match) => match[1]);
    expect(keys).toHaveLength(19);
    expect(keys).toContain('salary');
  });
});
