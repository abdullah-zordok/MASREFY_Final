import type { Account } from '@/domain/core-finance';
import type { AccountBalanceProjection } from '@/services/contracts/core-finance-service';

export type AccountBalanceState = 'confirmed' | 'unknown' | 'hidden';

export interface AccountPresentation {
  account: Account;
  balanceMinor: number | null;
  balanceState: AccountBalanceState;
  identityLine: string;
  statusLabelKey: string | null;
}

export function projectAccount(
  account: Account,
  balance?: AccountBalanceProjection,
  hidden = false
): AccountPresentation {
  return {
    account,
    balanceMinor: balance?.balanceMinor ?? null,
    balanceState: hidden ? 'hidden' : balance ? 'confirmed' : 'unknown',
    identityLine: account.lastFour
      ? `${account.currencyCode} ${account.lastFour}`
      : account.currencyCode,
    statusLabelKey:
      account.status === 'closed'
        ? 'coreFinance.accounts.closed'
        : account.status === 'archived'
          ? 'coreFinance.accounts.archived'
          : account.isDefault
            ? 'coreFinance.accounts.default'
            : null
  };
}
