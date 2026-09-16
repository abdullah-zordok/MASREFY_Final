import React from 'react';
import {
  ScrollView,
  View,
  StyleSheet
} from 'react-native';
import { router } from 'expo-router';
import { AppBar } from '@/design-system/components/navigation/AppNavigation';
import { AssistantHero } from './components/AssistantHero';
import { AssistantAskCard } from './components/AssistantAskCard';
import { AssistantConsentCard } from './components/AssistantConsentCard';
import { AssistantSuggestedQuestions } from './components/AssistantSuggestedQuestions';
import { AssistantPrivacyFooter } from './components/AssistantPrivacyFooter';
import { StyledText } from '@/components/StyledText';
import { currentLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import type { AssistantConsent } from '@/domain/assistant';
import type { AssistantQuestionIntent } from '@/services/contracts/assistant-notifications-service';
import type { AssistantFinancialInsight } from '@/services/contracts/assistant-notifications-service';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { formatMinorAmount } from '@/utils/format-financial-value';

export interface AssistantLandingProps {
  onAskQuestion: (question: string, intent?: AssistantQuestionIntent) => void;
  consent?: AssistantConsent | null;
  onEnableConsent: () => void;
  insight?: AssistantFinancialInsight;
  conversations?: readonly { id: string; title: string }[];
  onSelectConversation?: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  onBack?: () => void;
}

export function AssistantLanding({
  onAskQuestion,
  consent,
  onEnableConsent,
  insight,
  loading = false,
  error = null,
  onBack
}: AssistantLandingProps) {
  const direction = usePreferenceStore((state) => state.direction);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  return (
    <View testID="assistant-landing" style={styles.root}>
      {/* 1. Header with back navigation and title */}
      <AppBar
        title={translate('assistant.hero.title')}
        onBack={handleBack}
        direction={direction}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main interactive content zone */}
        <View style={styles.mainZone}>
          {/* 2. Compact AI Identity */}
          <AssistantHero />

          {/* 3. Main Question Input Card */}
          <AssistantAskCard onAskQuestion={onAskQuestion} loading={loading} />

          {/* 4. Personalization Card */}
          <AssistantConsentCard
            consent={consent}
            onEnableConsent={onEnableConsent}
            loading={loading}
          />

          {/* Error message if any */}
          {error && (
            <View style={styles.errorContainer}>
              <StyledText style={styles.errorText}>{error}</StyledText>
            </View>
          )}

          {/* 5. Quick Suggestions 2x2 Grid */}
          <AssistantSuggestedQuestions
            onSelectQuestion={onAskQuestion}
            disabled={loading}
          />

          {insight ? (
            <SurfaceCard testID="assistant-proactive-insight" style={styles.insightCard}>
              <StyledText variant="title">{insight.budgetName}</StyledText>
              <StyledText>
                {formatMinorAmount(insight.spentMinor, insight.currency, currentLocale()).replace('\u00a0', ' ')}
              </StyledText>
            </SurfaceCard>
          ) : null}
        </View>

        {/* Bottom closing zone (anchored naturally to available height) */}
        <View style={styles.bottomZone}>
          {/* 6. Privacy Message Note */}
          <AssistantPrivacyFooter />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colorTokens.sand['100'],
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
    paddingTop: spacing.xs
  },
  mainZone: {
    gap: spacing.lg,
    width: '100%'
  },
  bottomZone: {
    paddingTop: spacing.lg,
    width: '100%'
  },
  errorContainer: {
    backgroundColor: colorTokens.financial.expenseSurface,
    borderColor: colorTokens.status.danger,
    borderRadius: radius.control,
    borderWidth: 1,
    marginHorizontal: spacing.md,
    padding: spacing.md
  },
  errorText: {
    color: colorTokens.status.danger,
    fontSize: 13,
    textAlign: 'center'
  },
  insightCard: {
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    padding: spacing.md
  }
});
