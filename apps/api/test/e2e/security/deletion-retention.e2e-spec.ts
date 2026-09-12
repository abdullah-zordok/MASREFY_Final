import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Deletion and retention routes E2E', () => {
  it('routes deletion and hold mutations with their explicit status codes', async () => {
    const { app, execute } = await createSecurityE2eHarness({
      id: 'request-1',
      status: 'verified',
    });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/me/deletion-requests')
        .set('idempotency-key', 'deletion-e2e-1')
        .send({ confirmation: 'DELETE_MY_ACCOUNT', reason: 'Customer confirmed deletion' })
        .expect(202);
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/admin/retention/holds')
        .set('idempotency-key', 'retention-hold-e2e')
        .send({
          resourceType: 'identity',
          resourceId: 'customer-1',
          reason: 'Legal preservation order',
        })
        .expect(201);
      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'createMyDeletionRequest',
        'createRetentionHold',
      ]);
    } finally {
      await app.close();
    }
  });

  it('routes the Admin deletion list and versioned action through the live contract', async () => {
    const deletionId = '13000000-0000-4000-8000-000000000021';
    const { app, execute } = await createSecurityE2eHarness();
    execute.mockImplementation((input) =>
      Promise.resolve(
        input.operation === 'listDeletionRequests'
          ? { items: [], nextCursor: null }
          : {
              id: deletionId,
              status: 'verified',
              requestedAt: '2026-09-12T10:00:00.000Z',
              coolingOffEndsAt: '2026-09-13T10:00:00.000Z',
              completedAt: null,
              version: 2,
            },
      ),
    );
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get('/api/v1/admin/privacy/deletions?limit=25&status=verified')
        .expect(200, { items: [], nextCursor: null });
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post(`/api/v1/admin/privacy/deletions/${deletionId}/actions`)
        .set('idempotency-key', 'admin-deletion-e2e-1')
        .send({
          action: 'verify',
          reason: 'Deletion request reviewed against the retention policy.',
          expectedVersion: 1,
        })
        .expect(200);

      expect(execute.mock.calls.map(([input]) => ({
        operation: input.operation,
        permission: input.permission,
        query: input.query,
        body: input.body,
      }))).toEqual([
        {
          operation: 'listDeletionRequests',
          permission: 'privacy.deletions.read',
          query: { limit: '25', status: 'verified' },
          body: undefined,
        },
        {
          operation: 'actOnDeletionRequest',
          permission: 'privacy.deletions.manage',
          query: {},
          body: {
            action: 'verify',
            reason: 'Deletion request reviewed against the retention policy.',
            expectedVersion: 1,
          },
        },
      ]);
    } finally {
      await app.close();
    }
  });
});
