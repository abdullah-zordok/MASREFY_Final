import { createLiveReferenceService } from './reference-service';

const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

it('strictly maps currencies, countries, and exchange rates from BE004', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      response([{ code: 'SAR', name: 'Saudi Riyal', minorUnit: 2, version: 3 }])
    )
    .mockResolvedValueOnce(
      response([
        {
          code: 'SA',
          name: 'Saudi Arabia',
          defaultCurrency: 'SAR',
          version: 4
        }
      ])
    )
    .mockResolvedValueOnce(
      response({
        base: 'USD',
        quote: 'SAR',
        rate: 3.75,
        effectiveAt: '2026-09-08T00:00:00.000Z',
        provider: 'manual-admin'
      })
    );
  const service = createLiveReferenceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });

  await expect(service.listCurrencies()).resolves.toEqual([
    { code: 'SAR', name: 'Saudi Riyal', minorUnit: 2, version: 3 }
  ]);
  await expect(service.listCountries()).resolves.toEqual([
    {
      code: 'SA',
      name: 'Saudi Arabia',
      defaultCurrency: 'SAR',
      version: 4
    }
  ]);
  await expect(service.getRate('USD', 'SAR')).resolves.toEqual({
    rate: 3.75,
    asOf: Date.parse('2026-09-08T00:00:00.000Z'),
    status: 'available'
  });
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    'https://api.test/api/v1/reference/currencies',
    'https://api.test/api/v1/reference/countries',
    'https://api.test/api/v1/exchange-rates?base=USD&quote=SAR'
  ]);
});

it.each([
  [{ code: 'SAR', name: 'Saudi Riyal', minorUnit: 5, version: 1 }],
  [{ code: 'SAU', name: 'Saudi Arabia', defaultCurrency: 'SAR', version: 1 }],
  {
    base: 'USD',
    quote: 'SAR',
    rate: 3.75,
    effectiveAt: '2026-09-08T00:00:00.000Z',
    provider: 'manual-admin',
    unexpected: true
  }
])('rejects unknown or invalid reference responses %#', async (value) => {
  const service = createLiveReferenceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest.fn().mockResolvedValue(response(value))
  });

  const action = Array.isArray(value)
    ? 'minorUnit' in value[0]
      ? service.listCurrencies()
      : service.listCountries()
    : service.getRate('USD', 'SAR');
  await expect(action).rejects.toMatchObject({ code: 'contract_mismatch' });
});

it('returns unavailable only for a missing exchange rate', async () => {
  const service = createLiveReferenceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest.fn().mockResolvedValue(
      response(
        {
          code: 'FX_UNAVAILABLE',
          message: 'missing',
          requestId: 'request-1'
        },
        404
      )
    )
  });

  await expect(service.getRate('USD', 'SAR')).resolves.toEqual({
    rate: null,
    asOf: null,
    status: 'unavailable'
  });
});

it('rejects an exchange rate returned for a different pair', async () => {
  const service = createLiveReferenceService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request: jest.fn().mockResolvedValue(
      response({
        base: 'EUR',
        quote: 'SAR',
        rate: 4,
        effectiveAt: '2026-09-08T00:00:00.000Z',
        provider: 'manual-admin'
      })
    )
  });

  await expect(service.getRate('USD', 'SAR')).rejects.toMatchObject({
    code: 'contract_mismatch'
  });
});
