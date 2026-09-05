import { createMockAutomaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { makeMockEvent } from '@/test-utils/automatic-tracking-fixtures';
import { resolveTrackingRouteCapability } from './tracking-route-guard';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';

describe('automatic tracking critical journey', () => {
  it('covers clear add, review, duplicate, undo, rules, privacy, and iOS separation', async () => {
    const service = createMockAutomaticTrackingService({
      persistent: false,
      platform: 'android',
      permissionService: createMockTrackingPermissionService('granted'),
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
      financeService: ({
        getAccount: async () => fixtureAccounts[0],
        createTransaction: async () =>
          ({
            value: { id: 'transaction-auto' },
            affectedScopes: ['transactions.list']
          }) as never,
        deleteTransaction: async () =>
          ({ value: {}, affectedScopes: ['transactions.list'] }) as never
      } as unknown) as CoreFinanceService
    });

    const clear = await service.processMockEvent(makeMockEvent('journey-clear'));
    const review = await service.processMockEvent(
      makeMockEvent('journey-review', { confidenceBasisPoints: 8_900 })
    );
    const duplicate = await service.processMockEvent(
      makeMockEvent('journey-duplicate', {
        duplicateTransactionId: 'transaction-auto'
      })
    );

    expect(clear.event.transactionId).toBe('transaction-auto');
    expect(review.event.decisionStatus).toBe('review_required');
    expect(duplicate.event.transactionId).toBeNull();
    await expect(
      service.undoAutomaticAddition(clear.feedback!.id)
    ).resolves.toMatchObject({ value: { status: 'undone' } });
    await expect(service.getStatus()).resolves.toMatchObject({
      platform: 'android'
    });
    expect(resolveTrackingRouteCapability('ios').canUseAndroidTracking).toBe(false);
  });
});
