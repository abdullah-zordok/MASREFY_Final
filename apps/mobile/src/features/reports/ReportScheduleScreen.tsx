import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { FormField } from '@/design-system/components/forms/FormField';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import type {
  RecipientVerification,
  ReportOutputAttempt,
  ReportSchedule,
  ReportScheduleInput
} from '@/domain/reports';
import { currentLocale, translate } from '@/localization/i18n';
import { reportsService } from '@/services/reports-service';
import { usePreferenceStore } from '@/state/preferences';
import { formatDate } from '@/utils/format-financial-value';
import {
  useReportAttempts,
  useReportMutation,
  useReportSchedule
} from './report-queries';
import { scheduleStateTitle } from './report-state';
import { makeReportScheduleDraft, reportDraftStore } from './useReportDraft';

const frequencies = ['monthly', 'three_months', 'half_year', 'annual'] as const;

export function ReportScheduleScreen() {
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const locale = usePreferenceStore((state) => state.locale);
  const schedule = useReportSchedule();
  const attempts = useReportAttempts();
  const [input, setInput] = useState<ReportScheduleInput>(() =>
    defaultInput(locale, currencyCode)
  );
  const [verification, setVerification] =
    useState<RecipientVerification | null>(null);
  const verify = useReportMutation((email: string) =>
    reportsService.verifyRecipient(
      email,
      `verify:${email.trim().toLowerCase()}`
    )
  );
  const save = useReportMutation((scheduleInput: ReportScheduleInput) =>
    reportsService.saveSchedule(
      scheduleInput,
      schedule.data?.version ?? null,
      `schedule:${schedule.data?.version ?? 0}:${scheduleInput.recipientEmail.trim().toLowerCase()}`
    )
  );
  const changeStatus = useReportMutation(
    (status: 'active' | 'paused' | 'disabled') =>
      reportsService.setScheduleStatus(
        status,
        schedule.data!.version,
        `schedule-status:${schedule.data!.version}:${status}`
      )
  );

  useEffect(() => {
    if (schedule.data) {
      setInput(inputFromSchedule(schedule.data));
      setVerification(schedule.data.recipient);
      return;
    }
    if (!schedule.isLoading) {
      void reportDraftStore.load().then((draft) => {
        if (draft) setInput(draft.payload);
      });
    }
  }, [schedule.data, schedule.isLoading]);

  const updateInput = <Key extends keyof ReportScheduleInput>(
    key: Key,
    value: ReportScheduleInput[Key]
  ) => {
    const next = { ...input, [key]: value };
    setInput(next);
    if (key === 'recipientEmail') setVerification(null);
    if (next.recipientEmail.trim())
      void reportDraftStore.save(
        makeReportScheduleDraft(next, schedule.data?.version ?? null)
      );
  };

  const verified =
    verification?.status === 'verified' &&
    verification.normalizedEmail === input.recipientEmail.trim().toLowerCase();
  const lastAttempt = attempts.data?.items.find(
    (attempt: ReportOutputAttempt) =>
      attempt.id === schedule.data?.lastSuccessfulAttemptId
  );
  const frequencyLabels = frequencies.map((frequency) =>
    translate(`reports.period.${frequency}`)
  );
  const languages = ['ar', 'en'] as const;
  const languageLabels = languages.map((language) =>
    translate(language === 'ar' ? 'common.arabic' : 'common.english')
  );
  const detailLevels = ['summary', 'detailed'] as const;
  const detailLabels = detailLevels.map((detailLevel) =>
    translate(`reports.schedule.${detailLevel}`)
  );

  return (
    <ScrollView
      contentContainerStyle={styles.stack}
      keyboardShouldPersistTaps="handled"
    >
      <StyledText variant="title">
        {translate('reports.schedule.title')}
      </StyledText>
      <StyledText>
        {schedule.data
          ? scheduleStateTitle(schedule.data.status)
          : translate('reports.schedule.empty')}
      </StyledText>
      <StyledText>{translate('reports.schedule.mockNotice')}</StyledText>

      <FormField
        label={translate('reports.schedule.recipient')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={(recipientEmail) =>
          updateInput('recipientEmail', recipientEmail)
        }
        value={input.recipientEmail}
      />
      <ActionButton
        disabled={!input.recipientEmail.trim()}
        label={translate('reports.schedule.verify')}
        loading={verify.isPending}
        onPress={() =>
          verify.mutate(input.recipientEmail, {
            onSuccess: (result) => setVerification(result.value)
          })
        }
      />
      {verified ? (
        <StyledText>{translate('reports.schedule.verified')}</StyledText>
      ) : null}

      <FieldLabel label={translate('reports.schedule.frequency')} />
      <ChipSelector
        options={frequencyLabels}
        selected={[translate(`reports.period.${input.frequency}`)]}
        onToggle={(label) =>
          updateInput(
            'frequency',
            frequencies[frequencyLabels.indexOf(label)] ?? input.frequency
          )
        }
      />

      <FormField
        label={translate('reports.schedule.deliveryDay')}
        variant="amount"
        onChangeText={(deliveryDay) =>
          updateInput('deliveryDay', Number(deliveryDay))
        }
        value={String(input.deliveryDay)}
      />
      <FieldLabel label={translate('reports.schedule.language')} />
      <ChipSelector
        options={languageLabels}
        selected={[
          translate(
            input.language === 'ar' ? 'common.arabic' : 'common.english'
          )
        ]}
        onToggle={(label) =>
          updateInput(
            'language',
            languages[languageLabels.indexOf(label)] ?? input.language
          )
        }
      />
      <FormField
        label={translate('reports.schedule.currency')}
        autoCapitalize="characters"
        maxLength={3}
        onChangeText={(nextCurrency) =>
          updateInput('currencyCode', nextCurrency.toUpperCase())
        }
        value={input.currencyCode}
      />
      <StyledText>{`${translate('reports.schedule.timeZone')}: ${input.timeZone}`}</StyledText>
      <StyledText>{`${translate('reports.schedule.coveredPeriod')}: ${translate(`reports.period.${input.frequency}`)}`}</StyledText>

      <ChipSelector
        options={detailLabels}
        selected={[translate(`reports.schedule.${input.detailLevel}`)]}
        onToggle={(label) =>
          updateInput(
            'detailLevel',
            detailLevels[detailLabels.indexOf(label)] ?? input.detailLevel
          )
        }
      />
      {input.detailLevel === 'detailed' ? (
        <StyledText>{translate('reports.schedule.detailWarning')}</StyledText>
      ) : (
        <StyledText>{translate('reports.schedule.summaryOnly')}</StyledText>
      )}
      <SwitchRow
        label={translate('reports.schedule.assistantSummary')}
        value={input.includeAssistantSummary}
        onValueChange={(value) => updateInput('includeAssistantSummary', value)}
      />

      <ActionButton
        disabled={!verified}
        label={translate('reports.action.saveSchedule')}
        loading={save.isPending}
        onPress={() => save.mutate(input)}
      />
      <LifecycleActions
        status={schedule.data?.status}
        pending={changeStatus.isPending}
        onChange={(status) => changeStatus.mutate(status)}
      />

      <StyledText>{`${translate('reports.schedule.lastDelivery')}: ${lastAttempt?.completedAt ? formatDate(lastAttempt.completedAt, currentLocale()) : translate('reports.schedule.noDelivery')}`}</StyledText>
      <StyledText>{`${translate('reports.schedule.nextDelivery')}: ${schedule.data?.nextDeliveryAt ? formatDate(schedule.data.nextDeliveryAt, currentLocale()) : translate('reports.schedule.noDelivery')}`}</StyledText>
    </ScrollView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <StyledText accessible={false} variant="subtitle">
      {label}
    </StyledText>
  );
}

function LifecycleActions({
  status,
  pending,
  onChange
}: {
  status?: 'verification_required' | 'active' | 'paused' | 'disabled';
  pending: boolean;
  onChange: (status: 'active' | 'paused' | 'disabled') => void;
}) {
  if (!status || status === 'verification_required') return null;
  return (
    <View style={styles.choices}>
      {status === 'active' ? (
        <ActionButton
          label={translate('reports.schedule.pause')}
          loading={pending}
          onPress={() => onChange('paused')}
          variant="secondary"
        />
      ) : null}
      {status === 'paused' ? (
        <ActionButton
          label={translate('reports.schedule.resume')}
          loading={pending}
          onPress={() => onChange('active')}
          variant="secondary"
        />
      ) : null}
      {status !== 'disabled' ? (
        <ActionButton
          label={translate('reports.schedule.disable')}
          loading={pending}
          onPress={() => onChange('disabled')}
          variant="destructive"
        />
      ) : null}
    </View>
  );
}

function defaultInput(
  language: 'ar' | 'en',
  currencyCode: string
): ReportScheduleInput {
  return {
    recipientEmail: '',
    frequency: 'monthly',
    language,
    currencyCode,
    deliveryDay: 1,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
    includeAssistantSummary: false,
    detailLevel: 'summary'
  };
}

function inputFromSchedule(schedule: ReportSchedule): ReportScheduleInput {
  return {
    recipientEmail: schedule.recipient.normalizedEmail,
    frequency: schedule.frequency,
    language: schedule.language,
    currencyCode: schedule.currencyCode,
    deliveryDay: schedule.deliveryDay,
    timeZone: schedule.timeZone,
    includeAssistantSummary: schedule.includeAssistantSummary,
    detailLevel: schedule.detailLevel,
    status: schedule.status
  };
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
});
