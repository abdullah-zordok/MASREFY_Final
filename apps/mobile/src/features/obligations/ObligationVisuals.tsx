import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { StyledText } from '@/components/StyledText';
import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import { minTouchTarget, radius, spacing } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

const referenceGlass = 'rgba(255,255,255,0.16)';
const referenceGlassBorder = 'rgba(255,255,255,0.22)';

export function ObligationHeroHeader({
  title,
  eyebrow,
  amount,
  description,
  meta,
  onBack,
  onAction,
  children,
  accessibilityLabel,
  testID,
  variant = 'default'
}: {
  title: string;
  eyebrow?: string;
  amount?: string;
  description?: string;
  meta?: string;
  onBack?: () => void;
  onAction?: () => void;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  variant?: 'default' | 'overview';
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const textDirection = { writingDirection: direction } as const;
  const overview = variant === 'overview';

  return (
    <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={[styles.header, overview && styles.headerOverview]} testID={testID}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="obligationHeader" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={theme.colors.horizon.referenceStart} />
            <Stop offset="0.58" stopColor={theme.colors.horizon.referenceEnd} />
            <Stop offset="1" stopColor={overview ? theme.colors.horizon.referenceStart : theme.colors.horizon.referenceEnd} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#obligationHeader)" height="100%" width="100%" x="0" y="0" />
        <Circle cx={overview ? '7%' : -18} cy={overview ? '-20%' : -62} fill={theme.colors.horizon.glow} r={overview ? 170 : 190} />
        <Circle cx={overview ? '22%' : 118} cy={overview ? '82%' : 260} fill={referenceGlass} r={overview ? 92 : 92} />
      </Svg>
      <View style={[styles.headerTop, overview && styles.headerTopOverview]}>
        {onBack ? (
          <View style={styles.headerButtonStart}>
            <HeaderIconButton icon="back" label={translate('common.back')} onPress={onBack} />
          </View>
        ) : null}
        <StyledText
          variant="title"
          style={[
            styles.headerTitle,
            overview && styles.headerTitleOverview,
            { color: theme.colors.textInverse },
            textDirection
          ]}
        >
          {title}
        </StyledText>
        {onAction ? (
          <View style={styles.headerButtonEnd}>
            <HeaderIconButton icon="add" label={translate('planning.obligations.new')} onPress={onAction} variant={variant} />
          </View>
        ) : null}
      </View>
      <View style={[styles.heroRow, overview && styles.heroRowOverview]}>
        <View style={[styles.heroCopy, overview && styles.heroCopyOverview, direction === 'rtl' ? styles.heroCopyRtl : styles.heroCopyLtr]}>
          {eyebrow ? <StyledText style={[styles.eyebrow, overview && styles.eyebrowOverview, { color: theme.colors.textInverse }, textDirection]}>{eyebrow}</StyledText> : null}
          {amount ? (
            <StyledText
              adjustsFontSizeToFit
              minimumFontScale={overview ? 0.58 : 0.68}
              numberOfLines={1}
              variant="amount"
              style={[styles.heroAmount, overview && styles.heroAmountOverview, { color: theme.colors.textInverse }]}
            >
              {amount}
            </StyledText>
          ) : null}
          {description ? <StyledText numberOfLines={1} variant="subtitle" style={[styles.description, overview && styles.descriptionOverview, { color: theme.colors.textInverse }, textDirection]}>{description}</StyledText> : null}
          {meta ? <StyledText numberOfLines={1} style={[styles.meta, overview && styles.metaOverview, { color: theme.colors.textInverse }, textDirection]}>{meta}</StyledText> : null}
        </View>
      </View>
      {children ? <View style={[styles.headerChildren, overview && styles.headerChildrenOverview]}>{children}</View> : null}
    </View>
  );
}

export function ObligationMetricStrip({
  metrics,
  accessibilityLabel,
  testID,
  variant = 'default'
}: {
  metrics: { label: string; value: string; icon?: DesignIconName }[];
  accessibilityLabel?: string;
  testID?: string;
  variant?: 'default' | 'overview';
}) {
  const theme = useTheme();
  const overview = variant === 'overview';
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.metricStrip,
        overview && styles.metricStripOverview,
        { backgroundColor: overview ? 'rgba(255,255,255,0.20)' : referenceGlass, borderColor: referenceGlassBorder }
      ]}
      testID={testID}
    >
      {metrics.map((metric, index) => (
        <React.Fragment key={metric.label}>
          {index ? <View style={[styles.metricDivider, overview && styles.metricDividerOverview, { backgroundColor: referenceGlassBorder }]} /> : null}
          <View style={[styles.metric, overview && styles.metricOverview]}>
            {metric.icon ? <DesignIcon name={metric.icon} decorative color={theme.colors.textInverse} size={overview ? 'control' : 'sm'} /> : null}
            <StyledText adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} variant="subtitle" style={[styles.metricValue, overview && styles.metricValueOverview, { color: theme.colors.textInverse }]}>
              {metric.value}
            </StyledText>
            <StyledText adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.metricLabel, overview && styles.metricLabelOverview, { color: theme.colors.textInverse }]}>
              {metric.label}
            </StyledText>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export function ObligationSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  testID
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segments, { backgroundColor: theme.colors.surfaceMuted }]} testID={testID}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.colors.surface }]}
          >
            <StyledText style={[styles.segmentText, { color: selected ? theme.colors.primary : theme.colors.textSecondary }]}>
              {option.label}
            </StyledText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HeaderIconButton({ icon, label, onPress, variant = 'default' }: { icon: DesignIconName; label: string; onPress: () => void; variant?: 'default' | 'overview' }) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const overview = variant === 'overview';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.headerButton, overview && styles.headerButtonOverview, { backgroundColor: referenceGlass, borderColor: referenceGlassBorder }]}
    >
      <DesignIcon name={icon} decorative color={theme.colors.textInverse} direction={direction} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    gap: spacing.md,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    minHeight: 246,
    overflow: 'hidden',
    paddingBottom: spacing.lg + spacing.xs,
    paddingHorizontal: spacing.lg + spacing.xs,
    paddingTop: spacing.lg + spacing.xs
  },
  headerOverview: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: spacing.sm,
    minHeight: 292,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg + spacing.xs,
    paddingTop: spacing.md
  },
  headerTop: { justifyContent: 'center', minHeight: minTouchTarget },
  headerTopOverview: { minHeight: 46 },
  headerTitle: { fontSize: 24, lineHeight: 32, maxWidth: '78%', position: 'absolute', start: 0, top: 4 },
  headerTitleOverview: { fontSize: 24, lineHeight: 30, top: 6 },
  headerButtonStart: { position: 'absolute', start: 0, top: 0 },
  headerButtonEnd: { end: 0, position: 'absolute', top: 0 },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget
  },
  headerButtonOverview: { height: 42, width: 42 },
  heroRow: { alignItems: 'center', flexDirection: 'row' },
  heroRowOverview: { minHeight: 106 },
  heroCopy: { flex: 1, gap: spacing.xs / 2 },
  heroCopyOverview: { gap: 1, maxWidth: '76%' },
  heroCopyLtr: { alignItems: 'flex-start' },
  heroCopyRtl: { alignItems: 'flex-start' },
  eyebrow: { fontSize: 14, lineHeight: 20, opacity: 0.74 },
  eyebrowOverview: { fontSize: 15, lineHeight: 21, opacity: 0.72 },
  heroAmount: { fontSize: 32, lineHeight: 40 },
  heroAmountOverview: { fontSize: 34, lineHeight: 42 },
  description: { fontSize: 15, lineHeight: 20, opacity: 0.9 },
  descriptionOverview: { fontSize: 17, fontWeight: '700', lineHeight: 22, opacity: 0.96 },
  meta: { fontSize: 12, lineHeight: 18, opacity: 0.86 },
  metaOverview: { fontSize: 12, lineHeight: 18, opacity: 0.86 },
  headerChildren: { gap: spacing.sm },
  headerChildrenOverview: { marginTop: spacing.xs },
  metricStrip: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 78,
    overflow: 'hidden'
  },
  metricStripOverview: {
    borderRadius: 16,
    marginHorizontal: spacing.sm,
    minHeight: 82
  },
  metric: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', paddingHorizontal: spacing.xs },
  metricOverview: { gap: 2, paddingHorizontal: 6 },
  metricDivider: { width: 1 },
  metricDividerOverview: { marginVertical: 10 },
  metricValue: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  metricValueOverview: { fontSize: 14, lineHeight: 19 },
  metricLabel: { fontSize: 12, opacity: 0.78, textAlign: 'center' },
  metricLabelOverview: { fontSize: 12, lineHeight: 16, opacity: 0.82 },
  segments: {
    borderRadius: 24,
    flexDirection: 'row',
    gap: 4,
    padding: 5
  },
  segment: {
    alignItems: 'center',
    borderRadius: 20,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.sm
  },
  segmentText: { fontWeight: '700', textAlign: 'center' }
});
