import { createHash } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../config/platform-config.service';
import { PoolService } from '../database/pool.service';
import { OPERATIONS_METRICS, recordPlatformMetric } from '../observability/platform-metrics';
import type { MetaResponseDto } from './meta.dto';

export type MetaContext = Readonly<{
  platform?: 'ios' | 'android' | 'admin';
  appVersion?: string;
  locale?: 'ar' | 'en';
}>;

type SafeDynamicMeta = Pick<
  MetaResponseDto,
  'maintenance' | 'featureFlags' | 'configurationVersion'
>;

@Injectable()
export class MetaService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; etag: string; value: MetaResponseDto }
  >();

  constructor(
    private readonly config: PlatformConfigService,
    @Optional() @Inject(PoolService) private readonly pool?: PoolService,
  ) {}

  async get(context: MetaContext = {}): Promise<MetaResponseDto> {
    const now = Date.now();
    const cacheKey = `${context.platform ?? ''}|${context.appVersion ?? ''}|${context.locale ?? ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt >= now) {
      recordPlatformMetric(OPERATIONS_METRICS.cache, 1, { cache: 'safe_meta', outcome: 'hit' });
      return cached.value;
    }
    recordPlatformMetric(OPERATIONS_METRICS.cache, 1, { cache: 'safe_meta', outcome: 'miss' });
    const dynamic = await this.load(context);
    const value: MetaResponseDto = {
      apiVersion: 'v1',
      serverTime: new Date(now).toISOString(),
      minMobileVersion: this.config.get('MASARIFI_META_MIN_MOBILE_VERSION') ?? null,
      minAdminVersion: this.config.get('MASARIFI_META_MIN_ADMIN_VERSION') ?? null,
      capabilities: {
        coreFinanceAvailable: true,
        billingAvailable: false,
        paidEntitlement: false,
        checkoutAvailable: false,
        subscriptionManagementAvailable: false,
        promotionsAvailable: false,
        aiAvailable: this.config.get('MASARIFI_AI_PROVIDER_ENABLED'),
        aiAllowancePerRolling24Hours: 5,
      },
      ...dynamic,
    };
    const etag = `"${createHash('sha256').update(JSON.stringify(value)).digest('hex')}"`;
    if (this.cache.size >= 32) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, { value, etag, expiresAt: now + 30_000 });
    return value;
  }

  async etag(context: MetaContext = {}): Promise<string> {
    await this.get(context);
    const cacheKey = `${context.platform ?? ''}|${context.appVersion ?? ''}|${context.locale ?? ''}`;
    return this.cache.get(cacheKey)?.etag ?? '"unavailable"';
  }

  invalidate(): void {
    this.cache.clear();
    recordPlatformMetric(OPERATIONS_METRICS.cache, 1, {
      cache: 'safe_meta',
      outcome: 'invalidated',
    });
  }

  private async load(context: MetaContext): Promise<SafeDynamicMeta> {
    const fallback: SafeDynamicMeta = {
      maintenance: { active: false, scopes: [], message: null },
      featureFlags: {},
      configurationVersion: 1,
    };
    if (!this.pool) return fallback;
    try {
      return await this.pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query('set local role masarifi_api');
          const result = await client.query<{ value: SafeDynamicMeta }>(
            'select private.read_safe_platform_meta($1::jsonb) value',
            [JSON.stringify(context)],
          );
          await client.query('commit');
          return result.rows[0]?.value ?? fallback;
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      });
    } catch {
      return fallback;
    }
  }
}
