import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { AssistantBotAvatar } from './AssistantBotAvatar';
import { FinancialInsightCard } from './FinancialInsightCard';
import { layoutDirectionStyle } from '@/design-system/direction';
import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { translate, translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { spacing } from '@/design-system/tokens';
import type { AssistantResponse } from '@/domain/assistant';
import { colorTokens } from '@/design-system/tokens';
import { isFixtureModeEnabled } from '@/config/demo-mode';

export interface AssistantMessageBubbleProps {
  response: AssistantResponse;
  conversationId?: string;
  onReviewAction?: (previewId: string) => void;
  onViewReport?: () => void;
  onFeedback?: (feedback: 'helpful' | 'reported') => void;
  timestamp?: string;
  testID?: string;
}

export function AssistantMessageBubble({
  response,
  conversationId: _conversationId,
  onReviewAction,
  onViewReport,
  onFeedback,
  timestamp,
  testID = 'assistant-message-bubble'
}: AssistantMessageBubbleProps) {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  // Check if snapshot contains financial values for structured card
  const snapshotValues = response.snapshot?.values ?? [];
  const incomeValue = snapshotValues.find((v) => v.key.includes('income'));
  const expenseValue = snapshotValues.find((v) => v.key.includes('expense') || v.key.includes('budget'));

  const hasFinancialData = Boolean(incomeValue || expenseValue || response.snapshot?.reportReference);

  return (
    <View
      testID={testID}
      style={[
        styles.row,
        {
          flexDirection: isRtl ? 'row-reverse' : 'row'
        }
      ]}
    >
      {/* Bot Avatar */}
      <AssistantBotAvatar
        size={34}
        testID="assistant-message-avatar"
        style={styles.avatar}
      />

      {/* Bubble Card */}
      <View
        style={[
          styles.bubble,
          isRtl ? styles.bubbleRtl : styles.bubbleLtr
        ]}
      >
        {/* Response Blocks */}
        {(response.blocks ?? []).map((block, index) => (
          <View
            key={block.key ?? `${response.id}-block-${index}`}
            style={styles.block}
          >
            {block.label && (
              <StyledText style={styles.blockLabel}>
                {translate(`assistant.label.${block.label}`)}
              </StyledText>
            )}
            <StyledText
              style={[
                styles.blockText,
                {
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translateDynamic(block.key, block.values)}
            </StyledText>
          </View>
        ))}

        {/* Embedded Financial Insight Card */}
        {isFixtureModeEnabled() && hasFinancialData && (
          <FinancialInsightCard
            title={response.period ? `ملخص الفترة` : 'ملخص الإنفاق'}
            totalMinor={expenseValue?.minor ?? 425000}
            totalCurrency={expenseValue?.currency ?? 'SAR'}
            categoryName="التسوق"
            categoryMinor={187000}
            trendPercentage={8}
            trendDirection="down"
            onPressDetails={onViewReport}
          />
        )}

        {/* Evidence Report Link */}
        {response.snapshot?.reportReference && onViewReport && (
          <ActionButton
            label={translate('assistant.evidence.report')}
            variant="secondary"
            onPress={onViewReport}
          />
        )}

        {/* Proposed Actions */}
        {(response.proposedActionIds ?? []).map((previewId) => (
          <ActionButton
            key={previewId}
            label={translate('assistant.proposal.review')}
            variant="primary"
            onPress={() => onReviewAction?.(previewId)}
          />
        ))}

        {/* Limitations Notice */}
        {(response.limitations ?? []).map((item) => (
          <StyledText key={item} style={styles.limitationText}>
            {item === 'review_required_excluded'
              ? translate('assistant.limitation.reviewExcluded')
              : item}
          </StyledText>
        ))}

        {/* Footer with Timestamp & Feedback */}
        <View
          style={[
            styles.footer,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          {timestamp && (
            <StyledText style={styles.timestamp}>{timestamp}</StyledText>
          )}

          {onFeedback && (
            <View
              style={[
                styles.feedbackRow,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <Pressable
                onPress={() => onFeedback('helpful')}
                style={styles.feedbackBtn}
                accessibilityLabel={translate('assistant.feedback.helpful')}
              >
                <Text style={styles.feedbackEmoji}>👍</Text>
              </Pressable>
              <Pressable
                onPress={() => onFeedback('reported')}
                style={styles.feedbackBtn}
                accessibilityLabel={translate('assistant.feedback.report')}
              >
                <Text style={styles.feedbackEmoji}>👎</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    ...layoutDirectionStyle('ltr'),
    gap: spacing.xs,
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    width: '100%'
  },
  avatar: {
    marginTop: 4
  },
  bubble: {
    backgroundColor: colorTokens.raw["FFFFFF"],
    borderColor: colorTokens.raw["D7E1DC"],
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colorTokens.raw["103F37"],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1
  },
  bubbleRtl: {
    borderTopLeftRadius: 4
  },
  bubbleLtr: {
    borderTopRightRadius: 4
  },
  block: {
    gap: 2
  },
  blockLabel: {
    color: colorTokens.raw["0D684A"],
    fontSize: 11,
    fontWeight: '700'
  },
  blockText: {
    color: colorTokens.raw["10231F"],
    fontSize: 14.5,
    lineHeight: 20
  },
  limitationText: {
    color: colorTokens.raw["657872"],
    fontSize: 11.5,
    fontStyle: 'italic'
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: 4
  },
  timestamp: {
    color: colorTokens.raw["7C8B85"],
    fontSize: 11
  },
  feedbackRow: {
    alignItems: 'center',
    gap: spacing.xs
  },
  feedbackBtn: {
    padding: 2
  },
  feedbackEmoji: {
    fontSize: 13
  }
});
