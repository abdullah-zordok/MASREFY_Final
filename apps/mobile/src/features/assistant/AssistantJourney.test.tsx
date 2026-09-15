import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';
import { changeLocale, translateDynamic as t } from '@/localization/i18n';

const { AssistantHomeScreen, AssistantConversationScreen } = require('./AssistantHomeScreen') as Record<string, React.ComponentType<any>>;
const { createMockAssistantService } = require('@/services/mocks/assistant-service') as { createMockAssistantService(input?: Record<string, unknown>): any };
const mockAssistantQueries = {
  useAssistantConsent: jest.fn(),
  useAssistantInsights: jest.fn(),
  useSetAssistantConsent: jest.fn(),
  useCreateAssistantConversation: jest.fn(),
  useAssistantConversations: jest.fn(),
  useAssistantConversation: jest.fn(),
  useAskAssistant: jest.fn(),
  useRenameAssistantConversation: jest.fn(),
  useDeleteAssistantConversation: jest.fn(),
  useAssistantFeedback: jest.fn()
};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ conversationId: 'conversation-1' }) }));
jest.mock('./assistant-queries', () => mockAssistantQueries);

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('en');
  mockAssistantQueries.useAssistantConsent.mockReturnValue({ data: { status: 'enabled', version: 1 }, isLoading: false, isError: false });
  mockAssistantQueries.useAssistantInsights.mockReturnValue({ data: [] });
  mockAssistantQueries.useSetAssistantConsent.mockReturnValue({ mutate: jest.fn() });
  mockAssistantQueries.useCreateAssistantConversation.mockReturnValue({ mutate: jest.fn(), error: null });
  mockAssistantQueries.useAssistantConversations.mockReturnValue({
    data: { items: [conversation()], nextCursor: null, total: 1 },
    isLoading: false,
    isError: false
  });
  mockAssistantQueries.useAssistantConversation.mockReturnValue({
    data: {
      conversation: conversation(),
      responses: { items: [response()], nextCursor: null, total: 1 }
    },
    isLoading: false,
    isError: false
  });
  mockAssistantQueries.useAskAssistant.mockReturnValue({ mutate: jest.fn() });
  mockAssistantQueries.useRenameAssistantConversation.mockReturnValue({ mutate: jest.fn() });
  mockAssistantQueries.useDeleteAssistantConversation.mockReturnValue({ mutate: jest.fn() });
  mockAssistantQueries.useAssistantFeedback.mockReturnValue({ mutate: jest.fn() });
});

test('home shows consent disclosure, suggestions, history, and required data states', () => {
  const create = jest.fn();
  mockAssistantQueries.useCreateAssistantConversation.mockReturnValue({ mutate: create, error: { code: 'offline' } });
  mockAssistantQueries.useAssistantConversations.mockReturnValue({
    data: { items: [conversation()], nextCursor: null, total: 0 },
    isLoading: false,
    isError: false
  });

  renderWithProviders(<AssistantHomeScreen />);

  expect(screen.getByLabelText(t('appShell.navigation.assistant'))).toBeTruthy();
  expect(screen.getByText(t('assistant.consent.title'))).toBeTruthy();
  expect(screen.getByText(t('assistant.privacy.transactions'))).toBeTruthy();
  expect(screen.getByText(t('assistant.suggestions.spending'))).toBeTruthy();
  expect(screen.getByText('January budget help')).toBeTruthy();
  expect(screen.getByText(t('assistant.state.offline'))).toBeTruthy();
  expect(screen.getByText(t('assistant.state.empty'))).toBeTruthy();

  fireEvent.press(screen.getByText(t('assistant.suggestions.spending')));
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ question: t('assistant.suggestions.spending') }),
    expect.objectContaining({ onSuccess: expect.any(Function) })
  );
});

test('conversation renders structured labels, evidence, limitations, feedback, report, rename, delete confirmation, and paging', () => {
  const ask = jest.fn();
  const rename = jest.fn();
  const remove = jest.fn();
  const feedback = jest.fn();
  const conversationHook = jest.fn((_id: string, cursor?: string) => ({
    data: {
      conversation: conversation(),
      responses: { items: [response(cursor ? 'response-2' : 'response-1')], nextCursor: cursor ? null : 'page-2', total: 2 }
    },
    isLoading: false,
    isError: false
  }));
  mockAssistantQueries.useAssistantConversation.mockImplementation(conversationHook);
  mockAssistantQueries.useAskAssistant.mockReturnValue({ mutate: ask, isPending: false });
  mockAssistantQueries.useRenameAssistantConversation.mockReturnValue({ mutate: rename, isPending: false });
  mockAssistantQueries.useDeleteAssistantConversation.mockReturnValue({ mutate: remove, isPending: false });
  mockAssistantQueries.useAssistantFeedback.mockReturnValue({ mutate: feedback, isPending: false });

  const rendered = renderWithProviders(<AssistantConversationScreen conversationId="conversation-1" />);

  expect(screen.getByText('January budget help')).toBeTruthy();
  expect(screen.getByText(t('assistant.label.fact'))).toBeTruthy();
  expect(screen.getByText(t('assistant.answer.direct'))).toBeTruthy();
  expect(screen.queryByText('assistant.answer.direct')).toBeNull();
  expect(screen.getByText(t('assistant.label.estimate'))).toBeTruthy();
  expect(screen.getByText(t('assistant.evidence.report'))).toBeTruthy();
  expect(screen.getByText(t('assistant.limitation.reviewExcluded'))).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText(t('assistant.input.question')), 'How can I save?');
  fireEvent.changeText(screen.getByLabelText(t('assistant.input.rename')), 'Renamed budget help');
  fireEvent.press(screen.getByText(t('assistant.action.ask')));
  fireEvent.press(screen.getByText(t('assistant.action.rename')));
  fireEvent.press(screen.getByText(t('assistant.action.delete')));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(t('assistant.action.cancelDelete')));
  fireEvent.press(screen.getByText(t('assistant.action.delete')));
  fireEvent.press(screen.getAllByText(t('assistant.action.confirmDelete')).at(-1)!);
  fireEvent.press(screen.getByText(t('assistant.feedback.helpful')));
  fireEvent.press(screen.getByText(t('assistant.feedback.report')));
  act(() => rendered.UNSAFE_getByType(FlatList).props.onEndReached());

  expect(ask).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conversation-1', question: 'How can I save?' }));
  expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: 'conversation-1', title: 'Renamed budget help' }));
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'conversation-1' }));
  expect(feedback).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'response-1' }));
  expect(conversationHook).toHaveBeenCalledWith('conversation-1', 'page-2');
});

