import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import { EngagementController } from '../../../src/engagement/engagement.controller';
import { ENGAGEMENT_CUSTOMER_ROUTES } from '../../../src/engagement/engagement.routes';
import { EngagementService } from '../../../src/engagement/engagement.service';
import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../../../src/identity/clerk-auth.guard';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('notification HTTP contract', () => {
  it('registers the six customer notification operations', () => {
    expect(
      ENGAGEMENT_CUSTOMER_ROUTES.filter((route) => route.path.startsWith('notifications')).map(
        (route) => route.operation,
      ),
    ).toEqual([
      'listNotifications',
      'getNotificationPreferences',
      'replaceNotificationPreferences',
      'getNotification',
      'setNotificationRead',
      'actOnNotification',
    ]);
  });

  it('publishes owner routes in runtime OpenAPI', async () => {
    const app: INestApplication = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    try {
      const paths = generateOpenApi(app).paths;
      expect(paths['/api/v1/notifications']?.get?.operationId).toBe('listNotifications');
      expect(paths['/api/v1/notifications/{notificationId}/actions']?.post?.operationId).toBe(
        'actOnNotification',
      );
      expect(paths['/api/v1/notifications/preferences']?.put?.operationId).toBe(
        'replaceNotificationPreferences',
      );
    } finally {
      await app.close();
    }
  });

  it('dispatches the actual preferences GET to the static route', async () => {
    const execute = jest.fn().mockResolvedValue({ items: [], version: 1 });
    const module = await Test.createTestingModule({
      controllers: [EngagementController],
      providers: [{ provide: EngagementService, useValue: { execute } }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<ClerkPrincipalRequest>().clerkPrincipal = {
            userId: 'contract_owner',
            sessionId: 'contract_session',
            factorAgeSeconds: 30,
          };
          return true;
        },
      })
      .compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get('/api/v1/notifications/preferences')
        .expect(200);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'contract_owner' }),
        expect.objectContaining({ operation: 'getNotificationPreferences', params: {} }),
      );
    } finally {
      await app.close();
    }
  });
});
