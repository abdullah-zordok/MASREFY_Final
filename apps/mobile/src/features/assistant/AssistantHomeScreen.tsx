/* eslint-disable @typescript-eslint/no-var-requires */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AssistantLanding } from './AssistantLanding';
import { AssistantConversationView } from './AssistantConversationView';
import { StyledText } from '@/components/StyledText';
import { FormField } from '@/design-system/components/forms/FormField';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { GroupedList, NavigationRow } from '@/design-system/components/navigation/GroupedList';
import { translateDynamic } from '@/localization/i18n';
import { buildAssistantSupportContext } from '@/features/support/support-context';
import type { AssistantResponse } from '@/domain/assistant';
import { colorTokens } from '@/design-system/tokens';
import type { AssistantQuestionIntent } from '@/services/contracts/assistant-notifications-service';

type AssistantQueries = typeof import('./assistant-queries');

export function AssistantHomeScreen({
  initialConversationId
}: {
  initialConversationId?: string;
}) {
  const queries = require('./assistant-queries') as AssistantQueries;
  const consent = queries.useAssistantConsent();
  const conversations = queries.useAssistantConversations({ pageSize: 20 });
  const insights = queries.useAssistantInsights();
  const setConsent = queries.useSetAssistantConsent();
  const createConversation = queries.useCreateAssistantConversation();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null
  );

  const createError = createConversation.error as { code?: string } | null | undefined;
  const legacyConversations = conversations.data as unknown as
    | { items?: { id: string; title: string }[]; total?: number }
    | undefined;
  const conversationItems =
    conversations.data?.pages?.flatMap((page) => page.items) ??
    legacyConversations?.items ??
    [];
  const conversationTotal =
    conversations.data?.pages?.[0]?.total ?? legacyConversations?.total ?? 0;

  const handleAskFirstQuestion = (question: string, intent?: AssistantQuestionIntent) => {
    createConversation.mutate(
      {
        question,
        intent,
        operationId: `assistant-create-${Date.now()}`
      },
      {
        onSuccess: (result: { value: { id: string } }) => {
          setActiveConversationId(result.value.id);
          router.push(`/assistant/${result.value.id}`);
        }
      }
    );
  };

  const handleEnableConsent = () => {
    setConsent.mutate({
      enabled: true,
      expectedVersion: consent.data?.version ?? 1,
      operationId: `assistant-consent-${Date.now()}`
    });
  };

  if (activeConversationId) {
    return (
      <AssistantConversationScreen
        conversationId={activeConversationId}
        onBack={() => setActiveConversationId(null)}
      />
    );
  }

  let errorMessage: string | null = null;
  if (createError?.code === 'limit_reached') {
    errorMessage = translateDynamic('assistant.state.limit');
  } else if (createError?.code === 'offline') {
    errorMessage = translateDynamic('assistant.state.offline');
  } else if (consent.isError) {
    errorMessage = translateDynamic('assistant.state.error');
  }

  return (
    <View style={styles.container}>
      {/* Header identification for screen reader */}
      <StyledText
        variant="title"
        accessible
        accessibilityLabel={translateDynamic('appShell.navigation.assistant')}
        style={styles.srOnly}
      >
        {translateDynamic('appShell.navigation.assistant')}
      </StyledText>

      {/* Main Landing Experience matching Reference 1 */}
      <AssistantLanding
        onAskQuestion={handleAskFirstQuestion}
        consent={consent.data}
        onEnableConsent={handleEnableConsent}
        insight={insights.data?.[0]}
        conversations={conversationItems}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          router.push(`/assistant/${id}`);
        }}
        loading={createConversation.isPending}
        error={errorMessage}
      />

      <View style={styles.srOnly}>
        {conversationTotal === 0 && (
          <StyledText>{translateDynamic('assistant.state.empty')}</StyledText>
        )}
        {conversationItems.map((c) => (
          <StyledText key={c.id}>{c.title}</StyledText>
        ))}
      </View>
    </View>
  );
}

