import { getCurrencyMinorUnitScale, supportedCurrencies } from './currencies';

it('orders every supported Gulf currency first without dropping optional currencies', () => {
  expect(supportedCurrencies.slice(0, 6).map(({ code }) => code)).toEqual([
    'SAR',
    'AED',
    'KWD',
    'QAR',
    'BHD',
    'OMR'
  ]);
  expect(supportedCurrencies.slice(6).map(({ code }) => code)).toEqual([
    'EGP',
    'USD',
    'EUR',
    'GBP',
    'JOD',
    'JPY'
  ]);
});

it.each([
  ['SAR', 2],
  ['AED', 2],
  ['KWD', 3],
  ['BHD', 3],
  ['OMR', 3]
] as const)('keeps %s at its required minor-unit scale', (code, scale) => {
  expect(getCurrencyMinorUnitScale(code)).toBe(scale);
});
