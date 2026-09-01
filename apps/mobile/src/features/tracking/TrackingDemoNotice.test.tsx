import React from 'react';
import { screen } from '@testing-library/react-native';

import { changeLocale, translate } from '@/localization/i18n';
import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import { renderWithQueryData } from '@/test-utils/render';
import { ReviewQueue } from './ReviewQueue';
import { TrackingHistoryList } from './TrackingHistoryList';

const previousDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE;

beforeEach(() => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  changeLocale('en');
});

afterAll(() => {
  if (previousDemoMode === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
  else process.env.EXPO_PUBLIC_DEMO_MODE = previousDemoMode;
});

it('labels demo tracking history visibly and for assistive technology', () => {
  renderWithQueryData(<TrackingHistoryList />, [
    [
      automaticTrackingKeys.history(),
      {
        items: [
          {
            id: 'demo-history',
            detectedEventId: 'demo-event',
            action: 'auto_added',
            reasonCodes: ['clear_success'],
            occurredAt: 1
          }
        ],
        total: 1,
        nextCursor: null
      }
    ]
  ]);

  const label = translate('tracking.status.demo');
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByLabelText(label)).toBeTruthy();
});

it('labels Arabic demo review results visibly and for assistive technology', () => {
  changeLocale('ar');
  renderWithQueryData(<ReviewQueue />, [
    [
      automaticTrackingKeys.review(),
      {
        items: [
          {
            id: 'demo-review',
            detectedEventId: 'demo-event',
            status: 'pending',
            reasonCodes: ['missing_fields'],
            missingFields: ['merchant'],
            proposedValues: { amountMinor: 100, currencyCode: 'SAR' },
            selectedDuplicateResolution: null,
            selectedObligationId: null,
            resolutionErrorCode: null,
            createdAt: 1,
            resolvedAt: null,
            updatedAt: 1
          }
        ],
        total: 1,
        nextCursor: null
      }
    ]
  ]);

  const label = translate('tracking.status.demo');
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByLabelText(label)).toBeTruthy();
});
