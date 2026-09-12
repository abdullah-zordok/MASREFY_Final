import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test-utils/render';
import { changeLocale, translateDynamic as t } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./settings-queries', () => ({
  useSettingsProfile: jest.fn(),
  useSaveSettingsProfile: jest.fn(),
  usePrivacyRequest: jest.fn(),
  useDeleteLocalData: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockQueries = require('./settings-queries') as {
  useSettingsProfile: jest.Mock;
  useSaveSettingsProfile: jest.Mock;
  usePrivacyRequest: jest.Mock;
  useDeleteLocalData: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ApplicationSettingsScreen } =
  require('./ApplicationSettingsScreen') as {
    ApplicationSettingsScreen: React.ComponentType;
  };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrivacySettingsScreen } = require('./PrivacySettingsScreen') as {
  PrivacySettingsScreen: React.ComponentType;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProfileScreen } = require('./ProfileScreen') as {
  ProfileScreen: React.ComponentType;
};

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('en');
  mockQueries.useSettingsProfile.mockReturnValue({
    data: profile(),
    isLoading: false,
    isError: false
  });
  mockQueries.useSaveSettingsProfile.mockReturnValue({
    mutate: jest.fn(),
    isPending: false
  });
  mockQueries.usePrivacyRequest.mockReturnValue({
    mutate: jest.fn(),
    isPending: false
  });
  mockQueries.useDeleteLocalData.mockReturnValue({
    mutate: jest.fn(),
    isPending: false
  });
});

test('profile preserves edits, validates owner fields, and redirects identity-owned values', () => {
  const save = jest.fn();
  mockQueries.useSaveSettingsProfile.mockReturnValue({
    mutate: save,
    isPending: false
  });

  renderWithProviders(<ProfileScreen />);

  expect(screen.getByText(t('settings.profile.title'))).toBeTruthy();
  expect(screen.getByText(t('settings.profile.avatar.default'))).toBeTruthy();
  expect(screen.getByText('+966500000000')).toBeTruthy();
  expect(screen.queryByText(t('settings.profile.google.notLinked'))).toBeNull();
  expect(screen.queryByText('SA')).toBeNull();
  expect(
    screen.queryByText(t('settings.profile.completion.identity'))
  ).toBeNull();
  expect(screen.queryByText(t('settings.profile.googleOwner'))).toBeNull();

  fireEvent.changeText(
    screen.getByLabelText(t('settings.profile.name')),
    'Dana Edited'
  );
  fireEvent.changeText(
    screen.getByLabelText(t('settings.profile.email')),
    'bad-email'
  );
  fireEvent.press(screen.getByText(t('settings.profile.save')));
  expect(screen.getByText(t('settings.profile.validation.email'))).toBeTruthy();
  expect(save).not.toHaveBeenCalled();

  fireEvent.changeText(
    screen.getByLabelText(t('settings.profile.email')),
    'dana@example.com'
  );
  fireEvent.press(screen.getByText(t('settings.profile.save')));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        name: 'Dana Edited',
        timeZone: 'Asia/Riyadh',
        currency: 'SAR'
      }),
      expectedVersion: 1
    })
  );

  fireEvent.press(screen.getByText(t('settings.profile.phone')));
  expect(router.push).toHaveBeenCalledWith('/profile/phone');
  expect(screen.getByText(t('settings.profile.birthday'))).toBeTruthy();
  expect(screen.getByText(t('settings.profile.gender'))).toBeTruthy();
  expect(screen.getByText(t('settings.profile.gender.male'))).toBeTruthy();
  expect(screen.getByText(t('settings.profile.gender.female'))).toBeTruthy();

  fireEvent.press(screen.getByText(t('settings.profile.gender.female')));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ gender: 'female' })
    })
  );
  expect(screen.queryByText(t('settings.profile.applicationOwner'))).toBeNull();
});

test('profile preserves an empty optional email when saving fresh profile fields', () => {
  const save = jest.fn();
  mockQueries.useSettingsProfile.mockReturnValue({
    data: { ...profile(), name: null, email: null },
    isLoading: false,
    isError: false
  });
  mockQueries.useSaveSettingsProfile.mockReturnValue({
    mutate: save,
    isPending: false
  });
  renderWithProviders(<ProfileScreen />);

  fireEvent.changeText(
    screen.getByLabelText(t('settings.profile.name')),
    'New user'
  );
  fireEvent.press(screen.getByText(t('settings.profile.save')));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ name: 'New user', email: null })
    })
  );

  fireEvent.press(screen.getByText(t('settings.profile.gender.female')));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ email: null, gender: 'female' })
    })
  );
});

