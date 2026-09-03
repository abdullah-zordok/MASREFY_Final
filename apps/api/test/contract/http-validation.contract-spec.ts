import { request as rawRequest } from 'node:http';
import { gzipSync } from 'node:zlib';

import { Body, Controller, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsString, MaxLength } from 'class-validator';
import request from 'supertest';

import { configureValidation } from '../../src/platform/http/http-validation';
import { RequestIdMiddleware } from '../../src/platform/http/request-id.middleware';
import { SafeExceptionFilter } from '../../src/platform/http/safe-exception.filter';

class ProbeDto {
  @IsString()
  @MaxLength(32)
  name!: string;
}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Post('raw')
  raw(@Body() body: unknown): { bytes: number } {
    return { bytes: Buffer.isBuffer(body) ? body.length : -1 };
  }
}

describe('HTTP validation contract', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    const expressApp = module.createNestApplication<NestExpressApplication>();
    expressApp.use(new RequestIdMiddleware().use);
    configureValidation(expressApp, 1_024, [], {}, { '/probe/raw': 1_024 });
    expressApp.useGlobalFilters(new SafeExceptionFilter());
    await expressApp.listen(0);
    app = expressApp;
  });

  afterEach(async () => app.close());

  it('accepts only allowlisted DTO properties', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/probe')
      .send({ name: 'Masarifi' })
      .expect(201);

    expect(response.body).toEqual({ name: 'Masarifi' });
  });

  it('rejects unsupported content types with a stable request ID', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/probe')
      .set('Content-Type', 'text/plain')
      .send('name=Masarifi')
      .expect(415);

    const body = response.body as { code: string; requestId: string };
    expect(body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(body.requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it('admits bounded opaque bodies only on an explicitly configured route', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/probe/raw')
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-fictional'))
      .expect(201);

    expect(response.body).toEqual({ bytes: 14 });
  });

  it.each([
    ['unknown property', { name: 'Masarifi', unknown: true }],
    ['mass assignment', { name: 'Masarifi', isAdmin: true }],
  ])('rejects %s', async (_case, body) => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/probe')
      .send(body)
      .expect(400);

    const responseBody = response.body as { code: string; requestId: string };
    expect(responseBody).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(responseBody.requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it('rejects an oversized JSON body', async () => {
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/probe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(1_100) }))
      .expect(413);

    const body = response.body as { code: string; requestId: string };
    expect(body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(body.requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it('applies the body limit after decompression', async () => {
    const payload = gzipSync(JSON.stringify({ name: 'x'.repeat(4_096) }));
    const target = new URL('/probe', await app.getUrl());
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const call = rawRequest(
        target,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
            'Content-Length': String(payload.length),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          response.on('end', () => {
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );
      call.on('error', reject);
      call.end(payload);
    });

    expect(result.status).toBe(413);
    expect(JSON.parse(result.body)).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
    });
  });
});
