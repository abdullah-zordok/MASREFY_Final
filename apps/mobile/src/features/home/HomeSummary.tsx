import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import { borderWidth, elevation, minTouchTarget, radius, spacing } from '@/design-system/tokens';
import type { Account, Category, HomeSummary as HomeSummaryValue, Transaction } from '@/domain/core-finance';
import { TransactionCard } from '@/features/transactions/TransactionCard';
import { useVoiceCapture } from '@/features/voice/useVoiceCapture';
import { VoiceReviewGroup } from '@/features/voice/VoiceReviewGroup';
import { translate, translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { useTheme } from '@/state/theme-context';
import { useVoiceCaptureStore } from '@/state/voice-capture';
import { formatFinancialDisplayValue } from '@/utils/format-financial-value';
import { AccountScopeSheet } from '@/features/accounts/AccountScopeSheet';

export function HomeSummary({ accounts, categories, notice, selectedAccount = null, summary }: {
  accounts?: Account[];
  categories?: Category[];
  notice?: React.ReactNode;
  selectedAccount?: Account | null;
  summary: HomeSummaryValue;
}) {
  const { revealed, reveal } = useSensitiveVisibility();
  const [accountsSheetVisible, setAccountsSheetVisible] = useState(false);
  const hidden = !revealed;
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const reducedMotion = usePreferenceStore((state) => state.reducedMotion);
  const theme = useTheme();
  const voice = useVoiceCapture({ permissionSync: 'on-demand' });
  const voiceStartPending = useRef(false);
  const largeText = PixelRatio.getFontScale() >= 1.5;
  const scoped = Boolean(selectedAccount);
  const accountComponent = selectedAccount
    ? summary.components.find(
        (component) => component.accountId === selectedAccount.id
      )
    : undefined;
  const heroLabelKey = scoped ? 'coreFinance.home.balance' : 'coreFinance.home.total';
  const heroValueMinor = scoped
    ? accountComponent?.convertedMinor
    : summary.totalBalanceMinor;
  const total = formatFinancialDisplayValue({
    minorUnits: heroValueMinor,
    currencyCode: summary.currencyCode,
    locale,
    sign: heroValueMinor !== undefined && heroValueMinor < 0 ? 'negative' : 'none',
    state: hidden
      ? 'hidden'
      : heroValueMinor === undefined
        ? 'unknown'
        : summary.isEstimated
          ? 'estimated'
          : 'confirmed'
  });
  const accountBalance = accountComponent
    ? formatFinancialDisplayValue({
        minorUnits: accountComponent.convertedMinor,
        currencyCode: summary.currencyCode,
        locale,
        sign: accountComponent.convertedMinor < 0 ? 'negative' : 'none',
        state: hidden
          ? 'hidden'
          : summary.isEstimated
            ? 'estimated'
            : 'confirmed'
      })
    : null;
  const expenses = summary.recentTransactions.filter(({ type }) => type === 'expense').slice(0, 2);
  const income = summary.recentTransactions.filter(({ type }) => type === 'income').slice(0, 2);
  const voiceRecording = voice.session.state === 'recording';
  const voiceProcessing = ['stopping', 'transcribing', 'analyzing', 'saving'].includes(voice.session.state);
  const unclearAudio =
    voice.session.state === 'failed' && isUnclearAudioError(voice.session.errorCode);
  const voiceError =
    voice.session.state === 'failed' &&
    !unclearAudio &&
    voice.session.errorCode !== 'save_failed'
      ? voice.session.errorCode
      : null;
  const voiceElapsed = formatVoiceDuration(voice.session.durationMs);

  const startVoice = async () => {
    if (voiceStartPending.current) return;
    voiceStartPending.current = true;
    try {
      if (voice.session.permission !== 'granted') await voice.requestPermission();
      if (useVoiceCaptureStore.getState().permission === 'granted') await voice.start();
    } finally {
      voiceStartPending.current = false;
    }
  };

  const stopVoice = () => {
    void voice.stop();
  };

  const recoverVoice = () => {
    if (voiceError === 'permission_permanent') return void voice.openSettings();
    if (voiceError === 'permission_denied') return void voice.requestPermission();
    void voice.reRecord();
  };

  return (
    <View testID="home-horizon" style={styles.root}>
      <View style={styles.hero}>
        <View accessible={false} style={[styles.orbit, { borderColor: theme.colors.accent }]} />
        <View accessible={false} style={[styles.orbit, styles.orbitInner, { borderColor: theme.colors.accent }]} />
        <Pressable
          accessibilityHint={hidden ? translate('coreFinance.home.reveal') : undefined}
          accessibilityLabel={hidden ? translate('designSystem.privacy.hidden') : `${translate(heroLabelKey)} ${total.accessibilityLabel}`}
          accessibilityRole={hidden ? 'button' : undefined}
          disabled={!hidden}
          onPress={reveal}
          style={styles.balance}
        >
          <Text style={[styles.balanceLabel, { color: theme.colors.content.onFinancialHero, writingDirection: direction }]}>
            {translate(heroLabelKey)}
          </Text>
          <Text
            adjustsFontSizeToFit={!largeText}
            minimumFontScale={0.68}
            numberOfLines={largeText ? 2 : 1}
            style={[styles.balanceValue, { color: theme.colors.content.onFinancialHero }]}
          >
            {total.text.replace(/[\u2066\u2069]/g, '')}
          </Text>
          <Text style={[styles.balanceSupport, { color: theme.colors.content.onFinancialHero, writingDirection: direction }]}>
            {summary.isEstimated ? translate('coreFinance.home.estimated') : translate('coreFinance.home.recorded')}
          </Text>
        </Pressable>

        <Pressable
          testID="home-account-card"
          accessibilityLabel={
            scoped
              ? `${selectedAccount!.name}, ${translate(`coreFinance.accountType.${selectedAccount!.type}` as never)}${accountBalance ? `, ${accountBalance.accessibilityLabel}` : ''}`
              : `${translate('coreFinance.home.allAccounts')} ${total.accessibilityLabel}`
          }
          accessibilityRole="button"
          onPress={() => setAccountsSheetVisible(true)}
          style={({ pressed }) => [
            styles.accountCard,
            {
              backgroundColor: pressed ? theme.colors.horizon.glassStrong : theme.colors.horizon.glass,
              borderColor: theme.colors.horizon.glassBorder,
              flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
            }
          ]}
        >
          <View style={[styles.accountCardText, { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }]}>
            <Text testID="home-account-card-title" style={[styles.accountCardTitle, { color: theme.colors.content.onFinancialHero, writingDirection: direction }]}>
              {scoped ? selectedAccount!.name : translate('coreFinance.home.allAccounts')}
            </Text>
            <Text testID="home-account-card-subtitle" style={[styles.accountCardCount, { color: theme.colors.content.onFinancialHero, writingDirection: direction }]}>
              {scoped
                ? translate(`coreFinance.accountType.${selectedAccount!.type}` as never)
                : translateDynamic('coreFinance.home.accountCount', { count: summary.activeAccountCount }, locale)}
            </Text>
          </View>
          <View
            testID="home-account-card-values"
            style={[styles.accountCardValues, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}
          >
            {scoped ? (
              accountBalance ? (
                <Text style={[styles.accountCardBalance, { color: theme.colors.content.onFinancialHero }]}>
                  {accountBalance.text.replace(/[\u2066\u2069]/g, '')}
                </Text>
              ) : null
            ) : (
              <Text style={[styles.accountCardBalance, { color: theme.colors.content.onFinancialHero }]}>
                {total.text.replace(/[\u2066\u2069]/g, '')}
              </Text>
            )}
            <DesignIcon
              testID="home-account-card-chevron"
              name="chevronDown"
              label={translate('coreFinance.home.accountScope.title')}
              color={theme.colors.content.onFinancialHero}
              decorative
            />
          </View>
        </Pressable>

        <View testID="home-action-tray" style={[styles.actionTray, { backgroundColor: theme.colors.horizon.glass, borderColor: theme.colors.horizon.glassBorder }]}>
          <View
            testID="home-quick-actions"
            style={[
              styles.quickActions,
              {
                flexDirection: largeText
                  ? direction === 'rtl' ? 'column-reverse' : 'column'
                  : direction === 'rtl' ? 'row-reverse' : 'row'
              }
            ]}
          >
            <QuickAction testID="home-quick-action-add" icon="add" label={translate('appShell.navigation.add')} onPress={() => router.push('/(tabs)/add')} stacked={largeText} />
            <QuickAction
              testID={voiceRecording ? 'home-inline-voice-recording' : 'home-quick-action-voice'}
              icon={voiceRecording ? 'stop' : 'voice'}
              label={voiceRecording ? voiceElapsed : translate('voice.mode.voice')}
              accessibilityLabel={voiceRecording ? `${translate('voice.record.active')}. ${translate('voice.record.stop')}, ${voiceElapsed}` : translate('voice.mode.voice')}
              active={voiceRecording}
              onPress={voiceRecording ? stopVoice : () => void startVoice()}
              stacked={largeText}
              reducedMotion={reducedMotion}
            />
            <QuickAction
              testID="home-quick-action-reports"
              icon="reports"
              label={translate('appShell.navigation.reports')}
              onPress={() => router.push({ pathname: '/(tabs)/reports', params: { returnTo: '/(tabs)/home' } })}
              stacked={largeText}
            />
            <QuickAction testID="home-quick-action-accounts" icon="more" label={translate('appShell.navigation.accounts')} onPress={() => setAccountsSheetVisible(true)} stacked={largeText} />
          </View>
        </View>
        {voiceProcessing ? (
          <View
            accessibilityLabel={translate('voice.state.processing')}
            accessibilityLiveRegion="polite"
            testID="home-voice-processing-inline"
            style={[
              styles.processingInline,
              {
                backgroundColor: theme.colors.horizon.glass,
                borderColor: theme.colors.horizon.glassBorder,
                flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
              }
            ]}
          >
            <View style={[styles.processingIcon, { backgroundColor: theme.colors.surfaces.brandSubtle }]}>
              <DesignIcon
                color={theme.colors.financial.income}
                decorative
                label=""
                name="receipt"
                size="lg"
                testID="home-voice-processing-icon"
              />
            </View>
            <Text
              style={[
                styles.processingMessage,
                {
                  color: theme.colors.content.onFinancialHero,
                  writingDirection: direction
                }
              ]}
            >
              {translate('voice.state.processing')}
            </Text>
            <ActivityIndicator
              color={theme.colors.content.onFinancialHero}
              testID="home-voice-processing-indicator"
            />
          </View>
        ) : null}
      </View>

      <View testID="home-activity-sheet" style={[styles.activity, { backgroundColor: theme.colors.surfaces.page }]}>
        {voiceError ? (
          <SurfaceCard
            testID="home-voice-error-card"
            style={[
              styles.voiceError,
              {
                backgroundColor: theme.colors.surfaces.card,
                borderColor: theme.colors.horizon.sheetBorder
              }
            ]}
          >
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[
                styles.unclearMessage,
                { color: theme.colors.content.primary, writingDirection: direction }
              ]}
            >
              {translate(`voice.error.${voiceError}` as never)}
            </Text>
            <View style={styles.unclearActions}>
              <ActionButton
                label={
                  voiceError === 'permission_permanent'
                    ? 'voice.permission.settings'
                    : 'voice.action.retry'
                }
                onPress={recoverVoice}
                testID="home-voice-error-action"
              />
              <ActionButton
                label="voice.action.cancel"
                onPress={() => void voice.cancel()}
                testID="home-voice-error-cancel"
                variant="secondary"
              />
            </View>
          </SurfaceCard>
        ) : null}
        {(voice.session.state === 'proposal_review' || voice.session.errorCode === 'save_failed') && voice.session.group ? (
          <View testID="home-voice-review" style={styles.voiceReview}>
            <Text
              accessibilityRole="header"
              style={[
                styles.sectionTitle,
                {
                  color: theme.colors.content.primary,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translate('voice.review.title')}
            </Text>
            <VoiceReviewGroup
              accounts={accounts ?? []}
              categories={categories ?? []}
              group={voice.session.group}
              onChange={voice.updateProposal}
              onConfirmField={voice.confirmField}
              onRemove={voice.removeProposal}
              onReRecord={() => void voice.reRecord()}
              onSave={() => void voice.save()}
              onSaveAll={() => void voice.save(true)}
            />
          </View>
        ) : null}
        {notice}
        {expenses.length ? <ActivitySection accounts={accounts} hidden={hidden} largeText={largeText} testID="home-expense-section" title={translate('coreFinance.home.recentExpenses')} transactions={expenses} /> : null}
        {income.length ? <ActivitySection accounts={accounts} hidden={hidden} largeText={largeText} testID="home-income-section" title={translate('coreFinance.home.recentIncome')} transactions={income} /> : null}
        {!expenses.length && !income.length ? <Text style={[styles.empty, { color: theme.colors.content.secondary }]}>{scoped ? translate('coreFinance.home.accountEmpty') : translate('coreFinance.ledger.empty')}</Text> : null}
      </View>

      <AccountScopeSheet visible={accountsSheetVisible} onDismiss={() => setAccountsSheetVisible(false)} />
      <Modal
        animationType={reducedMotion ? 'none' : 'fade'}
        onRequestClose={() => void voice.cancel()}
        transparent
        visible={unclearAudio}
      >
        <View
          accessibilityViewIsModal
          testID="home-voice-unclear-overlay"
          style={[styles.processingOverlay, { backgroundColor: theme.colors.horizon.scrim }]}
        >
          <SurfaceCard
            testID="home-voice-unclear-card"
            style={[
              styles.unclearCard,
              {
                backgroundColor: theme.colors.surfaces.card,
                borderColor: theme.colors.horizon.sheetBorder
              }
            ]}
          >
            <View style={[styles.processingIcon, { backgroundColor: theme.colors.surfaces.brandSubtle }]}>
              <DesignIcon
                color={theme.colors.content.link}
                decorative
                label=""
                name="voice"
                size="lg"
                testID="home-voice-unclear-icon"
              />
            </View>
            <Text accessibilityRole="header" style={[styles.unclearTitle, { color: theme.colors.content.primary, writingDirection: direction }]}>
              {translate('voice.unclear.title')}
            </Text>
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={[styles.unclearMessage, { color: theme.colors.content.secondary, writingDirection: direction }]}
            >
              {translate('voice.unclear.message')}
            </Text>
            <View style={styles.unclearActions}>
              <ActionButton
                label="voice.unclear.retry"
                onPress={() => void voice.reRecord()}
                style={styles.unclearAction}
                testID="home-voice-unclear-retry"
              />
              <ActionButton
                label="voice.action.cancel"
                onPress={() => void voice.cancel()}
                style={styles.unclearAction}
                testID="home-voice-unclear-cancel"
                variant="secondary"
              />
            </View>
          </SurfaceCard>
        </View>
      </Modal>
    </View>
  );
}

function QuickAction({ label, accessibilityLabel = label, active = false, icon, onPress, reducedMotion = false, stacked, testID }: {
  accessibilityLabel?: string;
  active?: boolean;
  icon: DesignIconName;
  label: string;
  onPress: () => void;
  reducedMotion?: boolean;
  stacked: boolean;
  testID: string;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        stacked && styles.quickActionStacked,
        {
          backgroundColor: pressed ? theme.colors.horizon.glassStrong : 'transparent',
          flexDirection: stacked ? direction === 'rtl' ? 'row-reverse' : 'row' : 'column'
        }
      ]}
    >
      <View style={styles.quickActionIconFrame}>
        {active ? (
          <RecordingIndicator
            color={theme.colors.content.onFinancialHero}
            reducedMotion={reducedMotion}
          />
        ) : null}
        <View style={[
          styles.quickActionIcon,
          active && styles.quickActionIconActive,
          {
            backgroundColor: `${theme.colors.content.onFinancialHero}${active ? '2E' : '18'}`,
            borderColor: theme.colors.content.onFinancialHero
          }
        ]}>
          <DesignIcon name={icon} label={accessibilityLabel} color={theme.colors.content.onFinancialHero} decorative />
        </View>
      </View>
      <Text numberOfLines={stacked ? undefined : 1} style={[styles.quickActionLabel, { color: theme.colors.content.onFinancialHero, writingDirection: direction }]}>{label}</Text>
    </Pressable>
  );
}

function RecordingIndicator({ color, reducedMotion }: { color: string; reducedMotion: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: 900,
          easing: Easing.out(Easing.ease),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(progress, {
          duration: 900,
          easing: Easing.in(Easing.ease),
          toValue: 0,
          useNativeDriver: true
        })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  if (reducedMotion) {
    return (
      <View
        accessible={false}
        pointerEvents="none"
        testID="home-voice-recording-static-ring"
        style={[styles.recordingRing, { borderColor: color, opacity: 0.55 }]}
      />
    );
  }

  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      testID="home-voice-recording-pulse"
      style={[
        styles.recordingRing,
        {
          borderColor: color,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] }) }]
        }
      ]}
    />
  );
}

