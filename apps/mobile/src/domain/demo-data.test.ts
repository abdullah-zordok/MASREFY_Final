import { createDemoTransactions } from './core-finance-seeds';
import { createDemoFinancialPlanningSeed } from './financial-planning-seeds';
import { createClientDemoData } from './demo-data';

const now = Date.UTC(2027, 1, 15, 12);

it('builds coherent demo finance and planning data for the current month', () => {
  const transactions = createDemoTransactions(now);
  const planning = createDemoFinancialPlanningSeed(now, 'Asia/Riyadh');

  expect(transactions).toHaveLength(9);
  expect(
    transactions.every(
      (transaction) =>
        new Date(transaction.occurredAt).toISOString().slice(0, 7) === '2027-02'
    )
  ).toBe(true);
  expect(planning.budgets).toEqual([
    expect.objectContaining({ id: 'demo-budget-current', periodKey: '2027-02' })
  ]);
  expect(planning.salaryReceipts).toEqual([
    expect.objectContaining({ transactionId: 'demo-transaction-1' })
  ]);
  expect(planning.categoryBudgets).toHaveLength(3);
  expect(planning.obligations).toHaveLength(1);
  expect(planning.scheduleItems.length).toBeGreaterThan(1);
  expect(planning.savingsGoals).toHaveLength(1);
  expect(planning.goalMovements).toHaveLength(1);
  expect(createClientDemoData(now).tracking.senders).toHaveLength(1);
});

it('builds Arabic and English demo financial fixtures without changing their identities', () => {
  const english = createClientDemoData(now, 'Asia/Riyadh', 'en');
  const arabic = createClientDemoData(now, 'Asia/Riyadh', 'ar');

  expect(english.finance.transactions.map(({ title }) => title)).toEqual([
    'Monthly salary',
    'Rent payment',
    'Grocery run',
    'Coffee meeting',
    'Client dinner supplies',
    'Wallet top-up',
    'Electricity bill',
    'Streaming subscription',
    'Card refund'
  ]);
  expect(arabic.finance.transactions.map(({ title }) => title)).toEqual([
    'الراتب الشهري',
    'دفعة الإيجار',
    'مشتريات البقالة',
    'لقاء في المقهى',
    'مستلزمات العشاء',
    'شحن المحفظة',
    'فاتورة الكهرباء',
    'اشتراك البث',
    'استرداد البطاقة'
  ]);
  expect(english.finance.accounts.map(({ name }) => name)).toEqual([
    'Masarifi',
    'Cash Wallet',
    'Client Card'
  ]);
  expect(english.planning).toMatchObject({
    budgets: [{ name: 'Monthly budget' }],
    obligations: [{ title: 'Car installment' }],
    savingsGoals: [{ title: 'Emergency fund' }]
  });
  expect(arabic.planning).toMatchObject({
    budgets: [{ name: 'الميزانية الشهرية' }],
    obligations: [{ title: 'قسط السيارة' }],
    savingsGoals: [{ title: 'صندوق الطوارئ' }]
  });
  expect(arabic.tracking.events[0].merchant).toBe('أسواق التميمي');
  expect(arabic.tracking.senders[0].displayLabel).toBe('بنك مصاريفي');
  expect(arabic.notifications[0].messageValues).toEqual({
    merchant: 'أسواق التميمي'
  });
  expect(arabic.finance.transactions.map(({ id }) => id)).toEqual(
    english.finance.transactions.map(({ id }) => id)
  );
});
