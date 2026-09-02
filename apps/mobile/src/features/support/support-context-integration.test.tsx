import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { TransactionDetailScreen } from '@/features/transactions/TransactionDetailScreen';
import { AssistantConversationScreen } from '@/features/assistant/AssistantConversationScreen';
import type { AssistantResponse } from '@/domain/assistant';
import type { Transaction } from '@/domain/core-finance';
import { renderWithProviders } from '@/test-utils/render';
import { translateDynamic } from '@/localization/i18n';
import {
  buildAssistantSupportContext,
  buildTransactionSupportContext
} from './support-context';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() }
}));
jest.mock('@/features/core-finance/core-finance-queries', () => ({
  useTransaction: jest.fn(() => ({
    isLoading: false,
    isError: false,
    data: mockTransaction()
  })),
  useAccounts: jest.fn(() => ({
    data: [{ id: 'account-secret', name: 'Checking' }]
  })),
  useCategories: jest.fn(() => ({
    data: [{ id: 'food', labelEn: 'Food', labelAr: 'طعام' }]
  })),
  useRemainingRefundableMinor: jest.fn(() => ({
    data: 0,
    isLoading: false,
    isError: false,
    refetch: jest.fn()
  })),
  invalidateCoreFinanceScopes: jest.fn()
}));
jest.mock('@/features/assistant/assistant-queries', () => ({
  useAssistantConversation: jest.fn(() => ({
    data: mockConversationPage(),
    isLoading: false,
    isError: false
  })),
  useAskAssistant: jest.fn(() => ({ mutate: jest.fn() })),
  useRenameAssistantConversation: jest.fn(() => ({ mutate: jest.fn() })),
  useDeleteAssistantConversation: jest.fn(() => ({ mutate: jest.fn() })),
  useAssistantFeedback: jest.fn(() => ({ mutate: jest.fn() }))
}));

test('transaction report entry passes only the approved structural context', () => {
  const context = buildTransactionSupportContext(
    mockTransaction() as unknown as Transaction,
    { appVersion: '1.0.0' }
  );
  expect(context).toEqual({
    itemId: 'transaction-1',
    itemKind: 'transaction',
    category: 'food',
    status: 'posted',
    appVersion: '1.0.0',
    diagnosticCategory: 'transaction'
  });
  expect(JSON.stringify(context)).not.toMatch(
    /2500|account-secret|raw sms|private note|credential|secret/i
  );

  renderWithProviders(<TransactionDetailScreen id="transaction-1" />);
  fireEvent.press(
    screen.getByText(translateDynamic('support.report.transaction'))
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: { mode: 'transaction_report', context: JSON.stringify(context) }
  });
});

test('assistant report entry passes response id and safe status without conversation history', () => {
  const response = mockConversationPage().responses.items[0];
  const context = buildAssistantSupportContext(
    response as unknown as AssistantResponse,
    { appVersion: '1.0.0' }
  );
  expect(context).toEqual({
    itemId: 'response-1',
    itemKind: 'assistant_response',
    category: 'assistant',
    status: 'answered',
    appVersion: '1.0.0',
    diagnosticCategory: 'assistant'
  });
  expect(JSON.stringify(context)).not.toMatch(
    /private question|private answer|2500|conversation|credential|secret/i
  );

  renderWithProviders(
    <AssistantConversationScreen conversationId="conversation-1" />
  );
  fireEvent.press(
    screen.getByText(translateDynamic('support.report.assistant'))
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: { mode: 'assistant_report', context: JSON.stringify(context) }
  });
});

function mockTransaction() {
  return {
    id: 'transaction-1',
    title: 'Private title',
    amountMinor: 2500,
    currencyCode: 'SAR',
    accountId: 'account-secret',
    categoryId: 'food',
    occurredAt: 1,
    type: 'expense',
    source: 'manual',
    status: 'posted',
    syncStatus: 'synced',
    note: 'private note',
    sourceText: 'raw sms'
  };
}

function mockConversationPage() {
  return {
    conversation: {
      id: 'conversation-1',
      title: 'Private conversation',
      version: 1
    },
    responses: {
      items: [
        {
          id: 'response-1',
          question: 'private question',
          blocks: [{ text: 'private answer' }],
          responseType: 'direct',
          snapshot: { reportReference: null },
          proposedActionIds: []
        }
      ],
      nextCursor: null,
      total: 1
    }
  };
}
