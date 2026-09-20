import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import {
  elevation,
  lightThemeColors,
  minTouchTarget,
  radius
} from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { GroupedList, NavigationRow } from './GroupedList';

describe('GroupedList and NavigationRow', () => {
  it('renders one accessible row target with slots, disabled state, and minimum target', () => {
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    const onPress = jest.fn();
    const screen = renderWithProviders(
      <GroupedList label="Settings group">
        <NavigationRow
          label="Privacy"
          description="Hidden balances and app lock"
          value="On"
          status="Protected"
          onPress={onPress}
        />
        <NavigationRow label="Disabled row" disabled onPress={jest.fn()} />
      </GroupedList>
    );

    const row = screen.getByLabelText(
      'Privacy, Hidden balances and app lock, On, Protected'
    );
    fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Settings group')).toHaveStyle({
      backgroundColor: lightThemeColors.surfaces.card,
      borderColor: lightThemeColors.borders.default,
      borderRadius: radius.card,
      shadowOpacity: elevation.card.shadowOpacity
    });
    expect(row).toHaveStyle({ minHeight: minTouchTarget });
    expect(row).toHaveStyle({ flexDirection: 'row-reverse' });
    expect(
      screen.getByLabelText('Disabled row').props.accessibilityState
    ).toMatchObject({
      disabled: true
    });
    expect(screen.getAllByText('‹')).toHaveLength(2);
    fontScale.mockRestore();
  });

  it('stacks row slots before financial values start wrapping', () => {
    const fontScale = jest
      .spyOn(PixelRatio, 'getFontScale')
      .mockReturnValue(1.3);
    const screen = renderWithProviders(
      <NavigationRow label="Category" value="A long category name" />
    );
    expect(screen.getByLabelText('Category, A long category name')).toHaveStyle(
      {
        flexDirection: 'column'
      }
    );
    fontScale.mockRestore();
  });
});
