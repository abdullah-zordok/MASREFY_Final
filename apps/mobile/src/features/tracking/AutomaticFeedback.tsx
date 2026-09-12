import React from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import type { AutomaticFeedback as AutomaticFeedbackValue } from '@/domain/automatic-tracking';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { invalidateTrackingScopes } from './useAutomaticTracking';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';

export function AutomaticFeedback({
  feedback,
  onDone
}: {
  feedback: AutomaticFeedbackValue | null;
  onDone?: () => void;
}) {
  const client = useQueryClient();
  if (!feedback) return null;
  const canUndo =
    feedback.status === 'active' && Date.now() <= feedback.undoExpiresAt;
  return (
    <SurfaceCard>
      <View style={styles.stack}>
        <TrackingDemoNotice />
        <StyledText variant="subtitle">
          {translate('tracking.feedback.added')}
        </StyledText>
        <StyledText>{translate('tracking.feedback.undoWindow')}</StyledText>
        <View style={styles.actions}>
          <ActionButton
            label={translate('tracking.action.view')}
            onPress={() =>
              router.push(`/transactions/${feedback.transactionId}`)
            }
          />
          <ActionButton
            label={translate('tracking.action.edit')}
            onPress={() =>
              router.push(`/transactions/${feedback.transactionId}/edit`)
            }
            variant="secondary"
          />
          {canUndo ? (
            <ActionButton
              label={translate('tracking.action.undo')}
              onPress={async () => {
                const result =
                  await automaticTrackingService.undoAutomaticAddition(
                    feedback.id
                  );
                await invalidateTrackingScopes(client, result.affectedScopes);
                onDone?.();
              }}
              variant="destructive"
            />
          ) : null}
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  actions: { gap: 8 }
});
