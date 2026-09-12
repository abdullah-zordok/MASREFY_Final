import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import { changeLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { AppSheet, shouldDismissMenuSheet } from './AppSheet';
import { ConfirmationDialog } from './ConfirmationDialog';
import { PickerOverlay, VoiceRecordingOverlay } from './PickerOverlays';

describe('overlays', () => {
  beforeEach(() => {
    changeLocale('en');
    usePreferenceStore.setState({ locale: 'en', direction: 'ltr' });
  });

  it('renders sheet focus content, dismiss, keyboard-safe wrapper, and dialog actions', () => {
    const onDismiss = jest.fn();
    const onConfirm = jest.fn();
    const screen = renderWithProviders(
      <>
        <AppSheet title="Choose account" visible onDismiss={onDismiss}>
          <PickerOverlay
            title="Accounts"
            options={['Main']}
            onSelect={onConfirm}
          />
          <VoiceRecordingOverlay title="Voice note" recording />
        </AppSheet>
        <ConfirmationDialog
          visible
          title="Delete transaction"
          message="This cannot be undone"
          confirmLabel="Delete permanently"
          destructive
          onCancel={onDismiss}
          onConfirm={onConfirm}
        />
      </>
    );

    expect(screen.getByLabelText('Choose account')).toBeTruthy();
    expect(screen.getByTestId('app-sheet-modal').props.visible).toBe(true);
    fireEvent.press(
      screen.getByTestId('app-sheet-backdrop', { includeHiddenElements: true })
    );
    expect(screen.getByText('Voice note')).toBeTruthy();
    expect(screen.getByText('Recording')).toBeTruthy();
    fireEvent.press(
      screen.getByLabelText(translate('appShell.navigation.close'))
    );
    expect(
      screen.getByLabelText(translate('appShell.navigation.close'))
    ).toHaveStyle({ height: 48, width: 48 });
    fireEvent.press(screen.getByLabelText('Main'));
    fireEvent.press(screen.getByLabelText('Delete permanently'));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('renders the menu sheet treatment and owns a downward drag gesture', () => {
    const onDismiss = jest.fn();
    const screen = renderWithProviders(
      <AppSheet appearance="menu" title="All accounts" visible onDismiss={onDismiss}>
        <></>
      </AppSheet>
    );

    expect(screen.getByTestId('app-sheet-menu')).toBeTruthy();
    expect(screen.getByText('All accounts')).toHaveStyle({
      fontFamily: 'MasarifiLatin-700'
    });
    const handle = screen.getByTestId('app-sheet-handle');
    expect(handle).toBeTruthy();
    expect(
      screen.UNSAFE_getAllByType(View).filter((view) => {
        const style = StyleSheet.flatten(view.props.style);
        return style?.height === 4 && style?.width === 36;
      })
    ).toHaveLength(1);
    expect(
      screen.queryByLabelText(translate('appShell.navigation.close'))
    ).toBeNull();
    expect(handle.props.onResponderRelease).toEqual(expect.any(Function));
    expect(shouldDismissMenuSheet(96, 0)).toBe(true);
    expect(shouldDismissMenuSheet(12, 1)).toBe(true);
    expect(shouldDismissMenuSheet(12, 0.2)).toBe(false);
  });

  it('applies RTL layout direction inside the modal sheet', () => {
    changeLocale('ar');
    usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });

    const screen = renderWithProviders(
      <AppSheet appearance="menu" title="اختر الحساب" visible onDismiss={jest.fn()}>
        <></>
      </AppSheet>
    );

    expect(screen.getByTestId('app-sheet-menu')).toHaveStyle({
      direction: 'rtl'
    });
    expect(screen.getByText('اختر الحساب')).toHaveStyle({
      textAlign: 'right',
      writingDirection: 'rtl'
    });
  });

  it('snaps back without a spring when reduced motion is enabled', () => {
    usePreferenceStore.setState({ reducedMotion: true });
    const spring = jest.spyOn(Animated, 'spring');
    const screen = renderWithProviders(
      <AppSheet appearance="menu" title="All accounts" visible onDismiss={jest.fn()}>
        <></>
      </AppSheet>
    );

    act(() => {
      screen.getByTestId('app-sheet-handle').props.onResponderRelease({}, {
        dy: 12,
        vy: 0.2
      });
    });

    expect(spring).not.toHaveBeenCalled();
    spring.mockRestore();
  });
});
