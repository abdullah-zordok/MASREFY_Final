import {
  automaticFeedbackSchema,
  detectedFinancialEventSchema,
  reviewItemSchema,
  senderRuleSchema,
  trackingHistoryEntrySchema
} from './automatic-tracking';
import {
  createDefaultCategories,
  createDemoAccounts,
  createDemoTransactions
} from './core-finance-seeds';
import { createDemoFinancialPlanningSeed } from './financial-planning-seeds';
import {
  createNotificationPreferences,
  notificationEventSchema
} from './notifications';
import type { Locale } from './foundation';

export function createClientDemoData(
  now = Date.now(),
  timeZone = 'Asia/Riyadh',
  locale: Locale = 'en'
) {
  const finance = {
    accounts: createDemoAccounts(now, locale),
    categories: createDefaultCategories(),
    transactions: createDemoTransactions(now, locale)
  };
  const automaticEvent = detectedFinancialEventSchema.parse({
    id: 'demo-tracking-auto',
    sourceFingerprint: 'demo-tracking-auto-v1',
    sourceKind: 'sms_mock',
    eventType: 'purchase',
    decisionStatus: 'auto_added',
    confidenceBasisPoints: 9700,
    amountMinor: 24_375,
    currencyCode: 'SAR',
    merchant: finance.transactions[2].merchant,
    categoryId: 'food',
    accountHint: null,
    accountId: 'account-default',
    paymentMethod: 'card',
    occurredAt: finance.transactions[2].occurredAt,
    sourceText: null,
    sourceTextExpiresAt: null,
    reasonCodes: ['clear_success'],
    priorEventId: null,
    transactionId: 'demo-transaction-3',
    obligationMatchId: null,
    createdAt: now,
    updatedAt: now
  });
  const reviewEvent = detectedFinancialEventSchema.parse({
    ...automaticEvent,
    id: 'demo-tracking-review',
    sourceFingerprint: 'demo-tracking-review-v1',
    decisionStatus: 'review_required',
    confidenceBasisPoints: 7200,
    amountMinor: 8_950,
    merchant: locale === 'ar' ? 'متجر محلي' : 'Local Store',
    reasonCodes: ['low_confidence'],
    transactionId: null
  });
  const review = reviewItemSchema.parse({
    id: 'demo-tracking-review-item',
    detectedEventId: reviewEvent.id,
    status: 'pending',
    reasonCodes: reviewEvent.reasonCodes,
    missingFields: ['categoryId'],
    proposedValues: {
      amountMinor: reviewEvent.amountMinor,
      currencyCode: reviewEvent.currencyCode,
      merchant: reviewEvent.merchant,
      accountId: reviewEvent.accountId,
      categoryId: reviewEvent.categoryId
    },
    selectedDuplicateResolution: null,
    selectedObligationId: null,
    resolutionErrorCode: null,
    createdAt: now,
    resolvedAt: null,
    updatedAt: now
  });
  const tracking = {
    events: [automaticEvent, reviewEvent],
    reviews: [review],
    history: [
      trackingHistoryEntrySchema.parse({
        id: 'demo-tracking-history-auto',
        detectedEventId: automaticEvent.id,
        action: 'auto_added',
        reasonCodes: automaticEvent.reasonCodes,
        occurredAt: automaticEvent.occurredAt
      }),
      trackingHistoryEntrySchema.parse({
        id: 'demo-tracking-history-review',
        detectedEventId: reviewEvent.id,
        action: 'sent_to_review',
        reasonCodes: reviewEvent.reasonCodes,
        occurredAt: reviewEvent.occurredAt
      })
    ],
    feedback: [
      automaticFeedbackSchema.parse({
        id: 'demo-tracking-feedback',
        detectedEventId: automaticEvent.id,
        transactionId: automaticEvent.transactionId,
        kind: 'transaction_added',
        undoExpiresAt: now + 30_000,
        notificationOutcome: 'delivered_mock',
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
    ],
    senders: [
      senderRuleSchema.parse({
        id: 'demo-sender-bank',
        normalizedSender: 'masarifibank',
        displayLabel: finance.accounts[2].institution ?? 'Masarifi Bank',
        institutionKey: 'masarifi',
        origin: 'recognized',
        enabled: true,
        trusted: true,
        recentUseCount: 8,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now
      })
    ]
  };
  const notifications = [
    notificationEventSchema.parse({
      id: 'demo-notification-transaction',
      eventKey: 'demo-notification-transaction-v1',
      category: 'transaction',
      eventType: 'tracking.expense.added',
      titleKey: 'notifications.tracking.expense.added.title',
      bodyKey: 'notifications.tracking.expense.added.body',
      messageValues: { merchant: finance.transactions[2].merchant ?? '' },
      sensitivity: 'protected',
      target: { kind: 'transaction', transactionId: 'demo-transaction-3' },
      availableActions: [{ kind: 'view', expiresAt: null, sourceVersion: 1 }],
      occurredAt: now,
      readAt: null,
      deletedAt: null,
      phoneStatus: 'not_requested',
      syncStatus: 'synced',
      safeFailure: null
    }),
    notificationEventSchema.parse({
      id: 'demo-notification-budget',
      eventKey: 'demo-notification-budget-v1',
      category: 'budget',
      eventType: 'budget.progress',
      titleKey: 'notifications.fallback.title',
      bodyKey: 'notifications.fallback.body',
      messageValues: {},
      sensitivity: 'protected',
      target: { kind: 'budget', budgetId: 'demo-budget-current' },
      availableActions: [{ kind: 'view', expiresAt: null, sourceVersion: 1 }],
      occurredAt: now - 60_000,
      readAt: null,
      deletedAt: null,
      phoneStatus: 'not_requested',
      syncStatus: 'synced',
      safeFailure: null
    })
  ];

  return {
    finance,
    planning: createDemoFinancialPlanningSeed(now, timeZone, locale),
    tracking,
    notifications,
    notificationPreferences: createNotificationPreferences(now)
  };
}