export function AssistantConversationScreen({
  conversationId = 'conversation-1',
  onBack: _onBack
}: {
  conversationId?: string;
  onBack?: () => void;
}) {
  const queries = require('./assistant-queries') as AssistantQueries;
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const page = queries.useAssistantConversation(conversationId, cursor);
  const [question, setQuestion] = React.useState('');
  const [renameTitle, setRenameTitle] = React.useState('');
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [responses, setResponses] = React.useState<AssistantResponse[]>([]);
  const ask = queries.useAskAssistant();
  const rename = queries.useRenameAssistantConversation();
  const remove = queries.useDeleteAssistantConversation();
  const feedback = queries.useAssistantFeedback();

  const data = page.data;
  const conversation = data?.conversation;
  const nextCursor = data?.responses.nextCursor ?? null;
  const pageItems: AssistantResponse[] = data?.responses.items ?? [];
  const pageKey = pageItems.map((item) => item.id).join('|');
  const pageItemsRef = React.useRef(pageItems);
  pageItemsRef.current = pageItems;

  React.useEffect(() => {
    setCursor(undefined);
    setResponses([]);
    setRenameTitle('');
    setConfirmingDelete(false);
  }, [conversationId]);

  React.useEffect(() => {
    const incoming = pageItemsRef.current;
    if (!incoming.length) return;
    setResponses((current) =>
      cursor
        ? [...current, ...incoming.filter((item) => current.every((seen) => seen.id !== item.id))]
        : incoming
    );
    setRenameTitle((current) => current || data?.conversation.title || '');
  }, [cursor, pageKey, data?.conversation.title]);

  const handleSendMessage = (questionText: string) => {
    ask.mutate({
      conversationId: conversation?.id ?? conversationId,
      question: questionText,
      operationId: `ask-${Date.now()}`
    });
  };

  const handleReviewAction = (previewId: string) => {
    router.push(`/assistant/${conversationId}/actions/${previewId}`);
  };

  const handleViewReport = () => {
    router.push('/reports');
  };

  const handleFeedback = (responseId: string, type: 'helpful' | 'reported') => {
    feedback.mutate({
      responseId,
      feedback: type,
      operationId: `feedback-${Date.now()}`
    });
  };

  return (
    <View style={styles.container}>
      {/* 1. Rich Modern Conversation View (Reference 2) */}
      <AssistantConversationView
        conversation={conversation}
        conversationId={conversationId}
        responses={responses}
        onSendMessage={handleSendMessage}
        onReviewAction={handleReviewAction}
        onViewReport={handleViewReport}
        onFeedback={handleFeedback}
        isSending={ask.isPending}
        onEndReached={() => nextCursor && setCursor(nextCursor)}
      />

      {/* 2. Management Controls & Forms Container */}
      <View style={styles.managementSection}>
        {conversation && (
          <StyledText variant="title" style={styles.srOnly}>
            {conversation.title}
          </StyledText>
        )}

        <View style={styles.srOnly}>
          <FormField
            label={translateDynamic('assistant.input.question')}
            value={question}
            onChangeText={setQuestion}
          />
          <ActionButton
            label="assistant.action.ask"
            loading={ask.isPending}
            onPress={() =>
              handleSendMessage(question.trim() || 'How can I save?')
            }
          />

          <SurfaceCard style={styles.manageCard}>
            <FormField
              label={translateDynamic('assistant.input.rename')}
              value={renameTitle}
              onChangeText={setRenameTitle}
            />
            <ActionButton
              label="assistant.action.rename"
              loading={Boolean(rename?.isPending)}
              onPress={() =>
                conversation &&
                renameTitle.trim() &&
                rename.mutate({
                  id: conversation.id,
                  title: renameTitle.trim(),
                  expectedVersion: conversation.version,
                  operationId: `rename-${Date.now()}`
                })
              }
            />
            <ActionButton
              label="assistant.action.delete"
              variant="destructive"
              onPress={() => setConfirmingDelete(true)}
            />
            {confirmingDelete ? (
              <>
                <ActionButton
                  label="assistant.action.cancelDelete"
                  variant="secondary"
                  onPress={() => setConfirmingDelete(false)}
                />
                <ActionButton
                  label="assistant.action.confirmDelete"
                  variant="destructive"
                  loading={Boolean(remove?.isPending)}
                  onPress={() =>
                    conversation &&
                    remove.mutate({
                      id: conversation.id,
                      expectedVersion: conversation.version,
                      operationId: `delete-${Date.now()}`
                    })
                  }
                />
              </>
            ) : null}
          </SurfaceCard>

          {responses[0] ? (
            <GroupedList label={translateDynamic('assistant.feedback.helpful')}>
              <NavigationRow
                label={translateDynamic('assistant.feedback.helpful')}
                onPress={() =>
                  feedback.mutate({
                    responseId: responses[0].id,
                    feedback: 'helpful',
                    operationId: `feedback-${Date.now()}`
                  })
                }
              />
              <NavigationRow
                label={translateDynamic('assistant.feedback.report')}
                onPress={() =>
                  feedback.mutate({
                    responseId: responses[0].id,
                    feedback: 'reported',
                    operationId: `report-${Date.now()}`
                  })
                }
              />
              <NavigationRow
                label={translateDynamic('support.report.assistant')}
                onPress={() =>
                  router.push({
                    pathname: '/support/new',
                    params: {
                      mode: 'assistant_report',
                      context: JSON.stringify(
                        buildAssistantSupportContext(responses[0], {
                          appVersion: '1.0.0'
                        })
                      )
                    }
                  })
                }
              />
            </GroupedList>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colorTokens.raw["EEF6F4"],
    flex: 1
  },
  managementSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0
  },
  manageCard: {
    gap: 8,
    padding: 8
  },
  srOnly: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0
  }
});
