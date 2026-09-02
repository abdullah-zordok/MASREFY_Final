import { createMockTrackingPermissionService } from './tracking-permission-service';
import {
  createMockAutomaticTrackingService,
  createProductionAutomaticTrackingService
} from './automatic-tracking-service';
import { makeMockEvent } from '@/test-utils/automatic-tracking-fixtures';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import type {
  NotificationService,
  NotificationSourceEvent
} from '@/services/contracts/assistant-notifications-service';
import { coreFinanceService } from './core-finance-service';
import { AutomaticTrackingRepository } from '@/storage/automatic-tracking-repository';

describe('mock automatic tracking service', () => {
  it('does not record an event while tracking is paused', async () => {
    const service = createMockAutomaticTrackingService({
      storage: {
        loadTrackingPreference: async () => ({
          mode: 'paused',
          selectedAt: 1,
          isRecommended: false
        }),
        saveTrackingPreference: async () => undefined,
        loadKeywords: async () => [],
        saveKeywords: async () => undefined
      } as never
    });

    await expect(
      service.processMockEvent(makeMockEvent('paused'))
    ).rejects.toMatchObject({
      code: 'paused'
    });
    await expect(service.listHistory()).resolves.toMatchObject({ total: 0 });
  });

  it('fails closed outside demo mode without creating tracking history', async () => {
    const previous = process.env.EXPO_PUBLIC_DEMO_MODE;
    const createTransaction = jest.spyOn(
      coreFinanceService,
      'createTransaction'
    );
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    try {
      const service = createProductionAutomaticTrackingService('en');
      expect(service.metadata).toMatchObject({
        id: 'unavailable-automatic-tracking',
        availability: 'unavailable'
      });
      await expect(service.getStatus()).resolves.toMatchObject({
        permissionStatus: 'unavailable',
        serviceState: 'unavailable'
      });
      await expect(service.refreshStatus()).resolves.toMatchObject({
        permissionStatus: 'unavailable',
        serviceState: 'unavailable'
      });
      await expect(
        service.processMockEvent(makeMockEvent('production'))
      ).rejects.toMatchObject({ code: 'permission_required' });
      await expect(service.setMode('paused')).rejects.toMatchObject({
        code: 'permission_required'
      });
      await expect(service.clearHistory()).resolves.toMatchObject({ value: 0 });
      await expect(service.purgeExpiredSourceText()).resolves.toBe(0);
      await expect(service.saveKeywordRules([])).rejects.toMatchObject({
        code: 'permission_required'
      });
      await expect(service.listHistory()).resolves.toMatchObject({ total: 0 });
      expect(createTransaction).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
      else process.env.EXPO_PUBLIC_DEMO_MODE = previous;
    }
  });

  it('durably purges expired source text even when capture is unavailable', async () => {
    const repository = new AutomaticTrackingRepository();
    const event = repository.createEvent(
      makeMockEvent('expired-source'),
      'review_required',
      ['low_confidence'],
      1
    );
    repository.updateEvent(event.id, { sourceTextExpiresAt: 2 });
    jest.spyOn(repository, 'hydrate').mockResolvedValue();
    const persist = jest.spyOn(repository, 'persistAll').mockResolvedValue();
    const service = createMockAutomaticTrackingService({
      repository,
      persistent: true,
      permissionService: createMockTrackingPermissionService('unavailable')
    });

    await service.getStatus();

    expect(repository.requireEvent(event.id).sourceText).toBeNull();
    expect(persist).toHaveBeenCalled();
    const historyCount = (await service.listHistory()).total;
    await expect(service.clearHistory()).resolves.toMatchObject({
      value: historyCount
    });
    await expect(service.listHistory()).resolves.toMatchObject({ total: 0 });
  });

  it('reports automatic tracking unavailable when platform ingestion is unavailable', async () => {
    const service = createMockAutomaticTrackingService({
      persistent: false,
      platform: 'android',
      permissionService: createMockTrackingPermissionService('unavailable')
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      permissionStatus: 'unavailable',
      serviceState: 'unavailable'
    });
  });

  it('loads tracking history and review data in client demo mode', async () => {
    const previous = process.env.EXPO_PUBLIC_DEMO_MODE;
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    try {
      const service = createProductionAutomaticTrackingService('en');
      expect(service.metadata.id).toBe('demo-automatic-tracking');
      expect((await service.listHistory()).total).toBeGreaterThan(0);
      expect((await service.listReviewItems()).total).toBeGreaterThan(0);
      expect((await service.listSenderRules()).length).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
      else process.env.EXPO_PUBLIC_DEMO_MODE = previous;
    }
  });

  it('auto-adds clear events once and routes uncertain items to review', async () => {
    const created: string[] = [];
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      notificationService: {
        createFromSource: async (event: NotificationSourceEvent) =>
          ({ id: `notification-${event.eventKey}`, ...event }) as never
      } as Partial<NotificationService> as NotificationService,
      storage: {
        loadTrackingPreference: async () => ({
          mode: 'automatic_clear',
          selectedAt: 1,
          isRecommended: true
        }),
        saveTrackingPreference: async () => undefined,
        loadKeywords: async () => [],
        saveKeywords: async () => undefined
      } as never,
      financeService: {
        createTransaction: async (
          _input: Parameters<CoreFinanceService['createTransaction']>[0],
          operationId: Parameters<CoreFinanceService['createTransaction']>[1],
          source: Parameters<CoreFinanceService['createTransaction']>[2]
        ) => {
          expect(source).toBe('automatic');
          created.push(operationId ?? '');
          return {
            value: { id: `transaction-${created.length}` },
            affectedScopes: ['transactions.list']
          } as never;
        },
        deleteTransaction: async () =>
          ({ value: {}, affectedScopes: [] }) as never
      } as unknown as CoreFinanceService
    });

    const clear = await service.processMockEvent(makeMockEvent('clear'));
    const duplicateDelivery = await service.processMockEvent(
      makeMockEvent('clear')
    );
    const review = await service.processMockEvent(
      makeMockEvent('review', { confidenceBasisPoints: 8_900 })
    );

    expect(clear.event.decisionStatus).toBe('auto_added');
    expect(duplicateDelivery.event.id).toBe(clear.event.id);
    expect(review.event.decisionStatus).toBe('review_required');
    expect(created).toEqual(['sms:clear']);
  });

  it('emits central notifications exactly once for automatic tracking outcomes', async () => {
    const notifications: NotificationSourceEvent[] = [];
    const deleted: string[] = [];
    let nextTransaction = 0;
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      notificationService: {
        createFromSource: async (event: NotificationSourceEvent) => {
          notifications.push(event);
          return {
            id: `notification-${notifications.length}`,
            ...event
          } as never;
        }
      } as Partial<NotificationService> as NotificationService,
      storage: {
        loadTrackingPreference: async () => ({
          mode: 'automatic_clear',
          selectedAt: 1,
          isRecommended: true
        }),
        saveTrackingPreference: async () => undefined,
        loadKeywords: async () => [],
        saveKeywords: async () => undefined
      } as never,
      financeService: {
        createTransaction: async () =>
          ({
            value: { id: `transaction-${++nextTransaction}` },
            affectedScopes: []
          }) as never,
        deleteTransaction: async (id: string) => {
          deleted.push(id);
          return { value: {}, affectedScopes: [] } as never;
        }
      } as unknown as CoreFinanceService
    });

    const expense = await service.processMockEvent(makeMockEvent('expense'));
    await service.processMockEvent(makeMockEvent('expense'));
    await service.processMockEvent(
      makeMockEvent('income', { eventType: 'deposit' })
    );
    await service.processMockEvent(
      makeMockEvent('review', { confidenceBasisPoints: 8_900 })
    );
    await service.processMockEvent(
      makeMockEvent('duplicate', {
        duplicateTransactionId: 'transaction-existing'
      })
    );
    await service.processMockEvent(
      makeMockEvent('refund', {
        eventType: 'refund',
        priorEventId: 'transaction-original'
      })
    );
    await service.processMockEvent(
      makeMockEvent('correction', { priorEventId: 'transaction-original' })
    );
    await service.processMockEvent(
      makeMockEvent('reversal', {
        eventType: 'reversal',
        priorEventId: 'transaction-original'
      })
    );
    await Promise.all([
      service.undoAutomaticAddition(expense.feedback!.id),
      service.undoAutomaticAddition(expense.feedback!.id)
    ]);

    expect(deleted).toEqual([expense.feedback!.transactionId]);
    expect(notifications.map((event) => event.eventKey)).toEqual([
      'tracking:expense:auto-added',
      'tracking:income:auto-added',
      'tracking:review:review-required',
      'tracking:duplicate:duplicate',
      'tracking:refund:auto-added',
      'tracking:correction:auto-added',
      'tracking:reversal:auto-added',
      'tracking:expense:undone'
    ]);
    expect(
      notifications.filter(
        (event) => event.eventKey === 'tracking:expense:auto-added'
      )
    ).toHaveLength(1);
    expect(
      notifications.filter(
        (event) => event.eventKey === 'tracking:expense:undone'
      )
    ).toHaveLength(1);
  });
});
