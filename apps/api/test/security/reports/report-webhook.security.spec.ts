import { createHmac } from 'node:crypto';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { configureValidation } from '../../../src/platform/http/http-validation';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';
import { ReportsWebhookController } from '../../../src/reports/reports.webhook.controller';
import { ReportsRepository } from '../../../src/reports/reports.repository';

describe('report delivery webhook', () => {
  const secret = 'w'.repeat(48);
  const receipts = new Map<string, string>();
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReportsWebhookController],
      providers: [
        { provide: PlatformConfigService, useValue: { get: jest.fn().mockReturnValue(secret) } },
        { provide: ReportsRepository, useValue: { captureDeliveryWebhook: jest.fn((id: string, hash: string) => {
          const previous = receipts.get(id);
          if (!previous) { receipts.set(id, hash); return 'new'; }
          return previous === hash ? 'replay' : 'conflict';
        }) } },
      ],
    }).compile();
    app = module.createNestApplication();
    configureValidation(app as never, 262_144, ['/webhooks/report-delivery']);
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  function headers(body: string, id = 'evt-1', time = Math.floor(Date.now() / 1000)) {
    const signature = createHmac('sha256', secret).update(`${id}.${String(time)}.${body}`).digest('hex');
    return { 'x-report-event-id': id, 'x-report-timestamp': String(time), 'x-report-signature': `v1=${signature}` };
  }

  it('accepts an identical signed replay and rejects a conflicting replay', async () => {
    const body = JSON.stringify({ type: 'accepted', attemptId: 'opaque' });
    await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/webhooks/report-delivery').set(headers(body)).set('content-type', 'application/json').send(body).expect(202);
    await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/webhooks/report-delivery').set(headers(body)).set('content-type', 'application/json').send(body).expect(202);
    const changed = JSON.stringify({ type: 'rejected', attemptId: 'opaque' });
    await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/webhooks/report-delivery').set(headers(changed)).set('content-type', 'application/json').send(changed).expect(409);
  });

  it('rejects stale and forged signatures', async () => {
    const body = '{}';
    await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/webhooks/report-delivery').set(headers(body, 'stale', Math.floor(Date.now() / 1000) - 301)).set('content-type', 'application/json').send(body).expect(401);
    await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/webhooks/report-delivery').set({ ...headers(body, 'forged'), 'x-report-signature': `v1=${'0'.repeat(64)}` }).set('content-type', 'application/json').send(body).expect(401);
  });
});
