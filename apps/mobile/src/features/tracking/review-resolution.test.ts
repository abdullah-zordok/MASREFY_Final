import { createMockAutomaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { makeMockEvent } from '@/test-utils/automatic-tracking-fixtures';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';

describe('review resolution', () => {
  it('keeps uncertain detections pending until explicit resolution', async () => {
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      financeService: {
        getAccount: async () => fixtureAccounts[0]
      } as unknown as CoreFinanceService,
      storage: storageStub()
    });

    const detected = await service.processMockEvent(
      makeMockEvent('review-item', { confidenceBasisPoints: 8_900 })
    );
    const page = await service.listReviewItems();
    const resolved = await service.resolveReview(page.items[0].id, {
      action: 'ignore'
    });

    expect(detected.event.transactionId).toBeNull();
    expect(page.items).toHaveLength(1);
    expect(resolved.value.status).toBe('ignored');
  });
});

function storageStub() {
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