function isUnclearAudioError(errorCode: string | null) {
  return errorCode === 'no_speech' || errorCode === 'background_noise';
}

function formatVoiceDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ActivitySection({ accounts, hidden, largeText, testID, title, transactions }: {
  accounts?: Account[];
  hidden: boolean;
  largeText: boolean;
  testID: 'home-expense-section' | 'home-income-section';
  title: string;
  transactions: Transaction[];
}) {
  return (
    <View testID={testID} style={styles.section}>
      <SectionHeading testID={`${testID}-heading`} title={title} />
      <View
        testID={`home-transaction-list-${testID === 'home-expense-section' ? 'expense' : 'income'}`}
        style={styles.transactionList}
      >
        {transactions.map((transaction) => (
          <TransactionCard
            key={transaction.id}
            accountName={accounts?.find(({ id }) => id === transaction.accountId)?.name}
            hidden={hidden}
            largeText={largeText}
            testIDPrefix="home"
            transaction={transaction}
          />
        ))}
      </View>
    </View>
  );
}

function SectionHeading({ testID, title }: { testID: string; title: string }) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const action = translate('coreFinance.home.viewAll');
  return (
    <View testID={testID} style={[styles.sectionHeading, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
      <Text style={[styles.sectionTitle, { color: theme.colors.content.primary, textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction }]}>{title}</Text>
      <Pressable accessibilityLabel={action} accessibilityRole="button" onPress={() => router.push('/(tabs)/transactions')} style={styles.sectionAction}>
        <Text style={[styles.sectionActionText, { color: theme.colors.content.link, writingDirection: direction }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.lg, overflow: 'hidden', paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  orbit: { borderRadius: 140, borderWidth: StyleSheet.hairlineWidth, height: 280, opacity: 0.18, position: 'absolute', right: -110, top: -70, width: 280 },
  orbitInner: { borderRadius: 96, height: 192, opacity: 0.12, right: -36, top: -16, width: 192 },
  balance: { alignItems: 'center', gap: spacing.sm, width: '100%' },
  balanceLabel: { fontSize: 15, lineHeight: 22, opacity: 0.78 },
  balanceValue: { fontSize: 35.2, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -1, lineHeight: 43.2, textAlign: 'center', writingDirection: 'ltr' },
  balanceSupport: { fontSize: 14, lineHeight: 20, opacity: 0.82, textAlign: 'center' },
  accountCard: { alignItems: 'center', borderRadius: radius.lg, borderWidth: borderWidth.default, ...layoutDirectionStyle('ltr'), gap: spacing.md, justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: '100%', writingDirection: 'ltr' },
  accountCardText: { flex: 1, gap: 1, minWidth: 0 },
  accountCardValues: { alignItems: 'center', flexShrink: 1, gap: spacing.xs, justifyContent: 'center' },
  accountCardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  accountCardCount: { fontSize: 11, lineHeight: 15, opacity: 0.76 },
  accountCardBalance: { flexShrink: 1, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '800', lineHeight: 20, textAlign: 'left', writingDirection: 'ltr' },
  actionTray: { alignSelf: 'stretch', borderRadius: radius.actionTray, borderWidth: borderWidth.default, overflow: 'hidden', padding: spacing.xs },
  quickActions: { alignSelf: 'stretch', ...layoutDirectionStyle('ltr'), gap: spacing.sm, writingDirection: 'ltr' },
  quickAction: { alignItems: 'center', borderRadius: radius.lg, flex: 1, gap: spacing.sm, justifyContent: 'center', minHeight: 48, minWidth: 48, padding: spacing.sm },
  quickActionStacked: { flex: 0, justifyContent: 'flex-start', width: '100%' },
  quickActionIconFrame: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  quickActionIcon: { alignItems: 'center', borderRadius: radius.pill, height: 42, justifyContent: 'center', width: 42 },
  quickActionIconActive: { borderWidth: 2 },
  recordingRing: { borderRadius: radius.pill, borderWidth: 2, height: 50, position: 'absolute', width: 50 },
  quickActionLabel: { fontSize: 12, fontWeight: '600', lineHeight: 17, textAlign: 'center' },
  activity: { borderTopLeftRadius: radius.bottomSheet, borderTopRightRadius: radius.bottomSheet, flexGrow: 1, gap: spacing.xl, minHeight: 360, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  section: { gap: spacing.md },
  voiceReview: { gap: spacing.md },
  voiceError: { alignItems: 'center', borderRadius: radius.overlay, gap: spacing.md, padding: spacing.xl },
  sectionHeading: { alignItems: 'center', ...layoutDirectionStyle('ltr'), justifyContent: 'space-between', writingDirection: 'ltr' },
  sectionTitle: { fontSize: 20, fontWeight: '800', lineHeight: 28 },
  sectionAction: { justifyContent: 'center', minHeight: minTouchTarget },
  sectionActionText: { fontSize: 12, fontWeight: '700' },
  empty: { padding: spacing.xl, textAlign: 'center' },
  transactionList: { gap: spacing.sm },
  processingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, zIndex: 10 },
  processingInline: { alignItems: 'center', alignSelf: 'stretch', borderRadius: radius.lg, borderWidth: borderWidth.default, ...layoutDirectionStyle('ltr'), gap: spacing.md, padding: spacing.md },
  processingIcon: { alignItems: 'center', borderRadius: radius.pill, height: 56, justifyContent: 'center', width: 56 },
  processingMessage: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  unclearCard: { ...elevation.raised, alignItems: 'center', borderRadius: radius.overlay, gap: spacing.md, maxWidth: 340, padding: spacing.xl, width: '100%' },
  unclearTitle: { fontSize: 20, fontWeight: '800', lineHeight: 28, textAlign: 'center' },
  unclearMessage: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  unclearActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  unclearAction: { alignSelf: 'stretch' }
});
