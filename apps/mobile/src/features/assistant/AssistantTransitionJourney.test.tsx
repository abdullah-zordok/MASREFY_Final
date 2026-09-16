import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils/render';
import { changeLocale } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

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

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ conversationId: 'conv-101' })
}));
jest.mock('./assistant-queries', () => mockAssistantQueries);

const { AssistantHomeScreen } = require('./AssistantHomeScreen') as {
  AssistantHomeScreen: React.ComponentType<any>;
};

describe('Assistant Transition & Chat Journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    changeLocale('ar');
    mockAssistantQueries.useAssistantInsights.mockReturnValue({ data: [] });
    usePreferenceStore.setState({ hideBalances: false });

    mockAssistantQueries.useAssistantConsent.mockReturnValue({
      data: {
        status: 'enabled',
        disclosedDataCategories: ['transactions', 'planning', 'reports'],
        consentedAt: 1000,
        disabledAt: null,
        version: 1
      },
      isLoading: false,
      isError: false
    });
    mockAssistantQueries.useSetAssistantConsent.mockReturnValue({ mutate: jest.fn() });
    mockAssistantQueries.useCreateAssistantConversation.mockReturnValue({
      mutate: jest.fn(),
      error: null
    });
    mockAssistantQueries.useAssistantConversations.mockReturnValue({
      data: { items: [], nextCursor: null, total: 0 },
      isLoading: false,
      isError: false
    });
    mockAssistantQueries.useAssistantConversation.mockReturnValue({
      data: {
        conversation: {
          id: 'conv-101',
          title: 'استفسار مالي',
          status: 'active',
          createdAt: 1,
          updatedAt: 2,
          lastResponseId: 'resp-101',
          version: 1
        },
        responses: {
          items: [
            {
              id: 'resp-101',
              conversationId: 'conv-101',
              question: 'كم أنفقت هذا الشهر؟',
              responseType: 'direct',
              blocks: [
                { label: 'fact', key: 'assistant.answer.direct', values: {} }
              ],
              period: 'monthly:2026-05-01',
              dataAsOf: 1,
              snapshot: {
                sources: [{ kind: 'report', id: 'report-1', version: 1 }],
                values: [
                  { key: 'assistant.context.report.expense', minor: 425000, currency: 'SAR', status: 'available' }
                ],
                completeness: { confirmed: 1, reviewRequired: 0, conflicts: 0, reasons: [] },
                reportReference: 'report-1'
              },
              limitations: [],
              proposedActionIds: [],
              feedback: null,
              createdAt: 1
            }
          ],
          nextCursor: null,
          total: 1
        }
      },
      isLoading: false,
      isError: false
    });
    mockAssistantQueries.useAskAssistant.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockAssistantQueries.useRenameAssistantConversation.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockAssistantQueries.useDeleteAssistantConversation.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it('transitions from landing to active chat when first question is asked', () => {
    let successCallback: ((res: { value: { id: string } }) => void) | undefined;
    const createConversationMock = jest.fn((_payload, options) => {
      successCallback = options?.onSuccess;
    });
    mockAssistantQueries.useCreateAssistantConversation.mockReturnValue({
      mutate: createConversationMock,
      error: null
    });

    renderWithProviders(<AssistantHomeScreen />);

    // Initially in Landing State (Reference 1)
    expect(screen.getByTestId('assistant-hero')).toBeTruthy();
    expect(screen.getByTestId('assistant-ask-card')).toBeTruthy();

    // User types question and submits
    fireEvent.changeText(
      screen.getByTestId('assistant-ask-input'),
      'كم أنفقت هذا الشهر؟'
    );
    fireEvent.press(screen.getByTestId('assistant-ask-submit-button'));

    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'كم أنفقت هذا الشهر؟' }),
      expect.anything()
    );

    // Simulate mutation success and verify seamless in-place transition
    act(() => {
      successCallback?.({ value: { id: 'conv-101' } });
    });

    // Now transitioned to Active Chat State (Reference 2)
    expect(screen.getByTestId('assistant-header-banner')).toBeTruthy();
    expect(screen.getByTestId('financial-insight-card')).toBeTruthy();
    expect(screen.getByTestId('assistant-composer')).toBeTruthy();
  });

  it('masks financial insight amounts when hideBalances is enabled', () => {
    usePreferenceStore.setState({ hideBalances: true });

    renderWithProviders(<AssistantHomeScreen initialConversationId="conv-101" />);

    expect(screen.getByTestId('financial-insight-card')).toBeTruthy();
    expect(screen.getAllByText(/•••• SAR/).length).toBeGreaterThanOrEqual(1);
  });
});
