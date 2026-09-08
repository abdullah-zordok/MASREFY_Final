import {
  createMockExchangeRateService,
  createProductionExchangeRateService
} from './exchange-rate-service';

it('returns profile-currency identity and unavailable pairs explicitly', async () => {
  const service = createMockExchangeRateService([]);
  await expect(service.getRate('SAR', 'SAR')).resolves.toMatchObject({
    rate: 1,
    status: 'available'
  });
  await expect(service.getRate('SAR', 'JPY')).resolves.toEqual({
    rate: null,
    asOf: null,
    status: 'unavailable'
  });
});

it('uses the live reference endpoint in production and keeps identity exact', async () => {
  const request = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        base: 'USD',
        quote: 'SAR',
        rate: 3.75,
        effectiveAt: '2026-09-08T00:00:00.000Z',
        provider: 'manual-admin'
      })
    )
  );
  const service = createProductionExchangeRateService({
    baseUrl: 'https://api.test',
    token: async () => 'owner-token',
    request
  });
  await expect(service.getRate('USD', 'SAR')).resolves.toEqual({
    rate: 3.75,
    asOf: Date.parse('2026-09-08T00:00:00.000Z'),
    status: 'available'
  });
  await expect(service.getRate('SAR', 'SAR')).resolves.toMatchObject({
    rate: 1,
    status: 'available'
  });
  expect(service.metadata).toMatchObject({
    id: 'phase04-exchange-rate-http',
    kind: 'live',
    availability: 'available'
  });
  expect(request).toHaveBeenCalledTimes(1);
});

it('returns unavailable when production API configuration is missing', async () => {
  const service = createProductionExchangeRateService({ baseUrl: '' });

  expect(service.metadata.availability).toBe('unavailable');
  await expect(service.getRate('USD', 'SAR')).resolves.toEqual({
    rate: null,
    asOf: null,
    status: 'unavailable'
  });
});

it('retains mock rate timestamp and status', async () => {
  const service = createMockExchangeRateService([
    {
      baseCurrencyCode: 'SAR',
      quoteCurrencyCode: 'USD',
      rate: 3.75,
      asOf: 123,
      status: 'stale'
    }
  ]);
  await expect(service.getRate('SAR', 'USD')).resolves.toEqual({
    rate: 3.75,
    asOf: 123,
    status: 'stale'
  });
});

it('keeps original components knowable by returning rate and timestamp', async () => {
  const service = createMockExchangeRateService([
    {
      baseCurrencyCode: 'SAR',
      quoteCurrencyCode: 'USD',
      rate: 3.75,
      asOf: 123,
      status: 'available'
    }
  ]);
  const rate = await service.getRate('SAR', 'USD');
  expect(Math.round(100 * rate.rate!)).toBe(375);
  expect(rate.asOf).toBe(123);
});
