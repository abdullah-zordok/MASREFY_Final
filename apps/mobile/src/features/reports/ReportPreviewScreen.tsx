import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import type { ReportBreakdown, ReportOutputAttempt } from '@/domain/reports';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { reportsService } from '@/services/reports-service';
import { usePreferenceStore } from '@/state/preferences';
import { useReportsViewState } from '@/state/reports-view-state';
import { formatDateTime } from '@/utils/format-financial-value';
import {
  useReportAttempts,
  useReportInput,
  useReportMutation,
  useReportPreview,
  useReportSchedule
} from './report-queries';
import { outputStateTitle, reportStateTitle } from './report-state';

type OutputRequest = Parameters<typeof reportsService.requestOutput>[0];
let outputOperationSequence = 0;

export function ReportPreviewScreen() {
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const locale = usePreferenceStore((state) => state.locale);
  const { selectedKind, anchorDate } = useReportsViewState();
  const schedule = useReportSchedule();
  const attempts = useReportAttempts();
  const [detailLevel, setDetailLevel] = useState<'summary' | 'detailed'>(
    schedule.data?.detailLevel ?? 'summary'
  );
  const recipientEmail =
    schedule.data?.recipient.status === 'verified'
      ? schedule.data.recipient.normalizedEmail
      : null;
  const input = {
    ...useReportInput(selectedKind, anchorDate, currencyCode),
    language: locale,
    detailLevel,
    recipientEmail
  };
  const preview = useReportPreview(input);
  const output = useReportMutation((request: OutputRequest) =>
    reportsService.requestOutput(
      request,
      `report-output:${request.kind}:${Date.now()}:${++outputOperationSequence}`
    )
  );

  const submit = (kind: 'send_test' | 'send_now' | 'download' | 'share') => {
    if (preview.data)
      output.mutate({ kind, previewId: preview.data.previewId });
  };
  const retry = (attempt: ReportOutputAttempt) =>
    output.mutate({ kind: 'retry', previousAttemptId: attempt.id });
  const snapshot = preview.data?.snapshot;

  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <StyledText variant="title">
        {translate('reports.preview.title')}
      </StyledText>
      {snapshot ? (
        <View style={styles.stack}>
          <StyledText>{`${translate('reports.preview.period')}: ${snapshot.period.startDate} – ${snapshot.period.endDate}`}</StyledText>
          <StyledText>{`${translate('reports.preview.generated')}: ${formatDateTime(snapshot.generatedAt, currentLocale())}`}</StyledText>
          <StyledText>{`${translate('reports.preview.dataAsOf')}: ${formatDateTime(snapshot.dataAsOf, currentLocale())}`}</StyledText>
          <StyledText>{`${translate('reports.preview.language')}: ${translate(snapshot.language === 'ar' ? 'common.arabic' : 'common.english')}`}</StyledText>
          <StyledText>{`${translate('reports.preview.currency')}: ${snapshot.currencyCode}`}</StyledText>
          <StyledText>{`${translate('reports.preview.sections')}: ${snapshot.breakdowns.map((item: ReportBreakdown) => translate(`reports.dimension.${item.dimension}` as MessageKey)).join(', ')}`}</StyledText>
          <StyledText>{`${translate('reports.preview.detail')}: ${translate(`reports.schedule.${snapshot.detailLevel}` as MessageKey)}`}</StyledText>
          <StyledText>{`${translate('reports.preview.recipient')}: ${recipientEmail ?? translate('reports.preview.notSet')}`}</StyledText>
          <StyledText>{reportStateTitle(snapshot.dataState)}</StyledText>
        </View>
      ) : (
        <StyledText>{translate('reports.state.loading')}</StyledText>
      )}

      <StyledText variant="subtitle">
        {translate('reports.preview.privacy')}
      </StyledText>
      <View style={styles.actions}>
        <ActionButton
          label={translate('reports.schedule.summary')}
          onPress={() => setDetailLevel('summary')}
          variant="secondary"
        />
        <ActionButton
          label={translate('reports.schedule.detailed')}
          onPress={() => setDetailLevel('detailed')}
          variant="secondary"
        />
      </View>
      <StyledText>{`${translate('reports.preview.privacyWarning')}: ${translate('reports.preview.emailWarning')}`}</StyledText>
      <StyledText>{translate('reports.preview.mockNotice')}</StyledText>

      <View style={styles.actions}>
        <ActionButton
          disabled={!preview.data || !recipientEmail || output.isPending}
          label={translate('reports.action.sendTest')}
          onPress={() => submit('send_test')}
        />
        <ActionButton
          disabled={!preview.data || !recipientEmail || output.isPending}
          label={translate('reports.action.sendNow')}
          onPress={() => submit('send_now')}
        />
        <ActionButton
          disabled={!preview.data || output.isPending}
          label={translate('reports.action.download')}
          onPress={() => submit('download')}
          variant="secondary"
        />
        <ActionButton
          disabled={!preview.data || output.isPending}
          label={translate('reports.action.share')}
          onPress={() => submit('share')}
          variant="secondary"
        />
      </View>

      <StyledText variant="subtitle">
        {translate('reports.preview.history')}
      </StyledText>
      {attempts.data?.items.length ? (
        attempts.data.items.map((attempt: ReportOutputAttempt) => (
          <View key={attempt.id} style={styles.historyItem}>
            <StyledText>
              {translate(`reports.output.kind.${attempt.kind}` as MessageKey)}
            </StyledText>
            <StyledText>{outputStateTitle(attempt.status)}</StyledText>
            <StyledText>
              {formatDateTime(attempt.requestedAt, currentLocale())}
            </StyledText>
            {attempt.failureCategory ? (
              <StyledText>
                {translate(
                  `reports.output.failure.${attempt.failureCategory}` as MessageKey
                )}
              </StyledText>
            ) : null}
            {attempt.status === 'failed' ? (
              <ActionButton
                disabled={output.isPending}
                label={translate('reports.action.retry')}
                onPress={() => retry(attempt)}
                variant="secondary"
              />
            ) : null}
          </View>
        ))
      ) : (
        <StyledText>{translate('reports.preview.noHistory')}</StyledText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyItem: { borderWidth: 1, gap: 4, padding: 12 }
});
