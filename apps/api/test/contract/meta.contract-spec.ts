import type { INestApplication, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PlatformConfigService } from '../../src/platform/config/platform-config.service';
import { RequestIdMiddleware } from '../../src/platform/http/request-id.middleware';
import { META_TOKEN_VERIFIER, MetaAuthGuard } from '../../src/platform/meta/meta-auth.guard';
import { MetaController } from '../../src/platform/meta/meta.controller';
import { MetaService } from '../../src/platform/meta/meta.service';

describe('meta contract', () => {
  async function createApp(
    verifier?: (token: string) => Promise<boolean>,
  ): Promise<INestApplication> {
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            MASARIFI_META_MIN_MOBILE_VERSION: undefined,
            MASARIFI_META_MIN_ADMIN_VERSION: undefined,
            MASARIFI_AI_PROVIDER_ENABLED: false,
          })[key],
      ),
    };
    const providers: Provider[] = [
      MetaService,
      MetaAuthGuard,
      { provide: PlatformConfigService, useValue: config },
    ];
    if (verifier) providers.push({ provide: META_TOKEN_VERIFIER, useValue: verifier });
    const module = await Test.createTestingModule({
      controllers: [MetaController],
      providers,
    }).compile();
    const app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    await app.init();
    return app;
  }

  it('returns 401 without a bearer token', async () => {
    const app = await createApp();
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .expect(401);
    await app.close();
  });

  it('fails closed when the production verifier is unavailable', async () => {
    const app = await createApp();
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .set('Authorization', 'Bearer signed.fixture.token')
      .expect(503);
    await app.close();
  });

  it('returns the exact safe schema only after verifier approval', async () => {
    const verifier = jest.fn().mockResolvedValue(true);
    const app = await createApp(verifier);
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .set('Authorization', 'Bearer signed.fixture.token')
      .expect(200);

    expect(verifier).toHaveBeenCalledWith('signed.fixture.token');
    const body = response.body as Awaited<ReturnType<MetaService['get']>>;
    expect(body).toEqual({
      apiVersion: 'v1',
      serverTime: body.serverTime,
      minMobileVersion: null,
      minAdminVersion: null,
      capabilities: {
        coreFinanceAvailable: true,
        billingAvailable: false,
        paidEntitlement: false,
        checkoutAvailable: false,
        subscriptionManagementAvailable: false,
        promotionsAvailable: false,
        aiAvailable: false,
        aiAllowancePerRolling24Hours: 5,
      },
      maintenance: { active: false, scopes: [], message: null },
      featureFlags: {},
      configurationVersion: 1,
    });
    expect(body.serverTime).toMatch(/Z$/);
    expect(response.headers['cache-control']).toBe('private, max-age=30');
    expect(response.headers.etag).toMatch(/^"[0-9a-f]{64}"$/u);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(50_000);
    await app.close();
  });
});
