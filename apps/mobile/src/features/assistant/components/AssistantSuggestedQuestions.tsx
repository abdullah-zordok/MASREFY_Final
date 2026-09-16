import React from 'react';
import { PixelRatio, View, Pressable, StyleSheet, Text } from 'react-native';
import { BarChartIcon, PieChartIcon, CalendarIcon, WalletIcon } from './AssistantIcons';
import { StyledText } from '@/components/StyledText';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import type { AssistantQuestionIntent } from '@/services/contracts/assistant-notifications-service';

export interface AssistantSuggestedQuestionsProps {
  onSelectQuestion: (question: string, intent: AssistantQuestionIntent) => void;
  disabled?: boolean;
}

export function AssistantSuggestedQuestions({
  onSelectQuestion,
  disabled = false
}: AssistantSuggestedQuestionsProps) {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';
  const largeText = PixelRatio.getFontScale() >= 1.5;

  const cards = [
    {
      id: 'spending',
      intent: 'spending_summary' as const,
      label: translate('assistant.suggestions.spending'),
      renderIcon: () => <BarChartIcon size={18} color={colorTokens.teal['700']} />,
      badgeBg: colorTokens.teal['50'],
      badgeBorder: colorTokens.teal['100']
    },
    {
      id: 'highest',
      intent: 'category_breakdown' as const,
      label: translate('assistant.suggestions.highest'),
      renderIcon: () => <PieChartIcon size={18} color={colorTokens.teal['700']} />,
      badgeBg: colorTokens.teal['50'],
      badgeBorder: colorTokens.teal['100']
    },
    {
      id: 'weekly',
      intent: 'recent_transactions' as const,
      label: translate('assistant.suggestions.weekly'),
      renderIcon: () => <CalendarIcon size={17} color={colorTokens.teal['700']} />,
      badgeBg: colorTokens.teal['50'],
      badgeBorder: colorTokens.teal['100']
    },
    {
      id: 'budget',
      intent: 'budget_status' as const,
      label: translate('assistant.suggestions.budget'),
      renderIcon: () => <WalletIcon size={17} color={colorTokens.teal['700']} />,
      badgeBg: colorTokens.teal['50'],
      badgeBorder: colorTokens.teal['100']
    }
  ];

  const renderCard = (item: (typeof cards)[0]) => (
    <Pressable
      key={item.id}
      testID={`suggestion-card-${item.id}`}
      onPress={() => !disabled && onSelectQuestion(item.label, item.intent)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {isRtl ? (
        <>
          <StyledText
            numberOfLines={largeText ? undefined : 2}
            style={[
              styles.questionText,
              styles.questionTextRtl
            ]}
          >
            {item.label}
          </StyledText>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: item.badgeBg, borderColor: item.badgeBorder }
            ]}
          >
            {item.renderIcon()}
          </View>
        </>
      ) : (
        <>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: item.badgeBg, borderColor: item.badgeBorder }
            ]}
          >
            {item.renderIcon()}
          </View>
          <StyledText
            numberOfLines={largeText ? undefined : 2}
            style={[
              styles.questionText,
              styles.questionTextLtr
            ]}
          >
            {item.label}
          </StyledText>
        </>
      )}
    </Pressable>
  );

  return (
    <View testID="assistant-suggested-questions" style={styles.container}>
      {/* Section header */}
      <View
        style={[
          styles.headerRow,
          { justifyContent: isRtl ? 'flex-end' : 'flex-start' }
        ]}
      >
        <View style={styles.headerContent}>
          {isRtl ? (
            <>
              <StyledText variant="subtitle" style={styles.headerTitle}>
                {translate('assistant.suggestions.header')}
              </StyledText>
              <Text style={styles.headerSparkle}>✨</Text>
            </>
          ) : (
            <>
              <Text style={styles.headerSparkle}>✨</Text>
              <StyledText variant="subtitle" style={styles.headerTitle}>
                {translate('assistant.suggestions.header')}
              </StyledText>
            </>
          )}
        </View>
      </View>

      {/* Row 1 */}
      <View style={styles.row}>
        {isRtl ? (
          <>
            {renderCard(cards[1])}
            {renderCard(cards[0])}
          </>
        ) : (
          <>
            {renderCard(cards[0])}
            {renderCard(cards[1])}
          </>
        )}
      </View>

      {/* Row 2 */}
      <View style={styles.row}>
        {isRtl ? (
          <>
            {renderCard(cards[3])}
            {renderCard(cards[2])}
          </>
        ) : (
          <>
            {renderCard(cards[2])}
            {renderCard(cards[3])}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 2
  },
  headerContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  headerTitle: {
    color: colorTokens.ink['900'],
    fontSize: 14,
    fontWeight: '700'
  },
  headerSparkle: {
    fontSize: 14
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  card: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['50'],
    borderColor: colorTokens.sand['400'],
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: colorTokens.teal['950'],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1
  },
  cardPressed: {
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['500']
  },
  questionText: {
    color: colorTokens.ink['900'],
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17
  },
  questionTextRtl: {
    textAlign: 'right',
    writingDirection: 'rtl'
  },
  questionTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr'
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34
  }
});