test('suggestion-to-owner journey keeps chat/cancel/stale/replay side-effect safe', async () => {
  const owners = { createGoal: jest.fn(async () => ({ value: { id: 'goal-owner', version: 1 }, affectedScopes: ['planning.goals'] })) };
  const service = serviceWithOwners(owners);
  await service.setConsent(true, 1, 'consent-owner');

  const chat = await service.createConversation({ question: 'What did I spend?' }, 'ordinary-chat');
  expect((await service.getConversation(chat.value.id)).responses.items[0].proposedActionIds).toEqual([]);
  expect(owners.createGoal).not.toHaveBeenCalled();

  const cancelledConversation = await service.createConversation({ question: 'Make me a savings plan' }, 'cancel-chat');
  const cancelledPreviewId = (await service.getConversation(cancelledConversation.value.id)).responses.items[0].proposedActionIds[0];
  await service.cancelAction(cancelledPreviewId, 1, 'cancel-preview');
  expect(owners.createGoal).not.toHaveBeenCalled();

  const stale = serviceWithOwners(owners, jest.fn(async () => [{ id: 'budget-1', version: 3 }]));
  await stale.setConsent(true, 1, 'consent-stale-owner');
  const staleConversation = await stale.createConversation({ question: 'Make me a savings plan' }, 'stale-chat');
  const stalePreviewId = (await stale.getConversation(staleConversation.value.id)).responses.items[0].proposedActionIds[0];
  expect((await stale.confirmAction(stalePreviewId, 1, 'stale-confirm')).value.status).toBe('stale');
  expect(owners.createGoal).not.toHaveBeenCalled();

  const confirmedConversation = await service.createConversation({ question: 'Make me a savings plan' }, 'confirm-chat');
  const confirmedPreviewId = (await service.getConversation(confirmedConversation.value.id)).responses.items[0].proposedActionIds[0];
  const first = await service.confirmAction(confirmedPreviewId, 1, 'confirm-owner');
  expect(await service.confirmAction(confirmedPreviewId, 1, 'confirm-owner')).toEqual(first);
  expect(owners.createGoal).toHaveBeenCalledTimes(1);
});

function conversation() {
  return {
    id: 'conversation-1',
    title: 'January budget help',
    status: 'active',
    createdAt: 1,
    updatedAt: 2,
    lastResponseId: 'response-1',
    version: 1
  };
}

function response(id = 'response-1') {
  return {
    id,
    conversationId: 'conversation-1',
    question: 'What changed?',
    responseType: 'direct',
    blocks: [
      { label: 'fact', key: 'assistant.answer.direct', values: {} },
      { label: 'estimate', key: 'assistant.answer.estimate', values: {} }
    ],
    period: 'monthly:2026-01-01',
    dataAsOf: 1,
    snapshot: {
      sources: [{ kind: 'report', id: 'report-1', version: 1 }],
      values: [],
      completeness: { confirmed: 1, reviewRequired: 1, conflicts: 0, reasons: ['review_required_excluded'] },
      reportReference: 'report-1'
    },
    limitations: ['review_required_excluded'],
    proposedActionIds: [],
    feedback: null,
    createdAt: 2
  };
}

function serviceWithOwners(owners: Record<string, unknown>, sourceVersionProvider = jest.fn(async () => [{ id: 'budget-1', version: 2 }])) {
  return createMockAssistantService({
    now: () => 1,
    owners,
    sourceVersionProvider,
    contextProvider: jest.fn(async () => ({
      dataAsOf: 1,
      period: 'monthly:2026-01-01',
      snapshot: {
        sources: [{ kind: 'budget', id: 'budget-1', version: 2 }],
        values: [{ key: 'assistant.context.budget.remaining', minor: 15000, currency: 'SAR', status: 'available' }],
        completeness: { confirmed: 1, reviewRequired: 0, conflicts: 0, reasons: [] },
        reportReference: 'report-1'
      }
    }))
  });
}
