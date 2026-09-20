import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';

import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { elevation, lightThemeColors } from '@/design-system/tokens';
import { changeLocale } from '@/localization/i18n';
import { fixtureCategories } from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { CategorySelectionScreen } from './CategorySelectionScreen';

beforeEach(() => changeLocale('en'));

function renderScreen(
  props: Partial<React.ComponentProps<typeof CategorySelectionScreen>> = {},
  categories = fixtureCategories
) {
  const onBack = jest.fn();
  const onSelect = jest.fn();
  renderWithQueryData(
    <CategorySelectionScreen
      excludedIds={[]}
      onBack={onBack}
      onSelect={onSelect}
      selectedId="food"
      {...props}
    />,
    [[coreFinanceKeys.categories(true), categories]]
  );
  return { onBack, onSelect };
}

it('groups real favorites above other categories and marks the current choice', () => {
  renderScreen();

  expect(screen.getByRole('header', { name: 'Category' })).toBeTruthy();
  expect(screen.getByPlaceholderText('Search categories...')).toBeTruthy();
  expect(screen.getByText('Most Used')).toBeTruthy();
  expect(screen.getByText('Others')).toBeTruthy();
  expect(
    screen.getByTestId('category-selection-row-food')
  ).toHaveAccessibilityState({
    selected: true
  });
  expect(
    within(screen.getByTestId('category-selection-most-used')).getByText('Food')
  ).toBeTruthy();
  expect(
    within(screen.getByTestId('category-selection-others')).getByText(
      'Shopping'
    )
  ).toBeTruthy();
  expect(screen.queryByText('System category')).toBeNull();
  expect(screen.queryByText('Favorite')).toBeNull();
  expect(screen.getByTestId('category-selection-most-used')).toHaveStyle({
    backgroundColor: lightThemeColors.surfaces.card,
    shadowOpacity: elevation.card.shadowOpacity
  });
});

it('searches existing categories, honors exclusions, and returns the chosen id', () => {
  const { onSelect } = renderScreen({ excludedIds: ['food'] });

  fireEvent.changeText(
    screen.getByPlaceholderText('Search categories...'),
    'Shop'
  );

  expect(screen.queryByText('Food')).toBeNull();
  fireEvent.press(screen.getByTestId('category-selection-row-shopping'));
  expect(onSelect).toHaveBeenCalledWith('shopping');
});

it('omits Most Used when no active favorite exists', () => {
  renderScreen(
    {},
    fixtureCategories.map((category) => ({
      ...category,
      isFavorite: false
    }))
  );

  expect(screen.queryByText('Most Used')).toBeNull();
  expect(screen.getByText('Others')).toBeTruthy();
});

it('supports Back and an explicit no-parent result', () => {
  const { onBack, onSelect } = renderScreen({ allowClear: true });

  fireEvent.press(screen.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalledTimes(1);

  fireEvent.press(screen.getByText('No parent category'));
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('mirrors the header and rows for Arabic', () => {
  changeLocale('ar');
  renderScreen();

  expect(screen.getByRole('header', { name: 'الفئة' })).toBeTruthy();
  expect(screen.getByPlaceholderText('ابحث عن الفئات...')).toBeTruthy();
  expect(screen.getByTestId('category-selection-header')).toHaveStyle({
    flexDirection: 'row-reverse'
  });
  expect(screen.getByTestId('category-selection-row-food')).toHaveStyle({
    flexDirection: 'row-reverse'
  });
});
