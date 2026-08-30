import { buildPreferences } from '@/domain/foundation';
import { loadPreferences, savePreferences } from '@/storage/secure-preferences';
import { usePreferenceStore } from './preferences';
import { resetRuntimeUserData } from '@/storage/runtime-user-data-reset';
import { synchronizeClientDemoLocale } from '@/services/mocks/client-demo-locale';

jest.mock('@/storage/secure-preferences', () => ({
  loadPreferences: jest.fn(),
  savePreferences: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('@/services/mocks/client-demo-locale', () => ({
  synchronizeClientDemoLocale: jest.fn(async () => true)
}));

const mockLoadPreferences = jest.mocked(loadPreferences);
const mockSavePreferences = jest.mocked(savePreferences);
const synchronizeDemoLocale = jest.mocked(synchronizeClientDemoLocale);

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  jest.clearAllMocks();
  usePreferenceStore.setState({ ...buildPreferences({}), hydrated: false });
});

it('commits a demo locale switch after its fixtures are relocalized', async () => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  let finishSync!: () => void;
  synchronizeDemoLocale.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      finishSync = () => resolve(true);
    })
  );

  const switchingLocale = usePreferenceStore.getState().setLocale('en');
  expect(usePreferenceStore.getState().locale).toBe('ar');
  finishSync();
  await switchingLocale;

  expect(synchronizeDemoLocale).toHaveBeenCalledWith('en');
  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'en',
    direction: 'ltr'
  });
});

it('keeps the current locale when demo relocalization fails', async () => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  synchronizeDemoLocale.mockRejectedValueOnce(new Error('database unavailable'));

  await usePreferenceStore.getState().setLocale('en');

  expect(usePreferenceStore.getState().locale).toBe('ar');
  expect(mockSavePreferences).not.toHaveBeenCalled();
});

it('preserves preference changes made while demo relocalization runs', async () => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  let finishSync!: () => void;
  synchronizeDemoLocale.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      finishSync = () => resolve(true);
    })
  );

  const switchingLocale = usePreferenceStore.getState().setLocale('en');
  usePreferenceStore.getState().toggleHideBalances();
  finishSync();
  await switchingLocale;

  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'en',
    hideBalances: true
  });
});

it('serializes rapid demo locale changes and commits only the latest', async () => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  let finishEnglish!: () => void;
  let finishArabic!: () => void;
  synchronizeDemoLocale
    .mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishEnglish = () => resolve(true);
      })
    )
    .mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishArabic = () => resolve(true);
      })
    );

  const switchingToEnglish = usePreferenceStore.getState().setLocale('en');
  const switchingBackToArabic = usePreferenceStore.getState().setLocale('ar');
  finishEnglish();
  await switchingToEnglish;
  await Promise.resolve();

  expect(synchronizeDemoLocale).toHaveBeenLastCalledWith('ar');
  expect(usePreferenceStore.getState().locale).toBe('ar');

  finishArabic();
  await switchingBackToArabic;

  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'ar',
    direction: 'rtl'
  });
  expect(mockSavePreferences).not.toHaveBeenCalled();
});

it('restores the committed demo locale when the latest queued switch fails', async () => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  let finishEnglish!: () => void;
  synchronizeDemoLocale
    .mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishEnglish = () => resolve(true);
      })
    )
    .mockRejectedValueOnce(new Error('Arabic synchronization failed'))
    .mockResolvedValueOnce(true);

  const switchingToEnglish = usePreferenceStore.getState().setLocale('en');
  const switchingBackToArabic = usePreferenceStore.getState().setLocale('ar');
  finishEnglish();

  await expect(switchingToEnglish).resolves.toBe(false);
  await expect(switchingBackToArabic).resolves.toBe(false);

  expect(synchronizeDemoLocale.mock.calls.map(([locale]) => locale)).toEqual([
    'en',
    'ar',
    'ar'
  ]);
  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'ar',
    direction: 'rtl'
  });
  expect(mockSavePreferences).not.toHaveBeenCalled();
});

it.each(['dark', 'system'] as const)(
  'replaces and persists a stored %s theme during hydration',
  async (theme) => {
    mockLoadPreferences.mockResolvedValue(buildPreferences({ theme }));

    await usePreferenceStore.getState().hydrate();

    expect(usePreferenceStore.getState()).toMatchObject({
      hydrated: true,
      theme: 'light'
    });
    expect(mockSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'light' })
    );
  }
);

it('does not rewrite an already-light stored theme', async () => {
  mockLoadPreferences.mockResolvedValue(buildPreferences({ theme: 'light' }));

  await usePreferenceStore.getState().hydrate();

  expect(usePreferenceStore.getState().theme).toBe('light');
  expect(mockSavePreferences).not.toHaveBeenCalled();
});

it('finishes hydration with defaults when persisted preferences cannot be read', async () => {
  mockLoadPreferences.mockRejectedValue(new Error('storage unavailable'));

  await expect(
    usePreferenceStore.getState().hydrate()
  ).resolves.toBeUndefined();

  expect(usePreferenceStore.getState()).toMatchObject({
    hydrated: true,
    locale: 'ar',
    theme: 'light',
    hideBalances: false
  });
});

it('prevents transient theme changes while dark mode is disabled', () => {
  usePreferenceStore.getState().setTheme('dark');

  expect(usePreferenceStore.getState().theme).toBe('light');
});

it('drops in-memory user preferences when runtime user data resets', () => {
  usePreferenceStore.setState({
    ...buildPreferences({
      locale: 'en',
      defaultAccountId: 'account-1',
      trackingPersonalization: false
    }),
    hydrated: true
  });

  resetRuntimeUserData();

  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'ar',
    direction: 'rtl',
    defaultAccountId: null,
    trackingPersonalization: true,
    hydrated: true
  });
});
