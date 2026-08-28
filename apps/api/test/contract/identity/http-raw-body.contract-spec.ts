import { Body, Controller, Post, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import request from 'supertest';

import { configureValidation } from '../../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

@Controller()
class BodyProbeController {
  @Post('webhooks/clerk')
  webhook(@Req() req: Request): { hex: string; raw: boolean } {
    return {
      hex: Buffer.isBuffer(req.body) ? req.body.toString('hex') : '',
      raw: Buffer.isBuffer(req.body),
    };
  }

  @Post('ordinary-json')
  ordinary(@Body() body: unknown): unknown {
    return body;
  }
}

describe('Clerk webhook raw-body contract', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BodyProbeController],
    }).compile();
    const expressApp = module.createNestApplication<NestExpressApplication>();
    expressApp.use(new RequestIdMiddleware().use);
    configureValidation(expressApp, 128, ['/webhooks/clerk']);
    expressApp.useGlobalFilters(new SafeExceptionFilter());
    await expressApp.listen(0);
    app = expressApp;
  });

  afterEach(async () => app.close());

  it('preserves the exact Clerk request bytes for signature verification', async () => {
    const payload = '{\n  "type": "user.created", "data": {"id":"user_1"}\n}';
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(201);

    expect(response.body).toEqual({
      hex: Buffer.from(payload).toString('hex'),
      raw: true,
    });
  });

  it('keeps ordinary application/json routes parsed as JSON', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/ordinary-json')
      .send({ name: 'Masarifi' })
      .expect(201, { name: 'Masarifi' });
  });

  it('rejects a non-JSON webhook body', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk')
      .set('Content-Type', 'text/plain')
      .send('not-json')
      .expect(415);
  });

  it('enforces the shared decompressed body limit on webhook bytes', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(256) }))
      .expect(413);
  });
});
