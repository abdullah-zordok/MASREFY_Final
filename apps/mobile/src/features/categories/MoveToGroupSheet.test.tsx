import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { changeLocale, translate } from '@/localization/i18n';
import { fixtureCategories } from '@/test-utils/core-finance-fixtures';
import { renderWithProviders } from '@/test-utils/render';
import { MoveToGroupSheet } from './MoveToGroupSheet';

it.each([
  ['ar', { left: 0 }],
  ['en', { right: 0 }]
] as const)('places the close action at logical end in %s', (locale, edge) => {
  changeLocale(locale);
  renderWithProviders(
    <MoveToGroupSheet
      visible
      category={fixtureCategories[0]}
      groups={fixtureCategories}
      onSelectGroup={jest.fn()}
      onNewGroup={jest.fn()}
      onClose={jest.fn()}
    />
  );

  expect(screen.getByLabelText(translate('coreFinance.cancel'))).toHaveStyle(
    edge
  );
});

it('makes the move-to-group sheet a modal region', () => {
  renderWithProviders(
    <MoveToGroupSheet
      visible
      category={fixtureCategories[0]}
      groups={fixtureCategories}
      onSelectGroup={jest.fn()}
      onNewGroup={jest.fn()}
      onClose={jest.fn()}
    />
  );

  expect(screen.getByTestId('move-to-group-sheet')).toHaveProp(
    'accessibilityViewIsModal',
    true
  );
  expect(
    screen.UNSAFE_getByProps({ testID: 'move-to-group-backdrop' }).props
      .accessibilityElementsHidden
  ).toBe(true);
});

it('offers only compatible custom groups and keeps the source for a new group', () => {
  changeLocale('en');
  const source = { ...fixtureCategories[0], kind: 'custom' as const };
  const valid = {
    ...fixtureCategories[1],
    id: 'valid-group',
    kind: 'custom' as const,
    financialType: source.financialType
  };
  const system = { ...valid, id: 'system-group', kind: 'system' as const, labelEn: 'System group' };
  const archived = { ...valid, id: 'archived-group', status: 'archived' as const, labelEn: 'Archived group' };
  const incompatible = {
    ...valid,
    id: 'income-group',
    financialType: source.financialType === 'expense' ? 'income' as const : 'expense' as const,
    labelEn: 'Incompatible group'
  };
  const onNewGroup = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <MoveToGroupSheet
      visible
      category={source}
      groups={[valid, system, archived, incompatible]}
      onSelectGroup={jest.fn()}
      onNewGroup={onNewGroup}
      onClose={onClose}
    />
  );

  expect(screen.getByText(valid.labelEn)).toBeTruthy();
  expect(screen.queryByText(system.labelEn)).toBeNull();
  expect(screen.queryByText(archived.labelEn)).toBeNull();
  expect(screen.queryByText(incompatible.labelEn)).toBeNull();
  fireEvent.press(screen.getByLabelText(translate('coreFinance.categories.newGroup')));
  expect(onNewGroup).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});
