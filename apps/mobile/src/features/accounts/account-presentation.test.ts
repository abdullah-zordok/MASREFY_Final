import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import { projectAccount } from './account-presentation';

it('keeps account identity separate from supplied balance state', () => {
  const account = fixtureAccounts[0];

  expect(
    projectAccount(account, {
      accountId: account.id,
      balanceMinor: 123_45,
      currencyCode: account.currencyCode
    })
  ).toMatchObject({
    balanceMinor: 123_45,
    balanceState: 'confirmed',
    identityLine: `${account.currencyCode} ${account.lastFour}`
  });

  expect(projectAccount(account).balanceState).toBe('unknown');
  expect(projectAccount(account, undefined, true).balanceState).toBe('hidden');
});

it('labels closed accounts independently of default state', () => {
  expect(
    projectAccount({ ...fixtureAccounts[0], status: 'closed', isDefault: true })
      .statusLabelKey
  ).toBe('coreFinance.accounts.closed');
});
