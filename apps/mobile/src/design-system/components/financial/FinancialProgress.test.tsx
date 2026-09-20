import React from 'react';

import { renderWithProviders } from '@/test-utils/render';
import { FinancialProgress } from './FinancialProgress';

describe('financial progress', () => {
  it('renders a compact accessible progress bar without threshold copy', () => {
    const screen = renderWithProviders(
      <FinancialProgress label="Obligation paid" percent={40} compact />
    );

    expect(screen.getByLabelText('Obligation paid 40%')).toBeTruthy();
    expect(screen.queryByText('normal')).toBeNull();
  });

  it.each([
    [40, 'normal'],
    [75, 'warning'],
    [92, 'high'],
    [120, 'exceeded']
  ] as const)('renders %s percent %s threshold with text cues', (percent, threshold) => {
    const screen = renderWithProviders(
      <FinancialProgress label="Budget used" percent={percent} />
    );

    expect(screen.getByText('Budget used')).toBeTruthy();
    expect(screen.getByText(`${percent}%`)).toBeTruthy();
    expect(screen.getByText(threshold)).toBeTruthy();
    expect(screen.getByLabelText(`Budget used ${percent}% ${threshold}`)).toBeTruthy();
  });
});
