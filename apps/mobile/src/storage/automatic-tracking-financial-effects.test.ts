import { createMockAutomaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { makeMockEvent } from '@/test-utils/automatic-tracking-fixtures';
import type { CoreFinanceService } from '@/services/contracts/core-finance-service';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';

describe('automatic tracking financial effects', () => {
  it('creates one automatic transaction and returns affected scopes', async () => {
    const created: string[] = [];
    const service = createMockAutomaticTrackingService({
      persistent: false,
      permissionService: createMockTrackingPermissionService('granted'),
      storage: trackingStorageStub(),
      financeService: ({
        getAccount: async () => fixtureAccounts[0],
        createTransaction: async (
          _input: Parameters<CoreFinanceService['createTransaction']>[0],
          operationId: Parameters<CoreFinanceService['createTransaction']>[1],
          source: Parameters<CoreFinanceService['createTransaction']>[2]
        ) => {
          created.push(`${operationId}:${source}`);
          return {
            value: { id: 'transaction-auto' },
            affectedScopes: ['transactions.list', 'home.summary']
          } as never;
        }
      } as unknown) as CoreFinanceService
    });

    const result = await service.processMockEvent(makeMockEvent('auto'));

    expect(result.event.transactionId).toBe('transaction-auto');
    expect(result.affectedScopes).toEqual(
      expect.arrayContaining(['transactions.list', 'home.summary'])
    );
    expect(created).toEqual(['sms:auto:automatic']);
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
