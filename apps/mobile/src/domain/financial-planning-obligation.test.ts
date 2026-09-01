import { deriveObligationStatus } from './financial-planning';
import {
  fixtureObligation,
  fixturePayment,
  fixtureSchedule,
  planningToday
} from '@/test-utils/financial-planning-fixtures';

it('derives obligation status without inventing open-ended totals', () => {
  const fixed = deriveObligationStatus({
    obligation: fixtureObligation,
    schedule: fixtureSchedule,
    payments: [fixturePayment],
    today: planningToday
  });
  expect(fixed.remainingMinor.status).toBe('available');
  const openEnded = deriveObligationStatus({
    obligation: {
      ...fixtureObligation,
      scheduleKind: 'open_ended',
      contractedTotalMinor: null
    },
    schedule: [],
    payments: [],
    today: planningToday
  });
  expect(openEnded.remainingMinor.status).toBe('unavailable');
});

it('marks obligation paid and remaining amounts unavailable on unsafe sums', () => {
  const status = deriveObligationStatus({
    obligation: {
      ...fixtureObligation,
      openingPaidMinor: Number.MAX_SAFE_INTEGER
    },
    schedule: fixtureSchedule,
    payments: [
      {
        ...fixturePayment,
        amountMinor: 1,
        settlementAdjustmentMinor: 0,
        status: 'posted'
      }
    ],
    today: planningToday
  });

  expect(status.paidMinor).toBeNull();
  expect(status.remainingMinor).toEqual({
    status: 'unavailable',
    reason: 'missing_data'
  });
});
