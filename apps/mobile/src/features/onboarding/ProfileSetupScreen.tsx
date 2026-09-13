import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { CurrencyFlagIcon } from '@/design-system/components/currency/CurrencyFlagIcon';
import { FormField } from '@/design-system/components/forms/FormField';
import { openSelectionSession } from '@/design-system/components/selection/selection-session';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { elevation, radius, spacing } from '@/design-system/tokens';
import { getCurrencyDetails } from '@/domain/currencies';
import type { ProfileSetupSnapshot } from '@/domain/settings';
import { translate } from '@/localization/i18n';
import type { SettingsService } from '@/services/contracts/assistant-notifications-service';
import { getLiveClerkDisplayName } from '@/services/live/clerk-provider';
import { settingsService } from '@/services/mocks/subscription-settings-service';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

type ProfileSetupService = Pick<
  SettingsService,
  'getProfileSetup' | 'saveProfileSetup'
>;

export function ProfileSetupScreen({
  service = settingsService,
  getClerkName = getLiveClerkDisplayName,
  navigateHome = () => router.replace('/(tabs)/home')
}: {
  service?: ProfileSetupService;
  getClerkName?: () => string | null;
  navigateHome?: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const setBaseCurrencyCode = usePreferenceStore(
    (state) => state.setBaseCurrencyCode
  );
  const status = useAppShellStore((state) => state.profileSetupStatus);
  const snapshot = useAppShellStore((state) => state.profileSetupSnapshot);
  const setProfileSetup = useAppShellStore((state) => state.setProfileSetup);
  const initialized = useRef(false);
  const submittingRef = useRef(false);
  const operationId = useRef(`profile-setup-${Date.now()}`);
  const [name, setName] = useState(() => getClerkName() ?? '');
  const [currency, setCurrency] = useState('SAR');
  const [nameError, setNameError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!snapshot || initialized.current) return;
    initialized.current = true;
    setName((current) => current.trim() || snapshot.profile.name || '');
    setCurrency(snapshot.profile.currency || 'SAR');
  }, [snapshot]);

  async function loadLatest(): Promise<ProfileSetupSnapshot | null> {
    setProfileSetup('loading');
    try {
      const latest = await service.getProfileSetup();
      setProfileSetup(latest.complete ? 'complete' : 'incomplete', latest);
      if (latest.complete) navigateHome();
      return latest;
    } catch {
      setProfileSetup('error');
      return null;
    }
  }

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    if (!snapshot || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNameError(false);
    setSaveError(false);
    try {
      const result = await service.saveProfileSetup(
        { name: trimmedName, currency },
        snapshot,
        operationId.current
      );
      setProfileSetup('complete', result.value);
      setBaseCurrencyCode(result.value.profile.currency);
      navigateHome();
    } catch {
      setSaveError(true);
      await loadLatest();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const selected = getCurrencyDetails(currency);
  const currencyName = direction === 'rtl' ? selected.nameAr : selected.nameEn;
  const isRtl = direction === 'rtl';
  const directionalText = {
    textAlign: 'auto' as const,
    writingDirection: direction,
    width: '100%' as const
  };
  const unavailable = !snapshot && (status === 'error' || status === 'unknown');

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.surfaces.page }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            testID="profile-setup-content"
            style={[styles.content, layoutDirectionStyle(direction)]}
          >
            <View style={styles.top}>
              <View style={styles.intro}>
                <StyledText variant="headline" style={directionalText}>
                  {translate('profileSetup.title')}
                </StyledText>
                <StyledText
                  style={{
                    ...directionalText,
                    color: theme.colors.content.secondary
                  }}
                >
                  {translate('profileSetup.supporting')}
                </StyledText>
              </View>

              <View style={styles.form}>
                <FormField
                  autoCapitalize="words"
                  autoComplete="name"
                  errorText={
                    nameError
                      ? translate('profileSetup.nameRequired')
                      : undefined
                  }
                  helperText={translate('profileSetup.nameHelper')}
                  label={translate('profileSetup.nameLabel')}
                  labelPlacement="accessibility-only"
                  onChangeText={(value) => {
                    setName(value);
                    if (nameError && value.trim()) setNameError(false);
                  }}
                  maxLength={100}
                  returnKeyType="done"
                  style={styles.nameInput}
                  value={name}
                />

                <View style={styles.fieldStack}>
                  <StyledText variant="subtitle" style={directionalText}>
                    {translate('profileSetup.currencyLabel')}
                  </StyledText>
                  <Pressable
                    accessibilityLabel={`${translate('profileSetup.currencyLabel')} ${selected.code} ${currencyName}`}
                    accessibilityRole="button"
                    onPress={() =>
                      openSelectionSession({
                        targetRoute: '/settings/currency',
                        selectedId: currency,
                        onSelect: setCurrency
                      })
                    }
                    style={({ pressed }) => [
                      styles.currencyControl,
                      elevation.raised,
                      {
                        backgroundColor: theme.colors.surfaces.card,
                        borderColor: theme.colors.borders.subtle,
                        flexDirection: isRtl ? 'row-reverse' : 'row',
                        opacity: pressed ? 0.82 : 1
                      },
                      styles.physicalLtr
                    ]}
                  >
                    <View style={styles.currencyValue}>
                      <StyledText
                        variant="subtitle"
                        style={styles.currencyLtrText}
                      >
                        {selected.code}
                      </StyledText>
                      <StyledText
                        accessible={false}
                        variant="subtitle"
                        style={styles.currencyLtrText}
                      >
                        ·
                      </StyledText>
                      <StyledText
                        variant="subtitle"
                        style={{ writingDirection: direction }}
                      >
                        {currencyName}
                      </StyledText>
                      <CurrencyFlagIcon code={selected.code} size={24} />
                    </View>
                    <DesignIcon
                      name="chevronDown"
                      label="Currency picker indicator"
                      decorative
                    />
                  </Pressable>
                  <StyledText
                    variant="caption"
                    style={{
                      ...directionalText,
                      color: theme.colors.content.secondary
                    }}
                  >
                    {translate('profileSetup.currencyHelper')}
                  </StyledText>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              {saveError ? (
                <StyledText
                  accessibilityRole="alert"
                  style={{
                    color: theme.colors.status.danger,
                    textAlign: 'center'
                  }}
                >
                  {translate('profileSetup.saveError')}
                </StyledText>
              ) : null}
              {unavailable ? (
                <ActionButton
                  label={translate('profileSetup.retry')}
                  onPress={() => void loadLatest()}
                  variant="secondary"
                />
              ) : null}
              <ActionButton
                disabled={!snapshot || status === 'loading'}
                label={translate('profileSetup.continue')}
                loading={submitting || (status === 'loading' && !snapshot)}
                onPress={() => void submit()}
                style={styles.primaryAction}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 620,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    width: '100%'
  },
  intro: { gap: spacing.sm, width: '100%' },
  nameInput: {
    minHeight: 56,
    textAlign: 'auto',
    writingDirection: 'auto'
  },
  top: { gap: spacing.xl, width: '100%' },
  form: { gap: spacing.xl, width: '100%' },
  fieldStack: { gap: spacing.sm, width: '100%' },
  currencyControl: {
    alignItems: 'center',
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg
  },
  currencyValue: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.xs
  },
  currencyLtrText: { writingDirection: 'ltr' },
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  actions: { gap: spacing.md, width: '100%' },
  primaryAction: { minHeight: 56 }
});
