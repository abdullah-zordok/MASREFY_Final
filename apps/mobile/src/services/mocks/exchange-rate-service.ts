import type {
  ExchangeRateService,
  ExchangeRateResult
} from '@/services/contracts/core-finance-service';
import { exchangeRateServiceCapability } from '@/services/contracts/core-finance-service';
import type { ExchangeRateEstimate } from '@/domain/core-finance';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { isDemoModeEnabled, isFixtureModeEnabled } from '@/config/demo-mode';
import { createLiveReferenceService } from '@/services/live/reference-service';

export function createMockExchangeRateService(
  rates: readonly ExchangeRateEstimate[] = []
): CapabilityProviderHandle<ExchangeRateService> {
  return {
    metadata: {
      id: 'mock-exchange-rate',
      capability: exchangeRateServiceCapability.capability,
      majorVersion: exchangeRateServiceCapability.majorVersion,
      kind: 'mock',
      availability: 'available'
    },
    async getRate(
      baseCurrencyCode,
      quoteCurrencyCode
    ): Promise<ExchangeRateResult> {
      if (baseCurrencyCode === quoteCurrencyCode)
        return { rate: 1, asOf: Date.now(), status: 'available' };
      const match = rates.find(
        (item) =>
          item.baseCurrencyCode === baseCurrencyCode &&
          item.quoteCurrencyCode === quoteCurrencyCode
      );
      return match
        ? { rate: match.rate, asOf: match.asOf, status: match.status }
        : { rate: null, asOf: null, status: 'unavailable' };
    }
  };
}

export function createProductionExchangeRateService(
  options: Parameters<typeof createLiveReferenceService>[0] = {}
): CapabilityProviderHandle<ExchangeRateService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';
  const reference = createLiveReferenceService({ ...options, baseUrl });
  return {
    metadata: {
      id: baseUrl ? 'phase04-exchange-rate-http' : 'unavailable-exchange-rate',
      capability: exchangeRateServiceCapability.capability,
      majorVersion: exchangeRateServiceCapability.majorVersion,
      kind: 'live',
      availability: baseUrl ? 'available' : 'unavailable'
    },
    getRate: (baseCurrencyCode, quoteCurrencyCode) =>
      !baseUrl && baseCurrencyCode !== quoteCurrencyCode
        ? Promise.resolve({
            rate: null,
            asOf: null,
            status: 'unavailable' as const
          })
        : reference.getRate(baseCurrencyCode, quoteCurrencyCode)
  };
}

export function createExchangeRateService() {
  return isFixtureModeEnabled(process.env.NODE_ENV, isDemoModeEnabled())
    ? createMockExchangeRateService()
    : createProductionExchangeRateService();
}

export const exchangeRateService = createExchangeRateService();
