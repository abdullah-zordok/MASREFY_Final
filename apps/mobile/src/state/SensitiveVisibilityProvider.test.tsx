import React, { useEffect } from 'react';
import { AppState, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import { usePreferenceStore } from '@/state/preferences';
import { SensitiveVisibilityProvider, useSensitiveVisibility } from './SensitiveVisibilityProvider';

describe('SensitiveVisibilityProvider', () => {
  beforeEach(() => usePreferenceStore.setState({ hideBalances: false }));

  it.each([
    [false, 'revealed'],
    [true, 'masked']
  ] as const)('derives financial visibility from hideBalances=%s', (hideBalances, expected) => {
    usePreferenceStore.setState({ hideBalances });

    function Harness() {
      const { revealed } = useSensitiveVisibility();
      return <Text>{revealed ? 'revealed' : 'masked'}</Text>;
    }

    const screen = renderWithProviders(<Harness />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('masks immediately when Hide Balances is enabled', () => {
    function Harness() {
      const { revealed } = useSensitiveVisibility();
      return <Text>{revealed ? 'revealed' : 'masked'}</Text>;
    }

    const screen = renderWithProviders(<Harness />);
    expect(screen.getByText('revealed')).toBeTruthy();

    act(() => usePreferenceStore.setState({ hideBalances: true }));
    expect(screen.getByText('masked')).toBeTruthy();
  });

  it('resets active reveal on background cleanup', () => {
    usePreferenceStore.setState({ hideBalances: true });
    function Harness() {
      const { revealed, reveal, reset } = useSensitiveVisibility();
      return (
        <>
          <Text>{revealed ? 'revealed' : 'masked'}</Text>
          <Text accessibilityLabel="Reveal" onPress={reveal}>Reveal</Text>
          <Text accessibilityLabel="Reset" onPress={reset}>Reset</Text>
        </>
      );
    }

    const screen = renderWithProviders(
      <SensitiveVisibilityProvider>
        <Harness />
      </SensitiveVisibilityProvider>
    );
    fireEvent.press(screen.getByLabelText('Reveal'));
    expect(screen.getByText('revealed')).toBeTruthy();
    act(() => fireEvent.press(screen.getByLabelText('Reset')));
    expect(screen.getByText('masked')).toBeTruthy();
  });

  it('replaces sensitive content with a privacy shield outside the active state', () => {
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, next) => {
      listener = next as (state: string) => void;
      return { remove: jest.fn() };
    });
    const view = render(<SensitiveVisibilityProvider><Text>private question text</Text></SensitiveVisibilityProvider>);
    act(() => listener?.('background'));
    expect(view.queryByText('private question text')).toBeNull();
    expect(view.getByTestId('privacy-shield')).toBeTruthy();
    act(() => listener?.('active'));
    expect(view.getByText('private question text')).toBeTruthy();
  });

  it('keeps protected content mounted while the privacy shield is visible', () => {
    let listener: ((state: string) => void) | undefined;
    let unmounts = 0;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, next) => {
      listener = next as (state: string) => void;
      return { remove: jest.fn() };
    });
    function ProtectedContent() {
      useEffect(() => () => {
        unmounts += 1;
      }, []);
      return <Text>mounted private content</Text>;
    }
    const view = render(
      <SensitiveVisibilityProvider><ProtectedContent /></SensitiveVisibilityProvider>
    );

    act(() => listener?.('background'));

    expect(unmounts).toBe(0);
    expect(view.getByTestId('privacy-shield')).toBeTruthy();
    act(() => listener?.('active'));
    expect(view.getByText('mounted private content')).toBeTruthy();
  });
});
