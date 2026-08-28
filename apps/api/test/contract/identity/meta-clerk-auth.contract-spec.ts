import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import { ClerkClientService } from '../../../src/identity/clerk-client.service';
import { SafeExceptionFilter } from '../../../src/platform/http/safe-exception.filter';

function signedIn(): unknown {
  return {
    isAuthenticated: true,
    userId: 'user_meta_1',
    sessionId: 'sess_meta_1',
    sessionStatus: 'active',
    factorVerificationAge: [1, 3],
    role: 'authenticated',
    azp: undefined,
  };
}

describe('/api/v1/meta Clerk authentication contract', () => {
  async function createApp(authenticateRequest: jest.Mock): Promise<INestApplication> {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkClientService)
      .useValue({ authenticateRequest })
      .compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
    return app;
  }

  it('uses the shared Clerk verifier before returning metadata', async () => {
    const authenticateRequest = jest.fn().mockResolvedValue(signedIn());
    const app = await createApp(authenticateRequest);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .set('Authorization', 'Bearer opaque-meta-token')
      .expect(200);
    expect(authenticateRequest).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns the stable 401 envelope for an unusable session', async () => {
    const app = await createApp(jest.fn().mockResolvedValue({ isAuthenticated: false }));
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .set('Authorization', 'Bearer unusable-session-token')
      .expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_TOKEN_INVALID' });
    expect(JSON.stringify(response.body)).not.toContain('unusable-session-token');
    await app.close();
  });

  it('returns a stable 503 without provider detail when Clerk is unavailable', async () => {
    const app = await createApp(
      jest.fn().mockRejectedValue(new Error('provider host and response detail')),
    );
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/api/v1/meta')
      .set('Authorization', 'Bearer opaque-meta-token')
      .expect(503);

    expect(response.body).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(response.body)).not.toMatch(/provider host|opaque-meta-token/i);
    await app.close();
  });
});
