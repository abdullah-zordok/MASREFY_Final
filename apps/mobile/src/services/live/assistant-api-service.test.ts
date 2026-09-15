import { assistantPollDelay, createLiveAssistantApiService } from './assistant-api-service';

const id = (suffix: number) =>
  `99100000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-03T00:00:00.000Z';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
const conversation = {
  id: id(1),
  title: 'Spend?',
  status: 'active',
  lastMessageAt: '2026-09-03T00:00:01.000Z',
  version: 2,
  createdAt: at
};

function preview(status = 'validated', version = 3) {
  return {
    id: id(5),
    messageId: id(3),
    schemaVersion: 1,
    actionType: 'savings_goal.create',
    payload: { name: 'Buffer', targetMinor: '50000', currencyCode: 'SAR' },
    status,
    expiresAt: '2026-09-03T00:15:00.000Z',
    confirmedAt: status === 'executed' ? '2026-09-03T00:02:00.000Z' : null,
    executedResourceId: status === 'executed' ? id(6) : null,
    confirmationOperationId: status === 'executed' ? id(7) : null,
    createdAt: at,
    updatedAt: '2026-09-03T00:00:01.000Z',
    version
  };
}

function messages(actionPreview: unknown = null) {
  return {
    items: [
      {
        id: id(3),
        conversationId: id(1),
        replyToMessageId: id(2),
        role: 'assistant',
        content: 'Safe answer',
        status: 'completed',
        failureCode: null,
        snapshot: {
          id: id(4),
          schemaVersion: 1,
          evidenceRefs: [{ kind: 'budget', alias: 'BUDGET-1', version: 8 }],
          model: 'approved-model',
          provider: 'approved-provider',
          createdAt: '2026-09-03T00:00:01.000Z'
        },
        preview: actionPreview,
        createdAt: '2026-09-03T00:00:01.000Z'
      },
      {
        id: id(2),
        conversationId: id(1),
        replyToMessageId: null,
        role: 'user',
        content: 'Spend?',
        status: 'completed',
        failureCode: null,
        snapshot: null,
        preview: null,
        createdAt: at
      }
    ],
    nextCursor: null
  };
}

const conversations = { items: [conversation], nextCursor: null };

it('backs off assistant polling without exceeding two seconds', () => {
  expect([0, 5, 10, 20, 40].map(assistantPollDelay)).toEqual([
    250,
    500,
    1000,
    2000,
    2000
  ]);
});

it('sends canonical quick-question intent without a broad client-selected context scope', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversation, 201))
    .mockResolvedValueOnce(json({ id: id(2), status: 'completed' }, 202))
    .mockResolvedValueOnce(json(messages()));
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await service.createConversation(
    { question: 'Spend?', intent: 'spending_summary' },
    'quick-question-operation'
  );

  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    content: 'Spend?',
    intent: 'spending_summary',
    responseMode: 'async'
  });
});

it('uses authoritative owner availability and shared rolling-quota values', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      json({
        status: 'available',
        limit: 5,
        used: 2,
        remaining: 3,
        resetsAt: '2026-09-04T00:00:00.000Z'
      })
    );
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getAvailability()).resolves.toEqual({
    status: 'available',
    remainingQuestions: 3,
    limit: 5,
    used: 2,
    resetsAt: '2026-09-04T00:00:00.000Z'
  });
  expect(request.mock.calls[0]?.[0]).toBe(
    'https://api.test/api/v1/assistant/availability'
  );
});

it('maps authoritative proactive insights without inventing financial values', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValueOnce(json({
    items: [{
      id: id(10), signal_key: `budget:${id(11)}:85`, kind: 'budget_threshold',
      payload: { budgetName: 'Restaurants', currency: 'SAR', budgetMinor: '100000', spentMinor: '85000', remainingMinor: '15000', utilizationBps: 8500 },
      source_version: 12, status: 'active', expires_at: '2026-09-17T00:00:00.000Z', created_at: at
    }]
  }));
  const service = createLiveAssistantApiService({ baseUrl: 'https://api.test', token: async () => 'owner', request });

  await expect(service.listInsights()).resolves.toEqual([expect.objectContaining({
    id: id(10), budgetName: 'Restaurants', budgetMinor: 100000, spentMinor: 85000,
    remainingMinor: 15000, utilizationBps: 8500
  })]);
});

it('retrieves a response on a cold service and preserves exact evidence versions', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages()));
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getResponse(id(3))).resolves.toMatchObject({
    id: id(3),
    conversationId: id(1),
    question: 'Spend?',
    blocks: [{ key: 'Safe answer' }],
    snapshot: { sources: [{ kind: 'budget', id: 'BUDGET-1', version: 8 }] }
  });
});

it('retrieves and strictly maps a cold action preview while exposing edit as unavailable', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages(preview())));
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  const value = await service.getActionPreview(id(5));
  expect(value).toMatchObject({
    id: id(5),
    responseId: id(3),
    kind: 'create_goal',
    input: { amountMinor: 50_000, currency: 'SAR' },
    sourceVersions: [{ id: 'BUDGET-1', version: 8 }],
    status: 'ready',
    version: 3
  });
  await expect(
    service.updateActionPreview(id(5), value.input, 3)
  ).rejects.toMatchObject({ code: 'assistant_disabled' });
  expect(request).toHaveBeenCalledTimes(2);
});

it('does not return a cached preview after the authoritative owner lookup stops containing it', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages(preview())))
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages()));
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(service.getActionPreview(id(5))).resolves.toMatchObject({
    id: id(5)
  });
  await expect(service.getActionPreview(id(5))).rejects.toMatchObject({
    code: 'not_found'
  });
  expect(request).toHaveBeenCalledTimes(4);
});

it('sends the expected consent version and returns the authoritative next version', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      json({
        policyVersion: 'assistant-privacy-v1',
        granted: true,
        grantedAt: at,
        revokedAt: null,
        version: 4
      })
    );
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });

  await expect(
    service.setConsent(true, 3, 'consent-operation')
  ).resolves.toMatchObject({
    value: { status: 'enabled', version: 4 }
  });
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    policyVersion: 'assistant-privacy-v1',
    accepted: true,
    expectedVersion: 3
  });
});

it('re-reads the authoritative preview after confirmation instead of incrementing a cached version', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages(preview())))
    .mockResolvedValueOnce(
      json({
        sourceId: id(5),
        actionType: 'savings_goal.create',
        resourceId: id(6),
        status: 'executed',
        replayed: false
      })
    )
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages(preview('executed', 6))));
  const service = createLiveAssistantApiService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  await service.getActionPreview(id(5));

  await expect(
    service.confirmAction(id(5), 3, 'confirm-operation')
  ).resolves.toMatchObject({
    value: {
      id: id(5),
      status: 'succeeded',
      operationId: id(7),
      resultReference: id(6),
      version: 6
    }
  });
  expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body))).toEqual({
    expectedVersion: 3
  });
  expect(request.mock.calls[2]?.[1]?.headers).toEqual(
    expect.objectContaining({ 'Idempotency-Key': 'confirm-operation' })
  );
});

it('fails explicitly on unknown owner states and maps supported transaction updates', async () => {
  const unknownConversation = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(
      json({ items: [{ ...conversation, status: 'future' }], nextCursor: null })
    );
  await expect(
    createLiveAssistantApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request: unknownConversation
    }).listConversations({})
  ).rejects.toMatchObject({ code: 'representative_failure' });

  const unsupportedPreview = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(
      json(
        messages({
          ...preview(),
          actionType: 'transaction.update',
          payload: {
            transactionId: id(8),
            expectedVersion: 1,
            reason: 'Update'
          }
        })
      )
    );
  await expect(
    createLiveAssistantApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request: unsupportedPreview
    }).getActionPreview(id(5))
  ).resolves.toMatchObject({
    kind: 'update_transaction',
    affectedDestination: { kind: 'transactions' }
  });
});

it.each([
  ['transaction.create', { amountMinor: '1250', currency: 'SAR' }, 'create_transaction'],
  ['transaction.update', { transactionId: id(8), expectedVersion: 1, reason: 'Update' }, 'update_transaction'],
  ['budget.update', { budgetId: id(8), expectedVersion: 1, patch: { totalMinor: '100000' } }, 'update_budget'],
  ['savings_goal.create', { name: 'Buffer', targetMinor: '50000', currencyCode: 'SAR' }, 'create_goal'],
  ['obligation.payment.record', { obligationId: id(8), transactionId: id(9), expectedVersion: 1 }, 'record_obligation_payment'],
  ['tracking.review.resolve', { reviewId: id(8), decision: 'accept', expectedVersion: 1, edit: {} }, 'resolve_tracking_review']
] as const)('maps backend action %s safely', async (actionType, payload, kind) => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(json(conversations))
    .mockResolvedValueOnce(json(messages({ ...preview(), actionType, payload })));

  await expect(
    createLiveAssistantApiService({
      baseUrl: 'https://api.test',
      token: async () => 'owner',
      request
    }).getActionPreview(id(5))
  ).resolves.toMatchObject({ kind });
});
