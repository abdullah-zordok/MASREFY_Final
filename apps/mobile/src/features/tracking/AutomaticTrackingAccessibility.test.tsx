import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';

import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import { renderWithQueryData } from '@/test-utils/render';
import { translate } from '@/localization/i18n';
import { TrackingStatusScreen } from './TrackingStatusScreen';

describe('automatic tracking accessibility', () => {
  it('exposes named 44px actions for Arabic and English status flows', async () => {
    renderWithQueryData(<TrackingStatusScreen />, [
      [
        automaticTrackingKeys.status,
        {
          platform: 'android',
          mode: 'automatic_clear',
          permissionStatus: 'granted',
          serviceState: 'healthy',
          lastDetectedAt: null,
          lastSuccessfulTransactionId: null,
          detectedThisMonth: 999,
          reviewCount: 0,
          activeKeywordCount: 1,
          activeSenderCount: 1,
          lastUpdatedAt: 1
        }
      ]
    ]);

    expect(
      await screen.findByLabelText(translate('tracking.status.mode'))
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.howItWorks.detection'))
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('999')).toBeNull());
  });
});
