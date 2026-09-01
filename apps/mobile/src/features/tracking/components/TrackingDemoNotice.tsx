import React from 'react';

import { StyledText } from '@/components/StyledText';
import { isDemoModeEnabled } from '@/config/demo-mode';
import { colorTokens } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';

export function TrackingDemoNotice() {
  if (!isDemoModeEnabled()) return null;
  const label = translate('tracking.status.demo');
  return (
    <StyledText
      accessibilityLabel={label}
      style={{ color: colorTokens.status.warning, fontWeight: '600' }}
      variant="caption"
    >
      {label}
    </StyledText>
  );
}
