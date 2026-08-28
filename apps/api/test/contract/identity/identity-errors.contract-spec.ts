import { Controller, Get, HttpException, Param, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

const cases = [
  ['AUTH_TOKEN_INVALID', 401, 'Authentication token is invalid'],
  ['PROFILE_INACTIVE', 403, 'Profile is inactive'],
  ['PROFILE_SYNC_UNAVAILABLE', 503, 'Profile synchronization is unavailable'],
  ['VERSION_CONFLICT', 409, 'Resource version conflict'],
  ['RECENT_AUTH_REQUIRED', 403, 'Recent authentication is required'],
  ['DEVICE_NOT_FOUND', 404, 'Device not found'],
  ['PUSH_TOKEN_CONFLICT', 409, 'Push token is already registered'],
  ['PROVIDER_UNAVAILABLE', 503, 'Provider is unavailable'],
  ['INVALID_WEBHOOK', 400, 'Webhook payload is invalid'],
  ['WEBHOOK_SIGNATURE_INVALID', 401, 'Webhook signature is invalid'],
  ['WEBHOOK_EVENT_CONFLICT', 409, 'Webhook event conflicts with an existing delivery'],
] as const;

const statusByCode = new Map<string, number>(cases.map(([code, status]) => [code, status]));

@Controller('error-probe')
class ErrorProbeController {
  @Get(':code')
  fail(@Param('code') code: string): never {
    throw new HttpException(
      { code, message: 'provider secret database stack must never escape' },
      statusByCode.get(code) ?? 500,
    );
  }
}

describe('identity safe-error contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ErrorProbeController] }).compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it.each(cases)('maps %s to its allowlisted envelope', async (code, status, message) => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get(`/error-probe/${code}`)
      .expect(status);

    const body = response.body as { requestId: string };
    expect(body).toMatchObject({ code, message });
    expect(body.requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(JSON.stringify(response.body)).not.toMatch(/provider secret|database stack/i);
  });

  it('does not expose an unapproved error code or message', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/error-probe/LEAK_PROVIDER_DETAIL')
      .expect(500);

    expect(response.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/LEAK_PROVIDER_DETAIL|provider secret/i);
  });
});
