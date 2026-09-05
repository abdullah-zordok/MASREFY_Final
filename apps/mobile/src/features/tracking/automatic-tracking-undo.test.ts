import { TrackingError } from '@/services/contracts/automatic-tracking-service';
import { createMockAutomaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { makeMockEvent } from '@/test-utils/automatic-tracking-fixtures';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';

describe('automatic tracking undo', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps undo available for the stored 30-second deadline only', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const deleted: string[] = [];
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      storage: trackingStorageStub(),
      financeService: ({
        getAccount: async () => fixtureAccounts[0],
        createTransaction: async () =>
          ({
            value: { id: 'transaction-auto' },
            affectedScopes: ['transactions.list']
          }) as never,
        deleteTransaction: async (id: string) => {
          deleted.push(id);
          return { value: {}, affectedScopes: ['transactions.list'] } as never;
        }
      } as unknown) as CoreFinanceService
    });

    const result = await service.processMockEvent(makeMockEvent('undo'));
    expect(result.feedback?.undoExpiresAt).toBe(31_000);

    await expect(
      service.undoAutomaticAddition(result.feedback!.id)
    ).resolves.toMatchObject({ value: { status: 'undone' } });
    expect(deleted).toEqual(['transaction-auto']);

    const expired = await service.processMockEvent(makeMockEvent('expired'));
    jest.spyOn(Date, 'now').mockReturnValue(40_000);
    await expect(
      service.undoAutomaticAddition(expired.feedback!.id)
    ).rejects.toEqual(new TrackingError('expired_undo'));
  });

  it('dedupes concurrent undo retries before deleting the owner transaction', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const deleted: string[] = [];
    const notifications: string[] = [];
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      storage: trackingStorageStub(),
      financeService: ({
        getAccount: async () => fixtureAccounts[0],
        createTransaction: async () =>
          ({
            value: { id: 'transaction-auto' },
            affectedScopes: ['transactions.list']
          }) as never,
        deleteTransaction: async (id: string) => {
          deleted.push(id);
          await Promise.resolve();
          return { value: {}, affectedScopes: ['transactions.list'] } as never;
        }
      } as unknown) as CoreFinanceService,
      notificationService: {
        createFromSource: async (event) => {
          notifications.push(event.eventKey);
          return { id: `notification-${event.eventKey}`, ...event } as never;
        }
      }
    });

    const result = await service.processMockEvent(makeMockEvent('undo-race'));
    await Promise.all([
      service.undoAutomaticAddition(result.feedback!.id),
      service.undoAutomaticAddition(result.feedback!.id)
    ]);

    expect(deleted).toEqual(['transaction-auto']);
    expect(notifications.filter((key) => key.endsWith(':undone'))).toHaveLength(1);
  });
});

function trackingStorageStub() {
  return {
    loadTrackingPreference: async () => ({
      mode: 'automatic_clear' as const,
      selectedAt: 1,
      isRecommended: true
    }),
    saveTrackingPreference: async () => undefined,
    loadKeywords: async () => [],
    saveKeywords: async () => undefined
  } as never;
}
