import { z } from 'zod';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  PlatformOperations,
  PlatformOperationsService
} from '@/services/contracts/platform-operations-service';
import { currentLocale } from '@/localization/i18n';

const metadataSchema = z
  .object({
    apiVersion: z.literal('v1'),
    serverTime: z.string().datetime({ offset: true }),
    minMobileVersion: z.string().max(32).nullable(),
    minAdminVersion: z.string().max(32).nullable(),
    capabilities: z
      .object({
        coreFinanceAvailable: z.literal(true),
        billingAvailable: z.literal(false),
        paidEntitlement: z.literal(false),
        checkoutAvailable: z.literal(false),
        subscriptionManagementAvailable: z.literal(false),
        promotionsAvailable: z.literal(false),
        aiAvailable: z.boolean(),
        aiAllowancePerRolling24Hours: z.literal(5)
      })
      .strict(),
    maintenance: z
      .object({
        active: z.boolean(),
        scopes: z.array(z.string().max(40)).max(10),
        message: z
          .object({ ar: z.string().max(240), en: z.string().max(240) })
          .strict()
          .nullable()
      })
      .strict(),
    featureFlags: z
      .record(z.string(), z.boolean())
      .refine((flags) => Object.keys(flags).length <= 50),
    configurationVersion: z.number().int().positive()
  })
  .strict();

const unavailable: PlatformOperations = {
  capabilities: {
    coreFinanceAvailable: true,
    billingAvailable: false,
    paidEntitlement: false,
    checkoutAvailable: false,
    subscriptionManagementAvailable: false,
    promotionsAvailable: false,
    aiAvailable: false,
    aiAllowancePerRolling24Hours: 5
  },
  maintenance: { active: false, scopes: [], message: null },
  featureFlags: {},
  configurationVersion: 1
};

export function createLivePlatformOperationsService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch,
  platform = Platform.OS === 'ios' ? 'ios' : 'android',
  appVersion = Constants.expoConfig?.version ?? '1.0.0',
  locale = currentLocale()
}: {
  baseUrl?: string;
  token: () => Promise<string>;
  request?: typeof fetch;
  platform?: 'ios' | 'android';
  appVersion?: string;
  locale?: 'ar' | 'en';
}): PlatformOperationsService {
  let cached: PlatformOperations | undefined;
  let etag: string | undefined;
  return {
    async get() {
      try {
        if (!baseUrl) return unavailable;
        const response = await request(
          `${baseUrl.replace(/\/$/u, '')}/api/v1/meta`,
          {
            headers: {
              Authorization: `Bearer ${await token()}`,
              'X-Masarifi-Platform': platform,
              'X-Masarifi-App-Version': appVersion,
              'X-Masarifi-Locale': locale,
              ...(etag ? { 'If-None-Match': etag } : {})
            }
          }
        );
        if (response.status === 304) return cached ?? unavailable;
        if (!response.ok) return unavailable;
        const { capabilities, maintenance, featureFlags, configurationVersion } =
          metadataSchema.parse(await response.json());
        cached = { capabilities, maintenance, featureFlags, configurationVersion };
        etag = response.headers?.get?.('etag') ?? undefined;
        return cached;
      } catch {
        return unavailable;
      }
    }
  };
}