test('application settings renders controls: language, weekStart, currency, monthStart, defaultAccount, hideBalances', () => {
  renderWithProviders(<ApplicationSettingsScreen />);

  expect(screen.getAllByText(t('settings.application.title'))).toHaveLength(1);
  expect(
    screen.getByLabelText(
      `${t('settings.application.language.en')} ${t('designSystem.state.selected')}`
    )
  ).toBeTruthy();
  [
    'settings.application.language',
    'settings.application.weekStart',
    'settings.application.currency',
    'settings.application.monthStart',
    'settings.application.defaultAccount',
    'settings.application.hideBalances'
  ].forEach((key) =>
    expect(screen.getAllByText(t(key)).length).toBeGreaterThan(0)
  );

  [
    'settings.application.transactionDefaults',
    'settings.application.dashboard',
    'settings.application.trackingOwner',
    'settings.application.voiceOwner',
    'settings.application.reportEmailOwner',
    'settings.application.notificationsOwner',
    'settings.application.reportsOwner'
  ].forEach((key) => expect(screen.queryByText(t(key))).toBeNull());

  // Test navigation to currency selection
  fireEvent.press(
    screen.getByRole('button', {
      name: new RegExp(t('settings.application.currency'))
    })
  );
  expect(router.push).toHaveBeenCalledWith('/settings/currency');

  // Test navigation to month start day selection
  fireEvent.press(
    screen.getByRole('button', {
      name: new RegExp(t('settings.application.monthStart'))
    })
  );
  expect(router.push).toHaveBeenCalledWith('/settings/month-start');

  // Test dropdown open and option selection
  const defaultAccountTrigger = screen.getByRole('button', {
    name: new RegExp(t('settings.application.defaultAccount')),
    expanded: false
  });
  fireEvent.press(defaultAccountTrigger);
  expect(
    screen.getByRole('button', {
      name: new RegExp(t('settings.application.defaultAccount')),
      expanded: true
    })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', {
      name: t('settings.application.defaultAccount.none'),
      selected: true
    })
  ).toBeTruthy();
});

test('anchors Arabic application settings to the physical right edge', () => {
  changeLocale('ar');
  usePreferenceStore.setState({ direction: 'rtl', locale: 'ar' });

  const rendered = renderWithProviders(<ApplicationSettingsScreen />);

  expect(screen.getByTestId('application-settings-regional-group')).toHaveStyle(
    { alignItems: 'flex-end', direction: 'ltr' }
  );

  rendered.unmount();
  usePreferenceStore.setState({ direction: 'ltr', locale: 'en' });
  changeLocale('en');
});

test('privacy settings requests export/deletion and local deletion without false completion claims', () => {
  const request = jest.fn();
  const localDelete = jest.fn();
  mockQueries.usePrivacyRequest.mockReturnValue({
    mutate: request,
    isPending: false
  });
  mockQueries.useDeleteLocalData.mockReturnValue({
    mutate: localDelete,
    isPending: false
  });

  renderWithProviders(<PrivacySettingsScreen />);

  expect(screen.getByText(t('settings.privacy.title'))).toBeTruthy();
  expect(screen.getByText(t('settings.privacy.legalExplanation'))).toBeTruthy();
  expect(screen.getByText(t('settings.privacy.tracking.enabled'))).toBeTruthy();
  expect(
    screen.getByText(t('settings.privacy.assistantPersonalization.enabled'))
  ).toBeTruthy();
  expect(screen.getByLabelText(t('settings.privacy.analytics'))).toBeTruthy();
  fireEvent.press(screen.getByText(t('settings.privacy.tracking')));
  expect(
    screen.getByText(t('settings.privacy.tracking.disabled'))
  ).toBeTruthy();

  fireEvent.press(screen.getByText(t('settings.privacy.exportReview')));
  expect(request).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(t('settings.privacy.confirmRequest')));
  fireEvent.press(
    screen.getByText(t('settings.privacy.accountDeletionReview'))
  );
  fireEvent.press(screen.getByText(t('settings.privacy.confirmRequest')));
  fireEvent.press(screen.getByText(t('settings.privacy.localDelete')));
  expect(localDelete).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(t('settings.privacy.confirmLocalDelete')));

  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'data_export' })
  );
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'account_deletion' })
  );
  expect(localDelete).toHaveBeenCalledWith(
    expect.objectContaining({
      operationId: expect.stringMatching(/^settings-local-delete-/)
    })
  );
  expect(screen.queryByText(/settings\.privacy\.completed/i)).toBeNull();
});

function profile() {
  return {
    name: 'Dana',
    avatar: 'default',
    phone: '+966500000000',
    googleAccount: null,
    email: 'dana@example.com',
    country: 'SA',
    currency: 'SAR',
    timeZone: 'Asia/Riyadh',
    completion: ['identity', 'currency'],
    version: 1
  };
}
