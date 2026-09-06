import React, { useState } from 'react';
import { FlatList, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { NotificationEvent, NotificationListQuery, NotificationTarget } from '@/domain/notifications';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { SensitiveValue } from '@/design-system/components/SensitiveValue';
import { StatusBadge } from '@/design-system/components/StatusBadge';
import { StateView } from '@/design-system/components/feedback/StateView';
import { ConfirmationDialog } from '@/design-system/components/overlays/ConfirmationDialog';
import { useTheme } from '@/state/theme-context';
import { translateDynamic, translateDynamicOr } from '@/localization/i18n';
import { StyledText } from '@/components/StyledText';

import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useResolveNotificationOpen,
  useUnreadNotificationCount
} from './notification-queries';

type NotificationListRow =
  | { kind: 'group'; id: string; label: string }
  | { kind: 'notification'; id: string; item: NotificationEvent };

const views: readonly { labelKey: string; query: NotificationListQuery }[] = [
  { labelKey: 'notifications.center.filter.all', query: {} },
  { labelKey: 'notifications.center.filter.unread', query: { unreadOnly: true } },
  { labelKey: 'notifications.center.filter.transactions', query: { category: 'transaction' } },
  { labelKey: 'notifications.center.filter.obligations', query: { category: 'obligation' } },
  { labelKey: 'notifications.center.filter.budgets', query: { category: 'budget' } },
  { labelKey: 'notifications.center.filter.reports', query: { category: 'report' } },
  { labelKey: 'notifications.center.filter.assistant', query: { category: 'assistant' } },
  { labelKey: 'notifications.center.filter.security', query: { category: 'security' } }
];

export function NotificationCenterScreen() {
  const theme = useTheme();
  const largeText = PixelRatio.getFontScale() >= 1.5;
  const [viewIndex, setViewIndex] = useState(0);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationEvent | null>(null);
  const query = views[viewIndex].query;
  const notifications = useNotifications(query);
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const resolveOpen = useResolveNotificationOpen();

  const legacyData = notifications.data as unknown as { items?: NotificationEvent[]; total?: number } | undefined;
  const items: NotificationEvent[] = notifications.data?.pages?.flatMap((page) => page.items) ?? legacyData?.items ?? [];
  const rows = buildNotificationCenterRows(items);
  const total = notifications.data?.pages?.[0]?.total ?? legacyData?.total ?? items.length;
  const viewLabels = views.map((view) => t(view.labelKey));

  const listHeader = (
    <View style={styles.stack}>
      <View
        testID="notification-center-header"
        style={[
          styles.header,
          largeText ? { alignItems: 'stretch', flexDirection: 'column' } : null
        ]}
      >
        <StyledText variant="title">appShell.shell.notifications</StyledText>
        <ActionButton
          label={t('notifications.preferences.title')}
          variant="secondary"
          onPress={() => router.push('/notifications/preferences')}
        />
      </View>
      <View accessibilityLabel={t('notifications.center.unreadLabel')} style={styles.badgeRow}>
        <Text style={[styles.unread, { color: theme.colors.textPrimary }]}>
          {unread.data ?? 0}
        </Text>
        <ActionButton
          label={t('notifications.center.markAllRead')}
          variant="secondary"
          onPress={() =>
            markAllRead.mutate({
              filter: query,
              operationId: `mark-all-${Date.now()}`
            })
          }
        />
      </View>
      <ChipSelector
        options={viewLabels}
        selected={[viewLabels[viewIndex]]}
        onToggle={(label) => setViewIndex(Math.max(0, viewLabels.indexOf(label)))}
      />
      <Text style={[styles.count, { color: theme.colors.textSecondary }]}>
        {`${total.toLocaleString('en-US')} ${t('notifications.center.countSuffix')}`}
      </Text>
    </View>
  );

  if (notifications.isLoading) {
    return <StateView state="loading" title={t('notifications.center.loading')} />;
  }
  if (notifications.isError) {
    return (
      <StateView
        state="offline"
        title={t('notifications.center.offline')}
        actionLabel={t('notifications.center.retry')}
        onAction={() => notifications.refetch()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<StateView state="empty" title={t('notifications.center.empty')} />}
        renderItem={({ item }) =>
          item.kind === 'group' ? (
            <Text style={[styles.group, { color: theme.colors.textPrimary }]}>{item.label}</Text>
          ) : (
            <NotificationRow
              item={item.item}
              revealed={revealedId === item.item.id}
              onReveal={() => setRevealedId(item.item.id)}
              onHide={() => setRevealedId(null)}
              onOpen={() => {
                resolveOpen.mutate(item.item.id, {
                  onSuccess: (target) => {
                    const destination = routeForTarget(target);
                    if (!destination) return;
                    if (item.item.readAt === null) markRead.mutate({ id: item.item.id, read: true });
                    router.push(destination);
                  }
                });
              }}
              onDelete={() => setDeleteTarget(item.item)}
            />
          )
        }
        onEndReached={() => notifications.hasNextPage && !notifications.isFetchingNextPage && notifications.fetchNextPage()}
      />
      <ConfirmationDialog
        visible={Boolean(deleteTarget)}
        title={t('notifications.center.deleteTitle')}
        message={t('notifications.center.deleteMessage')}
        confirmLabel={t('notifications.center.deleteConfirm')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            remove.mutate({ id: deleteTarget.id, operationId: `delete-${deleteTarget.id}` });
          }
          setDeleteTarget(null);
        }}
      />
    </View>
  );
}

