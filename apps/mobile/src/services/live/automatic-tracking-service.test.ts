import {
  configureAutomaticTrackingTokenProvider,
  createLiveAutomaticTrackingService
} from './automatic-tracking-service';

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
  const importSession = (status: string) => ({
    id: 'session-1',
    sourceType: 'sms',
    sourceName: null,
    schemaVersion: 1,
    status,
    itemCount: 1,
    acceptedCount: status === 'complete' ? 1 : 0,
    rejectedCount: status === 'failed' ? 1 : 0,
    attemptCount: 1,
    nextAttemptAt: null,
    startedAt: '2026-09-12T10:00:00.000Z',
    completedAt: ['complete', 'failed', 'cancelled'].includes(status)
      ? '2026-09-12T10:01:00.000Z'
      : null,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:01:00.000Z',
    version: 2
  });

  it('submits an SMS import with the caller idempotency key', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response({ resource: importSession('received') }, 202));
    const service = createLiveAutomaticTrackingService({
      baseUrl: 'https://api.example.test',
      token: async () => 'token',
      request
    });
    const input = {
      schemaVersion: 1 as const,
      sourceType: 'sms' as const,
      sourceChannel: 'android_sms' as const,
      events: [
        {
          sourceItemKey: 'sha256:message',
          sender: 'BANK',
          amountMinor: -1250,
          currency: 'SAR',
          kind: 'expense' as const,
          accountId: '10000000-0000-4000-8000-000000000001',
          receivedAt: '2026-09-12T10:00:00.000Z'
        }
      ]
    };

    await expect(service.submitImport(input, 'sms:sha256:message')).resolves.toMatchObject({
      id: 'session-1',
      status: 'received',
      itemCount: 1
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/imports',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'sms:sha256:message'
        }),
        body: JSON.stringify(input)
      })
    );
  });

  it.each(['received', 'processing', 'review', 'complete', 'failed', 'cancelled'])(
    'maps the %s import session state',
    async (status) => {
      const service = createLiveAutomaticTrackingService({
        token: async () => 'token',
        request: jest.fn().mockResolvedValue(response(importSession(status)))
      });

      await expect(service.getImportSession('session-1')).resolves.toMatchObject({
        id: 'session-1',
        status,
        updatedAt: Date.parse('2026-09-12T10:01:00.000Z')
      });
    }
  );

  it('lists every duplicate page and preserves backend IDs', async () => {
    const duplicate = {
      id: 'duplicate-1',
      leftItemId: 'item-1',
      rightTransactionId: 'transaction-1',
      score: '0.91',
      reasons: ['same_amount'],
      resolution: null,
      status: 'proposed',
      decidedAt: null
    };
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'next' }))
      .mockResolvedValueOnce(response({ items: [duplicate], nextCursor: null }));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(service.listDuplicates()).resolves.toEqual([
      expect.objectContaining({
        id: 'duplicate-1',
        detectedEventId: 'item-1',
        existingTransactionId: 'transaction-1'
      })
    ]);
    expect(request.mock.calls[1]?.[0]).toContain('cursor=next');
  });

  it('lists import item IDs through the existing session-items endpoint', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response({ items: [{ id: 'item-1' }], nextCursor: 'next' }))
      .mockResolvedValueOnce(response({ items: [{ id: 'item-2' }], nextCursor: null }));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(service.listImportItemIds('session-1')).resolves.toEqual([
      'item-1',
      'item-2'
    ]);
    expect(request.mock.calls[0]?.[0]).toContain(
      '/api/v1/imports/session-1/items'
    );
  });

  it('rejects malformed import sessions', async () => {
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request: jest.fn().mockResolvedValue(response({ ...importSession('complete'), itemCount: -1 }))
    });

    await expect(service.getImportSession('session-1')).rejects.toMatchObject({
      code: 'unknown'
    });
  });

  it('uses authenticated HTTP and maps owner status without fixture data', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        response({
          available: true,
          mode: 'review_all',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 3,
          reviewCount: 2,
          activeKeywordCount: 4,
          activeSenderCount: 5,
          lastUpdatedAt: '2026-09-02T08:00:00Z'
        })
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
              recentUseCount: 0,
              lastUsedAt: null,
              version: 7
            }
          ],
          nextCursor: null
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
              recentUseCount: 0,
              lastUsedAt: null,
              version: 8
            }
          ],
          nextCursor: null
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

  it('creates new keyword rules and deletes removed custom rules', async () => {
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
              recentUseCount: 0,
              lastUsedAt: null,
              version: 7
            }
          ],
          nextCursor: null
        })
      )
      .mockResolvedValueOnce(response({}, 204))
      .mockResolvedValueOnce(response({ id: 'rule-2' }, 201))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'rule-2',
              keyword: 'coffee',
              groupKey: 'expense',
              languageCode: 'en',
              origin: 'custom',
              enabled: true,
              recentUseCount: 0,
              lastUsedAt: null,
              version: 1
            }
          ],
          nextCursor: null
        })
      );
    const service = createLiveAutomaticTrackingService({
      baseUrl: 'https://api.example.test',
      token: async () => 'token',
      request
    });

    await service.saveKeywordRules([
      {
        id: 'expense-en-coffee',
        value: 'coffee',
        normalizedValue: 'coffee',
        group: 'expense',
        language: 'en',
        origin: 'custom',
        enabled: true
      }
    ]);

    expect(request.mock.calls[1]?.[0]).toContain(
      '/api/v1/tracking/keyword-rules/rule-1?expectedVersion=7'
    );
    expect(request.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(request.mock.calls[2]?.[0]).toContain(
      '/api/v1/tracking/keyword-rules'
    );
    expect(request.mock.calls[2]?.[1]?.method).toBe('POST');
    expect(
      JSON.parse(String(request.mock.calls[2]?.[1]?.body))
    ).not.toHaveProperty('expectedVersion');
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
              reasonCodes: [],
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
      .mockResolvedValueOnce(
        response({
          id: 'review-1',
          importItemId: 'item-1',
          status: 'pending',
          reason: 'low_confidence',
          proposedValues: {},
          version: 1,
          reviewedAt: null,
          createdAt: '2026-09-02T08:00:00Z',
          updatedAt: '2026-09-02T08:00:00Z'
        })
      )
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

  it.each([
    ['confirm', undefined, 'accept'],
    ['confirm', { merchant: 'Corrected merchant' }, 'edit_accept'],
    ['ignore', undefined, 'reject'],
    ['report_wrong', undefined, 'reject']
  ] as const)(
    'maps the %s review action to the owner decision without a direct ledger request',
    async (action, values, expectedDecision) => {
      const request = jest.fn<
        ReturnType<typeof fetch>,
        Parameters<typeof fetch>
      >(async (input, init) => {
        const url = String(input);
        if (init?.method === 'GET')
          return response({
            id: 'review-1',
            importItemId: 'item-1',
            status: 'pending',
            reason: 'low_confidence',
            proposedValues: {},
            version: 7,
            reviewedAt: null,
            createdAt: '2026-09-02T08:00:00Z',
            updatedAt: '2026-09-02T08:00:00Z'
          });
        if (url.endsWith('/api/v1/reviews/review-1/decision'))
          return response({
            resource: {
              id: 'review-1',
              importItemId: 'item-1',
              status: expectedDecision === 'reject' ? 'rejected' : 'accepted',
              reason: 'low_confidence',
              proposedValues: {},
              version: 8,
              reviewedAt: '2026-09-02T08:01:00Z',
              createdAt: '2026-09-02T08:00:00Z',
              updatedAt: '2026-09-02T08:01:00Z'
            }
          });
        throw new Error(`unexpected request: ${url}`);
      });
      const service = createLiveAutomaticTrackingService({
        token: async () => 'token',
        request
      });

      await service.resolveReview('review-1', { action, values });

      const decision = request.mock.calls.find(([url]) =>
        String(url).endsWith('/api/v1/reviews/review-1/decision')
      );
      expect(JSON.parse(String(decision?.[1]?.body))).toMatchObject({
        decision: expectedDecision,
        expectedVersion: 7
      });
      expect(request.mock.calls.map(([url]) => String(url))).not.toEqual(
        expect.arrayContaining([expect.stringContaining('/transactions')])
      );
    }
  );

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
          ],
          nextCursor: null
        })
      )
      .mockResolvedValueOnce(response({ transaction: { version: 4 } }))
      .mockResolvedValueOnce(response({ operationId: 'reverse-1' }, 201))
      .mockResolvedValueOnce(
        response(
          {
            resource: {
              id: 'feedback-1',
              createdAt: '2026-09-02T08:01:00Z'
            }
          },
          201
        )
      );
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

  it('keeps processMockEvent unavailable in the live provider', async () => {
    const request = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(
      service.processMockEvent({
        sourceFingerprint: 'demo-only',
        eventType: 'purchase',
        confidenceBasisPoints: 9000
      })
    ).rejects.toMatchObject({ code: 'permission_required' });
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the configured Clerk token provider when no request token is injected', async () => {
    configureAutomaticTrackingTokenProvider(
      async () => 'configured-owner-token'
    );
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        response({
          available: true,
          mode: 'paused',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 0,
          reviewCount: 0,
          activeKeywordCount: 0,
          activeSenderCount: 0,
          lastUpdatedAt: '2026-09-02T08:00:00Z'
        })
      );

    await createLiveAutomaticTrackingService({ request }).getStatus();

    expect(request.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer configured-owner-token'
      })
    );
  });

  it('preserves retention preferences when changing mode', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        response({
          enabled: false,
          reviewRequired: true,
          sourceRetentionDays: 7,
          historyRetentionDays: 90,
          version: 4
        })
      )
      .mockResolvedValueOnce(response({ resource: { version: 5 } }))
      .mockResolvedValueOnce(
        response({
          available: true,
          mode: 'review_all',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 0,
          reviewCount: 0,
          activeKeywordCount: 0,
          activeSenderCount: 0,
          lastUpdatedAt: '2026-09-02T08:00:00Z'
        })
      );
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await service.setMode('review_all');

    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      enabled: true,
      reviewRequired: true,
      sourceRetentionDays: 7,
      historyRetentionDays: 90,
      expectedVersion: 4
    });
  });

  it('traverses every cursor when locating history records', async () => {
    const history = {
      id: 'history-late',
      sourceRef: 'event-late',
      sourceType: 'manual',
      outcome: 'rejected',
      reasonCodes: ['invalid_input'],
      occurredAt: '2026-09-02T08:00:00Z',
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
      eventType: 'purchase',
      confidenceBasisPoints: 1000,
      amountMinor: 1200,
      currencyCode: 'SAR',
      merchant: 'Merchant',
      categoryId: null,
      accountId: null,
      paymentMethod: null,
      transactionId: null
    };
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'late-cursor' }))
      .mockResolvedValueOnce(response({ items: [history], nextCursor: null }));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(service.getDetectedEvent('event-late')).resolves.toMatchObject(
      {
        id: 'event-late',
        eventType: 'purchase',
        amountMinor: 1200
      }
    );
    expect(request.mock.calls[1]?.[0]).toContain('cursor=late-cursor');
  });

  it('traverses every cursor when reporting a wrong detection', async () => {
    const history = {
      id: 'history-report',
      sourceRef: 'event-report',
      sourceType: 'manual',
      outcome: 'accepted',
      reasonCodes: ['clear_success'],
      occurredAt: '2026-09-02T08:00:00Z',
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
      eventType: 'purchase',
      confidenceBasisPoints: 9000,
      amountMinor: 1200,
      currencyCode: 'SAR',
      merchant: 'Merchant',
      categoryId: null,
      accountId: null,
      paymentMethod: null,
      transactionId: 'transaction-report'
    };
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'report-next' }))
      .mockResolvedValueOnce(response({ items: [history], nextCursor: null }))
      .mockResolvedValueOnce(
        response({
          resource: {
            id: 'feedback-report',
            createdAt: '2026-09-02T08:03:00Z'
          }
        })
      )
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'event-next' }))
      .mockResolvedValueOnce(response({ items: [history], nextCursor: null }));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(
      service.reportWrongDetection('event-report')
    ).resolves.toMatchObject({
      value: {
        id: 'event-report',
        decisionStatus: 'rejected',
        updatedAt: Date.parse('2026-09-02T08:03:00Z')
      }
    });
    expect(request.mock.calls[1]?.[0]).toContain('cursor=report-next');
    expect(request.mock.calls[4]?.[0]).toContain('cursor=event-next');
  });

  it('traverses every cursor for keyword and sender rule collections', async () => {
    const keyword = {
      id: 'keyword-late',
      keyword: 'paid',
      groupKey: 'expense',
      languageCode: 'en',
      origin: 'custom',
      enabled: true,
      recentUseCount: 2,
      lastUsedAt: '2026-09-02T08:00:00Z',
      version: 3
    };
    const sender = {
      id: 'sender-late',
      senderPattern: 'BANK',
      displayLabel: 'Bank',
      institutionId: null,
      origin: 'custom',
      enabled: true,
      trusted: false,
      recentUseCount: 1,
      lastUsedAt: null,
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
      version: 2
    };
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        response({ items: [], nextCursor: 'keyword-next' })
      )
      .mockResolvedValueOnce(response({ items: [keyword], nextCursor: null }))
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'sender-next' }))
      .mockResolvedValueOnce(response({ items: [sender], nextCursor: null }));
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(service.listKeywordRules()).resolves.toHaveLength(1);
    await expect(service.listSenderRules()).resolves.toHaveLength(1);
    expect(request.mock.calls[1]?.[0]).toContain('cursor=keyword-next');
    expect(request.mock.calls[3]?.[0]).toContain('cursor=sender-next');
  });

  it('rejects unknown owner states instead of coercing them', async () => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        response({
          available: true,
          mode: 'future-mode',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 0,
          reviewCount: 0,
          activeKeywordCount: 0,
          activeSenderCount: 0,
          lastUpdatedAt: '2026-09-02T08:00:00Z'
        })
      );
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request
    });

    await expect(service.getStatus()).rejects.toMatchObject({
      code: 'unknown'
    });
  });

  it('rejects incomplete status and duplicate resources instead of inventing values', async () => {
    const incompleteStatus = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request: jest.fn().mockResolvedValue(
        response({
          mode: 'paused',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 0,
          reviewCount: 0,
          activeKeywordCount: 0,
          activeSenderCount: 0,
          lastUpdatedAt: '2026-09-02T08:00:00Z'
        })
      )
    });
    const incompleteDuplicate = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request: jest.fn().mockResolvedValue(
        response({
          id: 'duplicate-1',
          leftItemId: 'item-1',
          rightTransactionId: 'transaction-1',
          resolution: null,
          status: 'proposed',
          decidedAt: null
        })
      )
    });

    await expect(incompleteStatus.getStatus()).rejects.toMatchObject({
      code: 'unknown'
    });
    await expect(
      incompleteDuplicate.getDuplicate('duplicate-1')
    ).rejects.toMatchObject({ code: 'unknown' });
  });

  it('reports a missing undo history item as not found', async () => {
    const service = createLiveAutomaticTrackingService({
      token: async () => 'token',
      request: jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(response({ items: [], nextCursor: null }))
    });

    await expect(
      service.undoAutomaticAddition('missing')
    ).rejects.toMatchObject({
      code: 'not_found'
    });
  });
});
