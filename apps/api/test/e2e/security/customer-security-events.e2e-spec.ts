import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Customer security event route E2E', () => {
  it('passes only the owner cursor filters to the owner-scoped operation', async () => {
    const cursor = Buffer.from(
      JSON.stringify(['2026-08-29T08:00:00.000Z', '0198f79d-98f3-7bb4-a820-f43bb4d0e190']),
    ).toString('base64url');
    const { app, execute } = await createSecurityE2eHarness({ items: [], nextCursor: null });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get(`/api/v1/me/security/events?limit=100&severity=high&cursor=${cursor}`)
        .expect(200);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'listMySecurityEvents',
          query: { limit: '100', severity: 'high', cursor },
        }),
      );
    } finally {
      await app.close();
    }
  });
});
