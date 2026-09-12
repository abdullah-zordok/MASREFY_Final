import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { DuplicateComparison } from './DuplicateComparison';
import { ReviewDetail } from './ReviewDetail';
import { ReviewQueue } from './ReviewQueue';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() }
}));

describe('ReviewJourney', () => {
  it('opens review items and renders duplicate actions accessibly', () => {
    renderWithQueryData(<ReviewQueue />, [
      [
        automaticTrackingKeys.duplicates(),
        [
          {
            id: 'duplicate-1',
            detectedEventId: 'event-1',
            existingTransactionId: 'transaction-1',
            probabilityBasisPoints: 9_200,
            reasonCodes: ['amount'],
            resolution: null,
            status: 'pending',
            resolvedAt: null
          }
        ]
      ],
      [
        automaticTrackingKeys.review(),
        {
          items: [
            {
              id: 'review-1',
              detectedEventId: 'event-1',
              status: 'pending',
              reasonCodes: ['duplicate'],
              missingFields: [],
              proposedValues: {
                amountMinor: 12_500,
                currencyCode: 'SAR',
                merchant: 'Corner Market'
              },
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

    fireEvent.press(
      screen.getByLabelText(
        new RegExp(translate('tracking.reason.duplicate'))
      )
    );
    expect(router.push).toHaveBeenCalledWith('/tracking/duplicates/duplicate-1');
    expect(
      screen.getByText(translate('tracking.reason.duplicate'))
    ).toBeOnTheScreen();
    expect(screen.getByText('Corner Market')).toBeOnTheScreen();
    expect(screen.getByText(/125/)).toBeOnTheScreen();
    expect(screen.queryByText('duplicate')).toBeNull();

    renderWithQueryData(<DuplicateComparison id="duplicate-1" />, [
      [
        automaticTrackingKeys.duplicate('duplicate-1'),
        {
          id: 'duplicate-1',
          detectedEventId: 'event-1',
          existingTransactionId: 'transaction-1',
          probabilityBasisPoints: 9_200,
          reasonCodes: ['amount'],
          resolution: null,
          status: 'pending',
          resolvedAt: null
        }
      ],
      [coreFinanceKeys.transaction('transaction-1'), fixtureTransactions[1]]
    ]);

    expect(
      screen.getByLabelText(translate('tracking.duplicate.keepExisting'))
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(translate('tracking.duplicate.merge'))
    ).toBeOnTheScreen();
    expect(screen.queryByText('transaction-1')).toBeNull();
  });

  it('shows an unavailable queue amount until the currency is detected', () => {
    renderWithQueryData(<ReviewQueue />, [
      [automaticTrackingKeys.duplicates(), []],
      [
        automaticTrackingKeys.review(),
        {
          items: [
            {
              id: 'review-missing-currency',
              detectedEventId: 'event-missing-currency',
              status: 'pending',
              reasonCodes: ['missing_fields'],
              missingFields: ['currency'],
              proposedValues: {
                amountMinor: 12_500,
                merchant: 'Corner Market'
              },
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

    expect(screen.getByText(translate('tracking.review.notDetected'))).toBeTruthy();
    expect(screen.queryByText(/SAR/)).toBeNull();
  });

  it('shows an unavailable detail amount until the currency is detected', () => {
    const item = {
      id: 'review-detail-missing-currency',
      detectedEventId: 'event-detail-missing-currency',
      status: 'pending' as const,
      reasonCodes: ['missing_fields'],
      missingFields: ['currency'],
      proposedValues: {
        amountMinor: 12_500,
        merchant: 'Corner Market',
        accountId: fixtureAccounts[0].id,
        categoryId: 'food'
      },
      selectedDuplicateResolution: null,
      selectedObligationId: null,
      resolutionErrorCode: null,
      createdAt: 1,
      resolvedAt: null,
      updatedAt: 1
    };
    renderWithQueryData(<ReviewDetail id={item.id} />, [
      [automaticTrackingKeys.reviewItem(item.id), item],
      [coreFinanceKeys.accounts(true), fixtureAccounts],
      [coreFinanceKeys.categories(true), fixtureCategories]
    ]);

    expect(screen.getByText(translate('tracking.review.notDetected'))).toBeTruthy();
    expect(screen.queryByText(/SAR/)).toBeNull();
  });
});
