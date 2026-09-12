import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import { translate } from '@/localization/i18n';
import { AppBar, BrandedScreenHeader, ContextMenu } from './AppNavigation';

describe('AppNavigation', () => {
  it('renders app bar actions with accessible names and directional mirroring', () => {
    const onBack = jest.fn();
    const screen = renderWithProviders(
      <>
        <AppBar
          title="Accounts"
          onBack={onBack}
          onOverflow={jest.fn()}
          direction="rtl"
        />
        <ContextMenu items={[{ label: 'Edit', onPress: jest.fn() }]} />
      </>
    );

    fireEvent.press(
      screen.getByLabelText(translate('appShell.navigation.back', 'ar'))
    );
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Accounts')).toBeTruthy();
    expect(
      screen.getByLabelText(
        translate('designSystem.navigation.moreOptions', 'ar')
      )
    ).toBeTruthy();
    expect(screen.getByTestId('app-bar')).toHaveStyle({
      direction: 'ltr',
      flexDirection: 'row-reverse'
    });
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('keeps branded back navigation at the Android minimum touch target', () => {
    const screen = renderWithProviders(
      <BrandedScreenHeader
        compact
        direction="rtl"
        onBack={jest.fn()}
        testID="compact-header"
        title="الحسابات"
        titleAlignEnd
      />
    );

    expect(screen.getByTestId('compact-header')).toHaveStyle({
      flexDirection: 'row-reverse',
      paddingBottom: 8,
      paddingTop: 8
    });
    expect(screen.getByText('الحسابات')).toHaveStyle({
      alignSelf: 'stretch',
      textAlign: 'right',
      width: '100%'
    });
    expect(
      screen.getByLabelText(translate('appShell.navigation.back', 'ar'))
    ).toHaveStyle({ height: 48, width: 48 });
  });
});
