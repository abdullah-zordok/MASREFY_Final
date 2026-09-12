import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import type { LayoutDirection } from '@/domain/foundation';
import { translate } from '@/localization/i18n';
import { useTheme } from '@/state/theme-context';
import { editorialFontFamilyForLocale } from '@/design-system/typography';
import { usePreferenceStore } from '@/state/preferences';
import { colorTokens } from '@/design-system/tokens';

export function AppBar({
  title,
  onBack,
  onOverflow,
  direction = 'ltr'
}: {
  title: string;
  onBack: () => void;
  onOverflow?: () => void;
  direction?: LayoutDirection;
}) {
  const theme = useTheme();
  const backLabel = translate('appShell.navigation.back');
  const moreLabel = translate('designSystem.navigation.moreOptions');
  return (
    <View
      testID="app-bar"
      style={[
        styles.bar,
        styles.physicalLtr,
        { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={styles.action}
      >
        <DesignIcon
          name="back"
          label={backLabel}
          direction={direction}
          color={theme.colors.primary}
          decorative
        />
      </Pressable>
      <StyledText
        accessible={false}
        style={[styles.title, { writingDirection: direction }]}
      >
        {title}
      </StyledText>
      {onOverflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          onPress={onOverflow}
          style={styles.action}
        >
          <DesignIcon
            name="more"
            label={moreLabel}
            color={theme.colors.primary}
            decorative
          />
        </Pressable>
      ) : (
        <View style={styles.action} />
      )}
    </View>
  );
}

export function BrandedScreenHeader({
  compact = false,
  direction,
  onBack,
  scope,
  subtitle,
  testID,
  title,
  titleAlignEnd = false,
  titleTestID
}: {
  compact?: boolean;
  direction: LayoutDirection;
  onBack?: () => void;
  scope?: React.ReactNode;
  subtitle?: string;
  testID?: string;
  title: string;
  titleAlignEnd?: boolean;
  titleTestID?: string;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  const backLabel = translate('appShell.navigation.back');
  const isRtl = direction === 'rtl';

  return (
    <View
      testID={testID}
      style={[
        styles.masthead,
        compact && styles.mastheadCompact,
        compact && styles.physicalLtr,
        compact && {
          flexDirection: isRtl ? 'row-reverse' : 'row'
        },
        {
          backgroundColor: theme.colors.surfaces.card,
          borderBottomColor: colorTokens.raw.E2E7E3
        }
      ]}
    >
      {onBack ? (
        <View
          style={[
            styles.mastheadTopline,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          <Pressable
            accessibilityLabel={backLabel}
            accessibilityRole="button"
            onPress={onBack}
            style={[
              styles.mastheadAction,
              {
                backgroundColor: colorTokens.surface.white,
                borderColor: colorTokens.raw.E2E7E3
              }
            ]}
          >
            <DesignIcon
              name="back"
              label={backLabel}
              color={theme.colors.primary}
              direction={direction}
              decorative
            />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.mastheadHeading,
          compact && styles.mastheadHeadingCompact
        ]}
      >
        <StyledText
          testID={titleTestID}
          style={[
            styles.mastheadTitle,
            compact && styles.mastheadTitleCompact,
            {
              fontFamily: editorialFontFamilyForLocale(locale, 700),
              alignSelf: compact
                ? 'stretch'
                : titleAlignEnd || isRtl
                  ? 'flex-end'
                  : 'flex-start',
              textAlign: isRtl ? 'right' : 'left',
              width: titleAlignEnd ? '100%' : undefined,
              writingDirection: direction
            }
          ]}
        >
          {title}
        </StyledText>
        {subtitle ? (
          <StyledText
            style={[
              styles.mastheadSubtitle,
              {
                color: theme.colors.content.secondary,
                fontFamily: editorialFontFamilyForLocale(locale, 400),
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {subtitle}
          </StyledText>
        ) : null}
        {scope}
      </View>
    </View>
  );
}

export function ContextMenu({
  items
}: {
  items: { label: string; onPress: () => void }[];
}) {
  return (
    <View style={styles.menu}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          accessibilityLabel={item.label}
          accessibilityRole="menuitem"
          onPress={item.onPress}
          style={styles.menuItem}
        >
          <StyledText accessible={false}>{item.label}</StyledText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 44
  },
  title: {
    flex: 1,
    fontWeight: '700',
    textAlign: 'center'
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48
  },
  menu: {
    gap: 8
  },
  menuItem: {
    justifyContent: 'center',
    minHeight: 48
  },
  masthead: {
    borderBottomWidth: 1,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 12
  },
  mastheadTopline: {
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  mastheadAction: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  mastheadHeading: { marginTop: 12 },
  mastheadCompact: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    paddingTop: 8
  },
  mastheadHeadingCompact: { flex: 1, marginTop: 0 },
  mastheadTitleCompact: { fontSize: 24, lineHeight: 30 },
  mastheadTitle: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.675,
    lineHeight: 33
  },
  mastheadSubtitle: { fontSize: 13, lineHeight: 20, marginTop: 6 }
});