function NotificationRow({
  item,
  revealed,
  onReveal,
  onHide,
  onOpen,
  onDelete
}: {
  item: NotificationEvent;
  revealed: boolean;
  onReveal: () => void;
  onHide: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const amount = Object.values(item.messageValues).find((value) => typeof value === 'string' && /\d/.test(value));
  const expired = item.availableActions.some((action) => action.expiresAt !== null && action.expiresAt <= Date.now());
  const canOpen = Boolean(routeForNotification(item));
  const title = translateDynamicOr(item.titleKey, 'notifications.fallback.title', item.messageValues);

  return (
    <View style={[styles.card, { borderColor: theme.colors.border }]}>
      <StyledText variant="subtitle">{title}</StyledText>
      <StyledText style={{ color: theme.colors.textSecondary }}>{translateDynamicOr(item.bodyKey, 'notifications.fallback.body', item.messageValues)}</StyledText>
      <View style={styles.badgeRow}>
        {item.syncStatus === 'pending' ? <StatusBadge status="sync" label={t('notifications.center.syncPending')} /> : null}
        {!item.target || item.safeFailure === 'unavailable' ? <StatusBadge status="warning" label={t('notifications.center.unavailable')} /> : null}
        {expired ? <StatusBadge status="warning" label={t('notifications.center.actionExpired')} /> : null}
      </View>
      {typeof amount === 'string' ? (
        <SensitiveValue
          value={amount}
          revealed={revealed}
          onReveal={onReveal}
          onHide={onHide}
        />
      ) : null}
      <View style={styles.actions}>
        <ActionButton label={`${t('notifications.center.openPrefix')} ${title}`} variant="secondary" disabled={!canOpen} onPress={onOpen} />
        <ActionButton label={`${t('notifications.center.deletePrefix')} ${title}`} variant="destructive" onPress={onDelete} />
      </View>
    </View>
  );
}

export function buildNotificationCenterRows(items: readonly NotificationEvent[]): NotificationListRow[] {
  const rows: NotificationListRow[] = [];
  let currentGroup: string | null = null;
  for (const item of items) {
    const group = isToday(item.occurredAt) ? t('notifications.center.today') : t('notifications.center.earlier');
    if (group !== currentGroup) {
      rows.push({ kind: 'group', id: `group-${group}`, label: group });
      currentGroup = group;
    }
    rows.push({ kind: 'notification', id: item.id, item });
  }
  return rows;
}

function routeForNotification(item: NotificationEvent): string | null {
  if (item.safeFailure === 'unavailable') return null;
  const view = item.availableActions.find((action) => action.kind === 'view');
  if (!view || (view.expiresAt !== null && view.expiresAt <= Date.now())) return null;
  return routeForTarget(item.target);
}

function routeForTarget(target: NotificationTarget | null): string | null {
  if (target?.kind === 'account') return path('/accounts', target.accountId);
  if (!target) return null;
  if (target.kind === 'transaction') return path('/transactions', target.transactionId);
  if (target.kind === 'review') return path('/tracking/review', target.reviewId);
  if (target.kind === 'obligation') return path('/obligations', target.obligationId);
  if (target.kind === 'budget') return path('/budgets', target.budgetId);
  if (target.kind === 'salary') return '/salary';
  if (target.kind === 'goal') return path('/savings', target.goalId);
  if (target.kind === 'report') return '/reports';
  if (target.kind === 'assistant') return path('/assistant', target.conversationId);
  if (target.kind === 'security') return '/security/events';
  if (target.kind === 'settings') {
    if (target.key === 'notifications') return '/notifications/preferences';
    if (target.key === 'security') return '/security/settings';
    return '/profile/privacy';
  }
  return null;
}

function path(prefix: string, id: string): string | null {
  return /^[A-Za-z0-9_-]+$/.test(id) ? `${prefix}/${id}` : null;
}

function t(key: string) {
  return translateDynamic(key);
}

function isToday(value: number): boolean {
  return new Date(value).toDateString() === new Date(Date.now()).toDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  stack: {
    gap: 12
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  unread: {
    fontSize: 24,
    fontWeight: '700'
  },
  count: {
    fontWeight: '600'
  },
  group: {
    fontSize: 18,
    fontWeight: '700'
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 12
  },
  title: {
    fontSize: 16,
    fontWeight: '700'
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  }
});
