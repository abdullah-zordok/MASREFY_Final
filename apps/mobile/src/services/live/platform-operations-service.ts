import { z } from 'zod';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import type {
  PlatformOperations,
  PlatformOperationsService
} from '@/services/contracts/platform-operations-service';
import { currentLocale } from '@/localization/i18n';

const metadataSchema = z
  .object({
    apiVersion: z.literal('v1'),
    serverTime: z.string().datetime({ offset: true }),
    minMobileVersion: z.string().regex(/^\d+(?:\.\d+){0,2}$/u).max(32).nullable(),
    minAdminVersion: z.string().regex(/^\d+(?:\.\d+){0,2}$/u).max(32).nullable(),
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

const CACHE_TTL_MS = 30_000;

export class PlatformOperationsUnavailableError extends Error {
  constructor() {
    super('foundation.operations.unavailable');
    this.name = 'PlatformOperationsUnavailableError';
  }
}

export function createLivePlatformOperationsService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch,
  platform = Platform.OS === 'ios' ? 'ios' : 'android',
  appVersion = Constants.expoConfig?.version ?? '1.0.0',
  locale = currentLocale(),
  now = Date.now
}: {
  baseUrl?: string;
  token: () => Promise<string>;
  request?: typeof fetch;
  platform?: 'ios' | 'android';
  appVersion?: string;
  locale?: 'ar' | 'en';
  now?: () => number;
}): PlatformOperationsService {
  let cached: {
    value: PlatformOperations;
    expiresAt: number;
    tokenDigest: string;
    etag?: string;
  } | undefined;
  return {
    async get() {
      try {
        const requestedAt = now();
        if (!baseUrl) throw new PlatformOperationsUnavailableError();
        const bearerToken = await token();
        const tokenDigest = bytesToHex(
          sha256(new TextEncoder().encode(bearerToken))
        );
        const sameSession = cached?.tokenDigest === tokenDigest;
        if (cached && sameSession && cached.expiresAt > requestedAt)
          return cached.value;
        const response = await request(
          `${baseUrl.replace(/\/$/u, '')}/api/v1/meta`,
          {
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              'X-Masarifi-Platform': platform,
              'X-Masarifi-App-Version': appVersion,
              'X-Masarifi-Locale': locale,
              ...(sameSession && cached?.etag
                ? { 'If-None-Match': cached.etag }
                : {})
            }
          }
        );
        if (response.status === 304) {
          if (!cached || !sameSession)
            throw new PlatformOperationsUnavailableError();
          cached.expiresAt = requestedAt + CACHE_TTL_MS;
          return cached.value;
        }
        if (!response.ok) throw new PlatformOperationsUnavailableError();
        const value = metadataSchema.parse(await response.json());
        cached = {
          value,
          expiresAt: requestedAt + CACHE_TTL_MS,
          tokenDigest,
          etag: response.headers?.get?.('etag') ?? undefined
        };
        return value;
      } catch {
        throw new PlatformOperationsUnavailableError();
      }
    }
  };
}
