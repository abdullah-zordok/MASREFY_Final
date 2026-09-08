import { z } from 'zod';

import type { ExchangeRateResult } from '@/services/contracts/core-finance-service';
import {
  configureMobileApiTokenProvider,
  HttpError,
  requestJson
} from './http-client';

const currencyCode = z.string().regex(/^[A-Z]{3}$/u);
const currencySchema = z
  .object({
    code: currencyCode,
    name: z.string().max(100),
    minorUnit: z.number().int().min(0).max(4),
    enabled: z.boolean().optional(),
    version: z.number().int().positive().safe()
  })
  .strict();
const countrySchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2}$/u),
    name: z.string().max(100),
    defaultCurrency: currencyCode,
    enabled: z.boolean().optional(),
    version: z.number().int().positive().safe()
  })
  .strict();
const exchangeRateSchema = z
  .object({
    id: z.string().uuid().nullable().optional(),
    base: currencyCode,
    quote: currencyCode,
    rate: z.number().positive().finite(),
    effectiveAt: z.string().datetime({ offset: true }),
    provider: z.string().max(64)
  })
  .strict();

export function createLiveReferenceService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch
}: {
  baseUrl?: string;
  token?: () => Promise<string | null>;
  request?: typeof fetch;
} = {}) {
  if (token) configureMobileApiTokenProvider(token);
  return {
    listCurrencies: () =>
      requestJson(
        '/api/v1/reference/currencies',
        z.array(currencySchema).max(100),
        {
          baseUrl,
          request
        }
      ),
    listCountries: () =>
      requestJson(
        '/api/v1/reference/countries',
        z.array(countrySchema).max(100),
        {
          baseUrl,
          request
        }
      ),
    async getRate(
      baseCurrencyCode: string,
      quoteCurrencyCode: string
    ): Promise<ExchangeRateResult> {
      currencyCode.parse(baseCurrencyCode);
      currencyCode.parse(quoteCurrencyCode);
      if (baseCurrencyCode === quoteCurrencyCode)
        return { rate: 1, asOf: Date.now(), status: 'available' };
      const query = new URLSearchParams({
        base: baseCurrencyCode,
        quote: quoteCurrencyCode
      });
      try {
        const value = await requestJson(
          `/api/v1/exchange-rates?${query.toString()}`,
          exchangeRateSchema,
          { baseUrl, request }
        );
        if (
          value.base !== baseCurrencyCode ||
          value.quote !== quoteCurrencyCode
        )
          throw new HttpError('contract_mismatch', 502);
        return {
          rate: value.rate,
          asOf: Date.parse(value.effectiveAt),
          status: 'available'
        };
      } catch (error) {
        if (error instanceof HttpError && error.code === 'not_found')
          return { rate: null, asOf: null, status: 'unavailable' };
        throw error;
      }
    }
  };
}
