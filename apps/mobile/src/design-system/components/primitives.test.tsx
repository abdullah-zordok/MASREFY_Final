import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import {
  colorTokens,
  elevation,
  lightThemeColors,
  minTouchTarget,
  radius
} from '@/design-system/tokens';
import { ActionButton } from './ActionButton';
import { IconButton } from './IconButton';
import { SurfaceCard } from './SurfaceCard';
import { StatusBadge } from './StatusBadge';

describe('design-system primitives', () => {
  it('exposes accessible button names and minimum targets', () => {
    const onPress = jest.fn();
    const screen = renderWithProviders(
      <ActionButton label="Save changes" onPress={onPress} />
    );

    const button = screen.getByLabelText('Save changes');
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).toHaveStyle({ minHeight: 48 });
  });

  it('disables loading buttons without losing their name', () => {
    const onPress = jest.fn();
    const screen = renderWithProviders(
      <ActionButton label="Save changes" loading onPress={onPress} />
    );

    const button = screen.getByLabelText('Save changes');
    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true
    });
  });

  it('supports icon-only buttons with explicit labels', () => {
    const screen = renderWithProviders(
      <IconButton icon="search" label="Search transactions" onPress={jest.fn()} />
    );

    expect(screen.getByLabelText('Search transactions')).toHaveStyle({
      minHeight: minTouchTarget,
      minWidth: minTouchTarget
    });
  });

  it('uses the shared elevated card treatment', () => {
    const screen = renderWithProviders(
      <SurfaceCard testID="surface-card">Content</SurfaceCard>
    );

    expect(screen.getByTestId('surface-card')).toHaveStyle({
      backgroundColor: lightThemeColors.surfaces.card,
      borderColor: lightThemeColors.borders.default,
      borderRadius: radius.card,
      borderWidth: 1,
      shadowOpacity: elevation.card.shadowOpacity
    });
  });

  it('renders status badges with non-color text cues', () => {
    const screen = renderWithProviders(
      <StatusBadge status="warning" label="Needs review" />
    );

    expect(screen.getByText('Needs review')).toBeTruthy();
    expect(screen.getByText('!')).toBeTruthy();
  });

  it('uses an explicit label color without changing the status cue', () => {
    const screen = renderWithProviders(
      <StatusBadge
        status="warning"
        label="Needs review"
        textColor={colorTokens.surface.white}
      />
    );

    expect(screen.getByText('Needs review')).toHaveStyle({
      color: colorTokens.surface.white
    });
    expect(screen.getByText('!')).not.toHaveStyle({
      color: colorTokens.surface.white
    });
  });
});
