import { type ExecutionContext, type INestApplication, type Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import type { ClerkPrincipalRequest } from '../../../src/identity/clerk-auth.guard';
import { IdentityController } from '../../../src/identity/identity.controller';
import { IdentityRepository } from '../../../src/identity/identity.repository';
import { IdentityService } from '../../../src/identity/identity.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

describe('profile and preferences HTTP contract', () => {
  let app: INestApplication;
  const profile = {
    id: 'contract_owner',
    displayName: 'Owner',
    primaryEmailMasked: 'o***@example.test',
    phoneMasked: '+***12',
    locale: 'ar' as const,
    timezone: 'Asia/Riyadh',
    status: 'active' as const,
    version: 1,
  };
  const preferences = {
    defaultCurrency: 'SAR',
    language: 'ar' as const,
    theme: 'system' as const,
    calendar: 'gregorian' as const,
    weekStart: 6,
    privacySettings: {},
    version: 1,
  };
  const profileRow = {
    id: profile.id,
    displayName: profile.displayName,
    primaryEmail: 'owner@example.test',
    phoneE164: '+966500000012',
    locale: profile.locale,
    timezone: profile.timezone,
    status: profile.status,
    version: profile.version,
  };
  const repository = {
    getProfile: jest.fn().mockResolvedValue(profileRow),
    updateProfile: jest.fn().mockResolvedValue({ ...profileRow, locale: 'en', version: 2 }),
    getPreferences: jest.fn().mockResolvedValue(preferences),
    replacePreferences: jest.fn().mockResolvedValue({ ...preferences, theme: 'dark', version: 2 }),
    getOnboarding: jest.fn().mockResolvedValue({
      step: 'welcome', completedSteps: [], completedAt: null, version: 1,
    }),
    replaceOnboarding: jest.fn().mockResolvedValue({
      step: 'tracking_intro', completedSteps: ['welcome'], completedAt: null, version: 2,
    }),
  };

  beforeAll(async () => {
    const guard = {
      canActivate: jest.fn((context: ExecutionContext) => {
        context.switchToHttp().getRequest<ClerkPrincipalRequest>().clerkPrincipal = {
          userId: 'contract_owner',
          sessionId: 'contract_session',
          factorAgeSeconds: 30,
        };
        return true;
      }),
    };
    const providers: Provider[] = [
      IdentityService,
      { provide: IdentityRepository, useValue: repository },
    ];
    const module = await Test.createTestingModule({ controllers: [IdentityController], providers })
      .overrideGuard(ClerkAuthGuard)
      .useValue(guard)
      .compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    configureValidation(app as never, 50_000);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns only the approved masked profile projection', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/me')
      .expect(200);
    expect(response.body).toEqual(profile);
    expect(JSON.stringify(response.body)).not.toContain('owner@example.test');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('rejects unknown profile fields and missing idempotency keys', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .patch('/api/v1/me')
      .send({ locale: 'en', status: 'active', expectedVersion: 1 })
      .expect(400);
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .patch('/api/v1/me')
      .send({ locale: 'en', expectedVersion: 1 })
      .expect(400);
  });

  it('passes the strict profile update and bounded idempotency key', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .patch('/api/v1/me')
      .set('Idempotency-Key', 'profile-update_01')
      .send({ locale: 'en', expectedVersion: 1 })
      .expect(200);
    expect(response.body).toEqual({ ...profile, locale: 'en', version: 2 });
  });

  it('returns preferences and requires complete replacement', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/me/preferences')
      .expect(200, preferences);
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put('/api/v1/me/preferences')
      .set('Idempotency-Key', 'preferences_01')
      .send({ theme: 'dark', expectedVersion: 1 })
      .expect(400);
  });

  it('atomically replaces the complete preferences projection', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put('/api/v1/me/preferences')
      .set('Idempotency-Key', 'preferences_02')
      .send({
        defaultCurrency: 'SAR',
        language: 'ar',
        theme: 'dark',
        calendar: 'gregorian',
        weekStart: 6,
        privacySettings: {},
        expectedVersion: 1,
      })
      .expect(200);
    expect(response.body).toEqual({ ...preferences, theme: 'dark', version: 2 });
  });

  it('returns and replaces only minimal onboarding state', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/me/onboarding')
      .expect(200, { step: 'welcome', completedSteps: [], completedAt: null, version: 1 });
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put('/api/v1/me/onboarding')
      .set('Idempotency-Key', 'onboarding_01')
      .send({
        step: 'tracking_intro',
        completedSteps: ['welcome'],
        complete: false,
        expectedVersion: 1,
      })
      .expect(200, {
        step: 'tracking_intro', completedSteps: ['welcome'], completedAt: null, version: 2,
      });
  });

  it('rejects platform-only onboarding state', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .put('/api/v1/me/onboarding')
      .set('Idempotency-Key', 'onboarding_02')
      .send({
        step: 'tracking_intro',
        completedSteps: ['welcome'],
        complete: false,
        expectedVersion: 1,
        permissionState: 'granted',
      })
      .expect(400);
  });
});
