import { createClientDemoData } from '@/domain/demo-data';
import { AutomaticTrackingRepository } from './automatic-tracking-repository';
import { CoreFinanceRepository } from './core-finance-repository';
import { FinancialPlanningRepository } from './financial-planning-repository';

const now = Date.UTC(2027, 1, 15, 12);
const english = createClientDemoData(now, 'Asia/Riyadh', 'en');
const arabic = createClientDemoData(now, 'Asia/Riyadh', 'ar');

it('relocalizes known in-memory demo rows without changing financial state', () => {
  const finance = new CoreFinanceRepository({
    ...english.finance,
    transactions: [
      { ...english.finance.transactions[0], amountMinor: 99_999 },
      ...english.finance.transactions.slice(1)
    ]
  });
  const planning = new FinancialPlanningRepository({
    ...english.planning,
    budgets: [
      ...english.planning.budgets,
      { ...english.planning.budgets[0], id: 'user-budget', name: 'My budget' }
    ]
  });
  const tracking = new AutomaticTrackingRepository({
    ...english.tracking,
    events: [
      { ...english.tracking.events[0], amountMinor: 77_777 },
      ...english.tracking.events.slice(1)
    ]
  });

  finance.relocalizeDemoFixtures(arabic.finance);
  planning.relocalizeDemoFixtures(arabic.planning);
  tracking.relocalizeDemoFixtures(arabic.tracking);

  expect(finance.requireTransaction('demo-transaction-1')).toMatchObject({
    title: 'الراتب الشهري',
    amountMinor: 99_999
  });
  expect(planning.listBudgets().find(({ id }) => id === 'user-budget')).toMatchObject({
    name: 'My budget'
  });
  expect(tracking.requireEvent('demo-tracking-auto')).toMatchObject({
    merchant: 'أسواق التميمي',
    amountMinor: 77_777
  });
  expect(tracking.requireReview('demo-tracking-review-item').proposedValues.merchant).toBe(
    'متجر محلي'
  );
});
