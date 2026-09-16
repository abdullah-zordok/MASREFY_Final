import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { changeLocale, translate, translateDynamic as t } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { AssistantActionPreviewScreen } from './AssistantActionPreviewScreen';

const mockAssistantQueries = {
  useAssistantActionPreview: jest.fn(),
  useUpdateAssistantActionPreview: jest.fn(),
  useConfirmAssistantAction: jest.fn(),
  useCancelAssistantAction: jest.fn()
};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('./assistant-queries', () => mockAssistantQueries);

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('en');
  mockAssistantQueries.useAssistantActionPreview.mockReturnValue({ data: preview(), isLoading: false, isError: false });
  mockAssistantQueries.useUpdateAssistantActionPreview.mockReturnValue({ mutate: jest.fn(), isPending: false });
  mockAssistantQueries.useConfirmAssistantAction.mockReturnValue({ mutate: jest.fn(), isPending: false });
  mockAssistantQueries.useCancelAssistantAction.mockReturnValue({ mutate: jest.fn(), isPending: false });
});

test('discloses destination and values but hides unsupported preview editing', () => {
  const update = jest.fn();
  const cancel = jest.fn();
  mockAssistantQueries.useUpdateAssistantActionPreview.mockReturnValue({ mutate: update, isPending: false });
  mockAssistantQueries.useCancelAssistantAction.mockReturnValue({ mutate: cancel, isPending: false });

  renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId="preview-1" />);

  expect(screen.getByText(t('assistant.actionPreview.destination.goal'))).toBeTruthy();
  expect(screen.getByLabelText(/Savings goal.*300.00 SAR/)).toBeTruthy();
  expect(screen.getByText(t('assistant.actionPreview.value.amount'))).toBeTruthy();
  expect(screen.getByText('300.00 SAR')).toBeTruthy();

  expect(screen.queryByLabelText(t('assistant.actionPreview.input.amount'))).toBeNull();
  expect(screen.queryByText(t('assistant.actionPreview.action.saveEdit'))).toBeNull();
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.cancel')));
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.back')));

  expect(update).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'preview-1', expectedVersion: 1 }));
  expect(router.back).toHaveBeenCalled();
});

test('requires confirmation dialog before mutating and routes to the safe success destination', () => {
  const confirm = jest.fn((_input, options) => options?.onSuccess?.({ value: { ...preview(), status: 'succeeded', resultReference: 'goal-1' } }));
  mockAssistantQueries.useConfirmAssistantAction.mockReturnValue({ mutate: confirm, isPending: true });

  renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId="preview-1" />);

  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirm')));
  fireEvent.press(screen.getByText(translate('coreFinance.cancel')));
  expect(confirm).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirm')));
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirmNow')));

  expect(screen.getByText(t('assistant.actionPreview.state.pending'))).toBeTruthy();
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith('/savings/goal-1');
});

test('allows retry after failed confirmation while still blocking duplicate in-flight taps', () => {
  const confirm = jest
    .fn()
    .mockImplementationOnce((_input, options) => options?.onError?.({ code: 'offline' }))
    .mockImplementationOnce((_input, options) => options?.onSuccess?.({ value: { ...preview(), status: 'succeeded', resultReference: 'goal-1' } }));
  mockAssistantQueries.useConfirmAssistantAction.mockReturnValue({ mutate: confirm, isPending: false });

  renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId="preview-1" />);

  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirm')));
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirmNow')));
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirmNow')));

  expect(confirm).toHaveBeenCalledTimes(2);
  expect(router.push).toHaveBeenCalledWith('/savings/goal-1');
});

test('routes navigation previews to typed non-goal destinations', () => {
  const update = jest.fn();
  const confirm = jest.fn((_input, options) => options?.onSuccess?.({
    value: { ...preview(), kind: 'show_subscriptions', input: {}, affectedDestination: { kind: 'subscriptions' }, expiresAt: null, status: 'succeeded', resultReference: 'subscriptions' }
  }));
  mockAssistantQueries.useUpdateAssistantActionPreview.mockReturnValue({ mutate: update, isPending: false });
  mockAssistantQueries.useAssistantActionPreview.mockReturnValue({
    data: { ...preview(), kind: 'show_subscriptions', input: {}, affectedDestination: { kind: 'subscriptions' }, expiresAt: null },
    isLoading: false,
    isError: false
  });
  mockAssistantQueries.useConfirmAssistantAction.mockReturnValue({ mutate: confirm, isPending: false });

  renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId="preview-1" />);

  expect(screen.getByText(t('assistant.actionPreview.destination.subscriptions'))).toBeTruthy();
  expect(screen.queryByText(t('assistant.actionPreview.value.amount'))).toBeNull();
  expect(screen.queryByText('0.00 SAR')).toBeNull();
  expect(screen.queryByText(t('assistant.actionPreview.action.saveEdit'))).toBeNull();

  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirm')));
  fireEvent.press(screen.getByText(t('assistant.actionPreview.action.confirmNow')));

  expect(update).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith('/subscriptions');
});

test('shows stale, expired, safe failure, and offline states without confirmation', () => {
  for (const [status, label] of [
    ['stale', 'assistant.actionPreview.state.stale'],
    ['expired', 'assistant.actionPreview.state.expired'],
    ['failed', 'assistant.actionPreview.failure.reviewRequired']
  ] as const) {
    mockAssistantQueries.useAssistantActionPreview.mockReturnValue({ data: { ...preview(), status, safeFailure: status === 'failed' ? 'review_required' : null }, isLoading: false, isError: false });
    const rendered = renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId={`preview-${status}`} />);
    expect(screen.getByText(t(label))).toBeTruthy();
    expect(screen.queryByText(t('assistant.actionPreview.action.confirm'))).toBeNull();
    rendered.unmount();
  }

  mockAssistantQueries.useAssistantActionPreview.mockReturnValue({ data: null, isLoading: false, isError: true, error: { code: 'offline' } });
  renderWithProviders(<AssistantActionPreviewScreen conversationId="conversation-1" previewId="preview-offline" />);
  expect(screen.getByText(t('assistant.actionPreview.state.offline'))).toBeTruthy();
});

function preview({
  currency = 'SAR',
  amountMinor = 30_000
}: {
  currency?: string;
  amountMinor?: number;
} = {}) {
  return {
    id: 'preview-1',
    responseId: 'response-1',
    kind: 'create_goal',
    input: { amountMinor, currency },
    affectedDestination: { kind: 'goal', goalId: 'draft-goal' },
    sourceVersions: [{ id: 'budget-1', version: 2 }],
    status: 'ready',
    operationId: null,
    expiresAt: Date.UTC(2026, 0, 15, 12, 10),
    resultReference: null,
    safeFailure: null,
    version: 1
  };
}
