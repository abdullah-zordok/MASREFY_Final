import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import { translate } from '@/localization/i18n';
import { AppBar, ContextMenu } from './AppNavigation';

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
});
