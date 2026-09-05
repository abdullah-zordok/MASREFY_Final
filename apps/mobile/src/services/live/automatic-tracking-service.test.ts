import { createLiveAutomaticTrackingService } from './automatic-tracking-service';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: () => Promise.resolve('event-source-digest'),
  randomUUID: () => '00000000-0000-4000-8000-000000000001'
}));

function response(value: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('live automatic tracking adapter', () => {
  it('uses authenticated HTTP and maps owner status without fixture data', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        response({ available: true, mode: 'review_all', reviewCount: 2 })
      );
    const service = createLiveAutomaticTrackingService({
      baseUrl: 'https://api.example.test',
      token: async () => 'owner-token',
      request
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      mode: 'review_all',
      serviceState: 'healthy',
      reviewCount: 2
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/tracking/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer owner-token'
        })
      })
    );
  });

  it('sends expected versions and idempotency keys for rule mutations', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'rule-1',
              keyword: 'paid',
              groupKey: 'expense',
              languageCode: 'en',
              origin: 'custom',
              enabled: true,
              version: 7
            }
          ]
        })
      )
      .mockResolvedValueOnce(response({ id: 'rule-1' }))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'rule-1',
              keyword: 'spent',
              groupKey: 'expense',
              languageCode: 'en',
              origin: 'custom',
              enabled: true,
              version: 8
            }
          ]
        })
      );
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await service.saveKeywordRules([
      {
        id: 'rule-1',
        value: 'spent',
        normalizedValue: 'spent',
        group: 'expense',
        language: 'en',
        origin: 'custom',
        enabled: true
      }
    ]);

    const mutation = request.mock.calls[1]?.[1];
    expect(mutation?.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': expect.any(String) })
    );
    expect(JSON.parse(String(mutation?.body))).toMatchObject({
      expectedVersion: 7,
      value: 'spent'
    });
  });

  it('preserves owner cursors and maps review filters to the backend contract', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'history-1',
              sourceRef: 'item-1',
              outcome: 'accepted',
              occurredAt: '2026-09-02T08:00:00Z'
            }
          ],
          nextCursor: 'next-history'
        })
      )
      .mockResolvedValueOnce(
        response({ items: [], nextCursor: 'next-review' })
      );
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(
      service.listHistory({ cursor: 'history-cursor', pageSize: 20 })
    ).resolves.toMatchObject({
      nextCursor: 'next-history',
      items: [{ action: 'auto_added' }]
    });
    await expect(
      service.listReviewItems({
        cursor: 'review-cursor',
        pageSize: 10,
        status: 'ignored'
      })
    ).resolves.toMatchObject({
      nextCursor: 'next-review'
    });
    expect(request.mock.calls[0]?.[0]).toContain('cursor=history-cursor');
    expect(request.mock.calls[1]?.[0]).toContain('status=rejected');
  });

  it('maps a blocked-account conflict from a review decision', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response({ id: 'review-1', version: 1 }))
      .mockResolvedValueOnce(response({ id: 'review-1', version: 1 }))
      .mockResolvedValueOnce(
        response({ code: 'TRACKING_ACCOUNT_BLOCKED' }, 409)
      );
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(
      service.resolveReview('review-1', { action: 'confirm' })
    ).rejects.toMatchObject({ code: 'account_blocked' });
  });

  it('reuses the same request identity for repeated delivery of one source event', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-03T10:00:00.000Z'));
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() =>
        Promise.resolve(response({ resource: { id: 'session-1' } }, 201))
      );
    const firstService = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });
    const event = {
      sourceFingerprint: 'sms:stable-source',
      eventType: 'purchase' as const,
      confidenceBasisPoints: 9000,
      sourceText: 'Paid SAR 12'
    };

    await firstService.processMockEvent(event);
    jest.advanceTimersByTime(60_000);
    const restartedService = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });
    await restartedService.processMockEvent(event);

    const first = request.mock.calls[0]?.[1];
    const second = request.mock.calls[1]?.[1];
    expect(first?.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': 'event-source-digest' })
    );
    expect(second?.headers).toEqual(first?.headers);
    const firstBody = JSON.parse(String(first?.body));
    const secondBody = JSON.parse(String(second?.body));
    expect(firstBody.events[0].occurredAt).toBeUndefined();
    expect(secondBody.events[0].occurredAt).toBeUndefined();
    delete firstBody.events[0].receivedAt;
    delete secondBody.events[0].receivedAt;
    expect(secondBody).toEqual(firstBody);
    jest.useRealTimers();
  });

  it('undoes an automatic addition through the ledger reversal command before feedback', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'history-1',
              sourceRef: 'item-1',
              transactionId: 'transaction-1',
              outcome: 'accepted',
              occurredAt: '2026-09-02T08:00:00Z'
            }
          ]
        })
      )
      .mockResolvedValueOnce(response({ transaction: { version: 4 } }))
      .mockResolvedValueOnce(response({ operationId: 'reverse-1' }, 201))
      .mockResolvedValueOnce(response({ resource: { id: 'feedback-1' } }, 201));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(
      service.undoAutomaticAddition('history-1')
    ).resolves.toMatchObject({
      value: {
        id: 'feedback-1',
        transactionId: 'transaction-1',
        status: 'undone'
      }
    });
    expect(request.mock.calls[2]?.[0]).toContain(
      '/api/v1/transactions/transaction-1/reverse'
    );
    expect(request.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body))).toMatchObject({
      expectedVersion: 4,
      reason: 'Undo automatic tracking addition'
    });
    expect(request.mock.calls[3]?.[0]).toContain('/api/v1/tracking/feedback');
  });
});
