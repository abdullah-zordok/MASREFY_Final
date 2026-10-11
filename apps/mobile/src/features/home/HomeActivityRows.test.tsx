import React from 'react';
import { PixelRatio, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { makeTransaction } from '@/test-utils/core-finance-fixtures';
import { HomeActivityRows } from './HomeActivityRows';
import { HomeActivityScrollView } from './HomeActivityViewport';

afterEach(() => jest.restoreAllMocks());

it('keeps a measured tall row visible while scrolling within it instead of trusting the estimate', () => {
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
  const transactions = Array.from({ length: 120 }, (_, index) => ({
    transaction: makeTransaction(index + 1, { title: `Tall row ${index + 1}` }),
    group: 'expense' as const,
    sign: 'negative' as const
  }));
  render(
    <HomeActivityScrollView>
      <HomeActivityRows
        transactions={transactions}
        offset={0}
        largeText
        renderRow={({ transaction }) => <Text>{transaction.title}</Text>}
      />
    </HomeActivityScrollView>
  );
  const scroll = screen.getByTestId('home-scroll');
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 600 } } });
  fireEvent(screen.getByText('Tall row 1').parent!, 'layout', {
    nativeEvent: { layout: { height: 1000 } }
  });
  fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 900 } } });
  expect(screen.getByText('Tall row 1')).toBeTruthy();
  expect(screen.queryByText('Tall row 120')).toBeNull();
});
