import React from 'react';
import { screen } from '@testing-library/react-native';
import { changeLocale } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { VoiceBatchStatus } from './VoiceBatchStatus';
import type { useVoiceBatches } from './useVoiceBatches';
import type { VoiceBatchResult } from '@/services/live/voice-batch-api-service';

const tx = '33333333-3333-4333-8333-333333333333';
const latest = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  batchId: '22222222-2222-4222-8222-222222222222',
  status: 'completed' as const,
  addedCount: 1,
  transactionIds: [tx],
  ledgerVersion: 1,
  outcomes: [
    {
      ordinal: 0,
      kind: 'expense' as const,
      status: 'committed' as const,
      reason: null,
      transactionId: tx
    },
    {
      ordinal: 1,
      kind: null,
      status: 'skipped' as const,
      reason: 'ambiguous_account' as const,
      transactionId: null
    },
    {
      ordinal: 2,
      kind: null,
      status: 'skipped' as const,
      reason: 'unsupported_event' as const,
      transactionId: null
    }
  ]
};
const fixture = (
  result: VoiceBatchResult = latest
): ReturnType<typeof useVoiceBatches> => ({
  latest: result,
  results: [result],
  pendingIds: [],
  cancelIds: [],
  uncertain: false,
  localFailure: false,
  localFailureCode: undefined,
  processing: false,
  submit: () => undefined,
  recover: async () => undefined,
  cancel: async () => undefined
});
it.each([
  [
    'en',
    'Event 1: Saved',
    'Event 2: Not added — the account could not be identified.',
    'Event 3: Not added — this event type is not supported.'
  ],
  [
    'ar',
    'الحدث 1: تم الحفظ',
    'الحدث 2: لم يُضف — تعذّر تحديد الحساب.',
    'الحدث 3: لم يُضف — نوع الحدث غير مدعوم.'
  ]
] as const)(
  'shows each authoritative saved/skipped outcome in %s without a confirmation action',
  (locale, saved, ambiguous, unsupported) => {
    changeLocale(locale);
    renderWithProviders(<VoiceBatchStatus batches={fixture()} />);
    expect(screen.getByText(saved)).toBeTruthy();
    expect(screen.getByText(ambiguous)).toBeTruthy();
    expect(screen.getByText(unsupported)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  }
);

it('keeps waiting, cancelled and failed occurrences distinct', () => {
  changeLocale('en');
  renderWithProviders(
    <VoiceBatchStatus
      batches={fixture({
        ...latest,
        status: 'finalizing',
        addedCount: 0,
        transactionIds: [],
        ledgerVersion: 0,
        outcomes: [
          {
            ordinal: 0,
            kind: 'expense',
            status: 'eligible',
            reason: null,
            transactionId: null
          },
          {
            ordinal: 1,
            kind: null,
            status: 'cancelled',
            reason: null,
            transactionId: null
          },
          {
            ordinal: 2,
            kind: null,
            status: 'execution_failed',
            reason: null,
            transactionId: null
          }
        ]
      })}
    />
  );
  expect(screen.getByText('Event 1: Waiting to finish')).toBeTruthy();
  expect(screen.getByText('Event 2: Cancelled — not added')).toBeTruthy();
  expect(
    screen.getByText('Event 3: Could not finish — not added')
  ).toBeTruthy();
  expect(screen.queryByText('Event 1: Saved')).toBeNull();
});

it.each([
  { ledgerVersion: 0 },
  { addedCount: 2, transactionIds: [tx, tx] },
  { transactionIds: ['44444444-4444-4444-8444-444444444444'] }
])(
  'does not label an occurrence saved without a matching authoritative receipt %#',
  (invalid) => {
    changeLocale('en');
    renderWithProviders(
      <VoiceBatchStatus batches={fixture({ ...latest, ...invalid })} />
    );
    expect(screen.queryByText('Event 1: Saved')).toBeNull();
  }
);
