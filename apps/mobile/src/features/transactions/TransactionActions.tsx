import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { ActionButton } from '@/design-system/components/ActionButton';
import { UndoSnackbar } from '@/design-system/components/feedback/TransientFeedback';
import type { Transaction } from '@/domain/core-finance';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';
import { invalidateTrackingScopes } from '@/features/tracking/useAutomaticTracking';
import { translate, translateDynamic } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { useTheme } from '@/state/theme-context';
import { buildTransactionSupportContext } from '@/features/support/support-context';

export function useTransactionActions(
  transaction: Transaction,
  onDeletedChange?: (deleted: boolean) => void
) {
  const client = useQueryClient();
  const [deletedUntil, setDeletedUntil] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [undoExpired, setUndoExpired] = useState(false);
  const restoredDeletedUntil =
    transaction.status === 'deleted' &&
    transaction.undoExpiresAt !== null &&
    transaction.undoExpiresAt > Date.now()
      ? transaction.undoExpiresAt
      : null;
  const activeDeletedUntil = undoExpired
    ? null
    : deletedUntil ?? restoredDeletedUntil;
  const deleted = transaction.status === 'deleted' || deletedUntil !== null;

  useEffect(() => onDeletedChange?.(deleted), [deleted, onDeletedChange]);

  const requestDelete = () =>
    Alert.alert(
      translate('coreFinance.transaction.delete'),
      translateDynamic('coreFinance.transaction.deleteConfirmNamed', {
        name: transaction.title
      }),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: translate('coreFinance.transaction.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (working) return;
              setWorking(true);
              setError(undefined);
              try {
                const deletion = await coreFinanceService.deleteTransaction(
                  transaction.id
                );
                setDeletedUntil(deletion.undoExpiresAt);
                await invalidateCoreFinanceScopes(client, deletion.affectedScopes);
              } catch {
                setError(translate('coreFinance.state.error'));
              } finally {
                setWorking(false);
              }
            })();
          }
        }
      ]
    );

  return {
    activeDeletedUntil,
    deleted,
    error,
    requestDelete,
    reportSupport: () =>
      router.push({
        pathname: '/support/new',
        params: {
          mode: 'transaction_report',
          context: JSON.stringify(
            buildTransactionSupportContext(transaction, { appVersion: '1.0.0' })
          )
        }
      }),
    reportWrongDetection: async () => {
      setError(undefined);
      try {
        const report = await automaticTrackingService.reportWrongDetection(
          transaction.id
        );
        await invalidateTrackingScopes(client, report.affectedScopes);
      } catch {
        setError(translate('coreFinance.state.error'));
      }
    },
    undo: async () => {
      if (working) return;
      setWorking(true);
      setError(undefined);
      try {
        const restored = await coreFinanceService.undoDelete(transaction.id);
        setDeletedUntil(null);
        setUndoExpired(false);
        await invalidateCoreFinanceScopes(client, restored.affectedScopes);
      } catch {
        setError(translate('coreFinance.state.error'));
      } finally {
        setWorking(false);
      }
    },
    undoExpired,
    expireUndo: () => setUndoExpired(true),
    working
  };
}

export function TransactionActions({
  transaction,
  onDeletedChange
}: {
  transaction: Transaction;
  onDeletedChange?: (deleted: boolean) => void;
}) {
  const theme = useTheme();
  const actions = useTransactionActions(transaction, onDeletedChange);
  return (
    <>
      <ActionButton
        label={translate('support.report.transaction')}
        variant="secondary"
        onPress={actions.reportSupport}
      />
      {transaction.source === 'automatic' ? (
        <ActionButton
          label={translate('tracking.action.reportWrong')}
          variant="secondary"
          onPress={() => void actions.reportWrongDetection()}
        />
      ) : null}
      {!actions.deleted ? (
        <ActionButton
          label={translate('coreFinance.transaction.delete')}
          loading={actions.working}
          variant="destructive"
          onPress={actions.requestDelete}
        />
      ) : null}
      {actions.activeDeletedUntil ? (
        <UndoSnackbar
          message={translate('coreFinance.transaction.deleted')}
          timeoutMs={Math.max(0, actions.activeDeletedUntil - Date.now())}
          onExpire={actions.expireUndo}
          onUndo={actions.undo}
        />
      ) : null}
      {actions.undoExpired && transaction.status === 'deleted' ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          {translate('coreFinance.transaction.undoExpired')}
        </Text>
      ) : null}
      {actions.error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.status.danger }}>
          {actions.error}
        </Text>
      ) : null}
    </>
  );
}
