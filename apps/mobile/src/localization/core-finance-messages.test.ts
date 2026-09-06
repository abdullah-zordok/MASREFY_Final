import ar from './messages/ar';
import en from './messages/en';

it('keeps Arabic and English core-finance keys in parity', () => {
  const enKeys = Object.keys(en).filter((key) => key.startsWith('coreFinance.'));
  const arKeys = Object.keys(ar).filter((key) => key.startsWith('coreFinance.'));
  expect(arKeys.sort()).toEqual(enKeys.sort());
  expect(enKeys.length).toBeGreaterThan(50);
});

it.each([en, ar])('localizes card terms and every payoff outcome', (messages) => {
  for (const key of [
    'coreFinance.accounts.setup.statementDay',
    'coreFinance.accounts.setup.dueDay',
    'coreFinance.accounts.setup.monthlyInterestBasisPoints',
    'coreFinance.accounts.setup.minimumPayment',
    'coreFinance.accounts.payoff.months',
    'coreFinance.accounts.payoff.paymentNotAboveInterest',
    'coreFinance.accounts.payoff.monthLimitExceeded'
  ] as const)
    expect(messages[key]).toBeTruthy();
});
