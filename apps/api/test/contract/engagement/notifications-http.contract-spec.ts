import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import { ENGAGEMENT_CUSTOMER_ROUTES } from '../../../src/engagement/engagement.routes';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('notification HTTP contract', () => {
  it('registers the six customer notification operations', () => {
    expect(
      ENGAGEMENT_CUSTOMER_ROUTES.filter((route) => route.path.startsWith('notifications')).map(
        (route) => route.operation,
      ),
    ).toEqual([
      'listNotifications',
      'getNotification',
      'setNotificationRead',
      'actOnNotification',
      'getNotificationPreferences',
      'replaceNotificationPreferences',
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
});
