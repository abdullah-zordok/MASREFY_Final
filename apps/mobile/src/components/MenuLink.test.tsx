import React from 'react';
import { View } from 'react-native';

import { MenuLink } from './MenuLink';
import { renderWithProviders } from '@/test-utils/render';
import { changeLocale } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

afterEach(() => {
  changeLocale('en');
  usePreferenceStore.setState({ direction: 'ltr', locale: 'en' });
});

describe('MenuLink', () => {
  it('forwards its native ref for Expo Router Link asChild', () => {
    const ref = React.createRef<View>();

    renderWithProviders(<MenuLink ref={ref} label="Destination" />);

    expect(ref.current).not.toBeNull();
  });

  it('aligns Arabic menu labels beside the right-side icon', () => {
    changeLocale('ar');
    usePreferenceStore.setState({ direction: 'rtl', locale: 'ar' });
    const screen = renderWithProviders(<MenuLink label="الوجهة" showChevron />);

    expect(screen.getByRole('link')).toHaveStyle({
      direction: 'ltr',
      flexDirection: 'row-reverse'
    });
    expect(screen.getByTestId('menu-link-text')).toHaveStyle({
      alignItems: 'flex-end'
    });
  });
});
