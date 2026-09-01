import type { Account, Transaction } from '@/domain/core-finance';
import type { Obligation } from '@/domain/financial-planning';
import {
  fixtureAccounts,
  fixtureCategories,
  makeTransaction
} from './core-finance-fixtures';
import { fixtureObligation } from './financial-planning-fixtures';

const at = Date.UTC(2026, 7, 8, 12);

function account(id: string, openingBalanceMinor: number): Account {
  return {
    ...fixtureAccounts[0],
    id,
    name: id,
    currencyCode: 'SAR',
    openingBalanceMinor,
    createdAt: at,
    updatedAt: at
  };
}

function transaction(
  index: number,
  overrides: Partial<Transaction>
): Transaction {
  return makeTransaction(index, {
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    reviewStatus: 'none',
    syncStatus: 'synced',
    status: 'posted',
    version: index,
    ...overrides
  });
}

const bank = account('canonical-bank', 100_000);
const card: Account = {
  ...account('canonical-card', -32_000),
  type: 'credit_card'
};
const spending = account('canonical-spending', 7_500);
const transferSource = account('canonical-transfer-source', 0);
const transferDestination = account('canonical-transfer-destination', 0);

const expense = transaction(101, {
  id: 'canonical-expense',
  type: 'expense',
  amountMinor: 10_000,
  accountId: spending.id,
  categoryId: 'food',
  title: 'Canonical expense'
});
const refund = transaction(102, {
  id: 'canonical-refund',
  type: 'refund',
  amountMinor: 2_500,
  accountId: spending.id,
  categoryId: 'food',
  originalTransactionId: expense.id,
  title: 'Canonical partial refund'
});
const transfer = transaction(103, {
  id: 'canonical-transfer',
  type: 'transfer',
  transferPurpose: 'internal',
  amountMinor: 5_000,
  accountId: transferSource.id,
  destinationAccountId: transferDestination.id,
  categoryId: null,
  title: 'Canonical internal transfer'
});
const payoff = transaction(104, {
  id: 'canonical-payoff',
  type: 'transfer',
  transferPurpose: 'card_payoff',
  amountMinor: 20_000,
  accountId: bank.id,
  destinationAccountId: card.id,
  categoryId: null,
  title: 'Canonical card payoff'
});
const payable: Obligation = {
  ...fixtureObligation,
  id: 'canonical-card-payable',
  version: 201,
  title: 'Canonical card liability',
  contractedTotalMinor: 32_000,
  openingPaidMinor: 20_000,
  fundingAccountId: card.id,
  createdAt: at,
  updatedAt: at
};
const receivable: Obligation = {
  ...fixtureObligation,
  id: 'canonical-receivable',
  version: 202,
  direction: 'receivable',
  type: 'custom',
  title: 'Canonical receivable',
  contractedTotalMinor: 15_000,
  openingPaidMinor: 0,
  fundingAccountId: null,
  createdAt: at,
  updatedAt: at
};

export const clientRemediationFinancialFixture = {
  at,
  accounts: [bank, card, spending, transferSource, transferDestination],
  categories: fixtureCategories,
  transactions: [expense, refund, transfer, payoff],
  obligations: [payable, receivable],
  ids: {
    bank: bank.id,
    card: card.id,
    expense: expense.id,
    refund: refund.id,
    transfer: transfer.id,
    payoff: payoff.id,
    payable: payable.id,
    receivable: receivable.id
  },
  expected: {
    incomeMinor: 0,
    expenseMinor: 7_500,
    bankBalanceMinor: 80_000,
    cardBalanceMinor: -12_000,
    netWorthMinor: 68_000,
    payablesMinor: 12_000,
    receivablesMinor: 15_000
  }
} as const;
