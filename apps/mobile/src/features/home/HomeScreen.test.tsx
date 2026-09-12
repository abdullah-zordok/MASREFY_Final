import React from 'react';
import { PixelRatio } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { lightThemeColors, radius } from '@/design-system/tokens';
import type { HomeSummary } from '@/domain/core-finance';
import { changeLocale, translate } from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { voiceAnalyzerService } from '@/services/mocks/voice-analyzer-service';
import { fixtureTranscript } from '@/services/mocks/voice-fixtures';
import { voiceRecorderService } from '@/services/platform/voice-recorder-service';
import { usePreferenceStore } from '@/state/preferences';
import { useCoreFinanceViewState } from '@/state/core-finance-view-state';
import { useVoiceCaptureStore } from '@/state/voice-capture';
import {
  fixtureAccounts,
  makeTransaction
} from '@/test-utils/core-finance-fixtures';
import { renderWithProviders } from '@/test-utils/render';
import { HomeScreen } from './HomeScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/transactions/AccountPicker', () => ({
  AccountPicker: () => null
}));
jest.mock('@/services/platform/voice-recorder-service', () => ({
  voiceRecorderService: {
    getPermission: jest.fn(),
    requestPermission: jest.fn(),
    openSettings: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
    remove: jest.fn()
  }
}));
jest.mock('@/features/settings/settings-queries', () => ({
  useSettingsProfile: () => ({
    data: { name: 'Dana', email: 'dana@example.com' },
    isLoading: false,
    isError: false
  })
}));

const summary: HomeSummary = {
  totalBalanceMinor: 125000,
  currencyCode: 'SAR',
  isEstimated: false,
  components: [],
  excludedAccountIds: [],
  periodIncomeMinor: 50000,
  periodExpenseMinor: 20000,
  activeAccountCount: 2,
  recentTransactions: [
    makeTransaction(2, {
      categoryId: 'shopping',
      title: 'Al Nakheel Restaurant'
    }),
    makeTransaction(11, { categoryId: 'salary', title: 'Salary' })
  ],
  reviewCount: 1,
  pendingSyncCount: 1,
  dataState: 'ready'
};

beforeEach(() => {
  jest.clearAllMocks();
  usePreferenceStore.setState({ hideBalances: false, reducedMotion: false });
  useVoiceCaptureStore.getState().reset();
  jest
    .mocked(voiceRecorderService.getPermission)
    .mockImplementation(() => new Promise(() => undefined));
});
afterEach(() => {
  jest.restoreAllMocks();
  useVoiceCaptureStore.getState().reset();
});

it('opens Reports and More from fixed physical shell actions', () => {
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getByTestId('primary-shell-header')).toHaveStyle({
    flexDirection: 'row'
  });
  expect(
    screen.getAllByLabelText(translate('appShell.navigation.reports'))[0]
  ).toHaveStyle({
    minHeight: 48,
    minWidth: 48
  });
  fireEvent.press(
    screen.getAllByLabelText(translate('appShell.navigation.reports'))[0]
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(tabs)/reports',
    params: { returnTo: '/(tabs)/home' }
  });

  fireEvent.press(screen.getByLabelText(translate('appShell.navigation.more')));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(tabs)/more',
    params: { returnTo: '/(tabs)/home' }
  });
});

it('opens the Home period flow and updates the filled month pill', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  const current = new Date();
  const currentLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(current);
  fireEvent.press(screen.getByLabelText(currentLabel));
  expect(screen.getByText('Choose Date Range')).toBeTruthy();
  fireEvent.press(screen.getByTestId('date-period-option-thisMonth'));

  expect(screen.getByTestId('home-period-control')).toBeTruthy();
});

it('shows the financial hierarchy and values by default', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);
  expect(screen.queryByText('•••• SAR')).toBeNull();
  expect(screen.getAllByText('1,250.00 SAR')).toHaveLength(2);
  expect(screen.getAllByText('1,250.00 SAR')[0]).toHaveStyle({
    fontSize: 35.2,
    lineHeight: 43.2
  });
  expect(screen.getByText('2 active accounts')).toBeTruthy();
  expect(screen.getByTestId('home-horizon')).toBeTruthy();
  expect(screen.getByTestId('financial-horizon-surface')).toBeTruthy();
  expect(screen.getByTestId('home-account-card')).toBeTruthy();
  expect(screen.getByTestId('home-action-tray')).toBeTruthy();
  expect(screen.getByTestId('home-quick-actions')).toBeTruthy();
});

it('shows a minus sign when the total balance is negative', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen summary={{ ...summary, totalBalanceMinor: -15_000 }} />
  );

  expect(screen.getAllByText('-150.00 SAR')).toHaveLength(2);
});

it('keeps the financial hierarchy visible when there are no accounts', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen
      accounts={[]}
      summary={{
        ...summary,
        totalBalanceMinor: 0,
        components: [],
        periodIncomeMinor: 0,
        periodExpenseMinor: 0,
        activeAccountCount: 0,
        recentTransactions: [],
        reviewCount: 0,
        pendingSyncCount: 0,
        dataState: 'empty'
      }}
    />
  );

  expect(screen.queryByText(translate('coreFinance.home.empty'))).toBeNull();
  expect(screen.getByTestId('home-horizon')).toBeTruthy();
  expect(screen.getByTestId('home-account-card')).toBeTruthy();
  expect(screen.getByTestId('home-action-tray')).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.ledger.empty'))).toBeTruthy();
});

it('masks all Home amounts when Hide Balances is enabled', () => {
  changeLocale('en');
  usePreferenceStore.setState({ hideBalances: true });
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getAllByText('•••• SAR').length).toBeGreaterThanOrEqual(3);
  expect(screen.queryByText('1,250.00 SAR')).toBeNull();
});

it('opens a recent transaction directly in edit mode', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getByText('Al Nakheel Restaurant')).toBeTruthy();

  fireEvent.press(screen.getByText('Al Nakheel Restaurant'));
  expect(router.push).toHaveBeenCalledWith('/transactions/transaction-2/edit');
});

it('shows recent expenses before income and excludes transfers from both sections', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen
      summary={{
        ...summary,
        recentTransactions: [
          makeTransaction(20, { title: 'Card transfer', type: 'transfer' }),
          makeTransaction(11, { title: 'August salary', type: 'income' }),
          makeTransaction(2, {
            categoryId: 'shopping',
            title: 'Coffee shop',
            type: 'expense'
          })
        ]
      }}
    />
  );

  const headings = screen.getAllByText(/Recent expenses|Recent income/);
  expect(headings.map((heading) => heading.props.children)).toEqual([
    'Recent expenses',
    'Recent income'
  ]);
  expect(screen.getByText('Coffee shop')).toBeTruthy();
  expect(screen.getByText('August salary')).toBeTruthy();
  expect(screen.queryByText('Card transfer')).toBeNull();
  expect(screen.getByTestId('home-transaction-list-expense')).toBeTruthy();
  expect(screen.getByTestId('home-transaction-list-income')).toBeTruthy();
  expect(
    screen.getByTestId('category-visual-openmoji-shopping', {
      includeHiddenElements: true
    })
  ).toBeTruthy();
  expect(
    screen.getByTestId('category-visual-openmoji-salary', {
      includeHiddenElements: true
    })
  ).toBeTruthy();
});

it('renders every recent transaction as an independent card without dividers', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen
      summary={{
        ...summary,
        recentTransactions: [
          makeTransaction(2, { title: 'Coffee shop', type: 'expense' }),
          makeTransaction(3, { title: 'Restaurant', type: 'expense' })
        ]
      }}
    />
  );

  expect(screen.getByTestId('home-transaction-list-expense')).toHaveStyle({
    gap: 8
  });
  for (const id of ['transaction-2', 'transaction-3']) {
    expect(screen.getByTestId(`home-transaction-row-${id}`)).toHaveStyle({
      borderRadius: radius.card,
      borderWidth: 1
    });
  }
});

it('extends the activity surface through the bottom of the Home screen', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getByTestId('home-activity-sheet')).toHaveStyle({
    backgroundColor: lightThemeColors.surfaces.page,
    flexGrow: 1
  });
});

it('omits an activity section when it has no matching transactions', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen
      summary={{
        ...summary,
        recentTransactions: [makeTransaction(2, { type: 'expense' })]
      }}
    />
  );

  expect(screen.getByText('Recent expenses')).toBeTruthy();
  expect(screen.queryByText('Recent income')).toBeNull();
});

it('uses existing quick-action routes and opens Accounts as a modal', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByTestId('home-quick-action-add'));
  expect(router.push).toHaveBeenCalledWith('/(tabs)/add');
  fireEvent.press(screen.getByTestId('home-quick-action-reports'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(tabs)/reports',
    params: { returnTo: '/(tabs)/home' }
  });

  jest.mocked(router.push).mockClear();
  fireEvent.press(screen.getByTestId('home-quick-action-accounts'));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByTestId('app-sheet-modal')).toBeTruthy();
  expect(screen.getByTestId('account-scope-sheet')).toBeTruthy();
});

it('starts voice recording inline without navigating away from Home', async () => {
  jest.useFakeTimers();
  changeLocale('en');
  jest
    .mocked(voiceRecorderService.requestPermission)
    .mockResolvedValue('granted');
  jest.mocked(voiceRecorderService.start).mockResolvedValue({
    id: 'recording-home',
    startedAt: Date.now()
  });
  const view = renderWithProviders(<HomeScreen summary={summary} />);
  try {
    fireEvent.press(screen.getByTestId('home-quick-action-voice'));

    expect(
      await screen.findByTestId('home-inline-voice-recording')
    ).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(
      screen.getByLabelText(/Recording.*Stop recording.*0:00/)
    ).toBeTruthy();
    expect(screen.getByTestId('home-voice-recording-pulse')).toBeTruthy();
    expect(screen.queryByTestId('home-voice-recording-static-ring')).toBeNull();
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

it('keeps a denied microphone permission recoverable on Home', async () => {
  changeLocale('en');
  jest
    .mocked(voiceRecorderService.requestPermission)
    .mockResolvedValue('denied');
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByTestId('home-quick-action-voice'));

  expect(
    await screen.findByText(translate('voice.error.permission_denied'))
  ).toBeTruthy();
  expect(screen.getByTestId('home-voice-error-card')).toBeTruthy();
  expect(voiceRecorderService.start).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it('offers app settings after microphone permission is permanently denied', async () => {
  changeLocale('en');
  jest
    .mocked(voiceRecorderService.requestPermission)
    .mockResolvedValue('permanently_denied');
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByTestId('home-quick-action-voice'));
  fireEvent.press(
    await screen.findByText(translate('voice.permission.settings'))
  );

  expect(voiceRecorderService.openSettings).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it('keeps a static active indicator when reduced motion is enabled', () => {
  changeLocale('en');
  usePreferenceStore.setState({ reducedMotion: true });
  useVoiceCaptureStore.getState().patch({
    permission: 'granted',
    state: 'recording',
    recordingId: 'recording-reduced-motion',
    startedAt: Date.UTC(2026, 7, 18, 12),
    timezoneOffsetMinutes: 0,
    durationMs: 4_000
  });

  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getByText('0:04')).toBeTruthy();
  expect(screen.getByTestId('home-voice-recording-static-ring')).toBeTruthy();
  expect(screen.queryByTestId('home-voice-recording-pulse')).toBeNull();
});

it('does not check the microphone or leave Home before the user asks', () => {
  changeLocale('en');

  renderWithProviders(<HomeScreen summary={summary} />);

  expect(voiceRecorderService.getPermission).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it.each([
  ['ar', 'جاري تحليل التسجيل...'],
  ['en', 'Analyzing recording...']
] as const)(
  'shows the compact inline processing state in %s',
  (locale, message) => {
    changeLocale(locale);
    useVoiceCaptureStore.getState().patch({ state: 'transcribing' });

    renderWithProviders(<HomeScreen summary={summary} />);

    const processing = screen.getByTestId('home-voice-processing-inline');
    expect(screen.getByText(message)).toBeTruthy();
    expect(
      screen.getByTestId('home-voice-processing-icon', {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    expect(screen.getByTestId('home-voice-processing-indicator')).toBeTruthy();
    expect(processing).toHaveStyle({
      alignItems: 'center',
      flexDirection: locale === 'ar' ? 'row-reverse' : 'row'
    });
    expect(processing.props.accessibilityViewIsModal).toBeUndefined();
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
  }
);

it('shows unclear audio after the empty default result without creating a transaction', async () => {
  jest.useFakeTimers();
  try {
    changeLocale('en');
    jest
      .mocked(voiceRecorderService.stop)
      .mockResolvedValue('private://voice-audio');
    jest.mocked(voiceRecorderService.remove).mockResolvedValue();
    const createTransactions = jest.spyOn(
      coreFinanceService,
      'createTransactionsAtomically'
    );
    useVoiceCaptureStore.getState().patch({
      permission: 'granted',
      state: 'recording',
      recordingId: 'recording-empty',
      startedAt: Date.UTC(2026, 7, 18, 12),
      timezoneOffsetMinutes: 0
    });
    renderWithProviders(<HomeScreen summary={summary} />);

    fireEvent.press(screen.getByTestId('home-inline-voice-recording'));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('home-voice-processing-inline')).toBeTruthy();

    await act(async () => jest.advanceTimersByTimeAsync(1_499));
    expect(screen.getByTestId('home-voice-processing-inline')).toBeTruthy();

    await act(async () => jest.advanceTimersByTimeAsync(1));
    expect(useVoiceCaptureStore.getState()).toMatchObject({
      state: 'failed',
      errorCode: 'no_speech',
      group: null
    });
    expect(screen.queryByTestId('home-voice-processing-inline')).toBeNull();
    const unclearOverlay = screen.getByTestId('home-voice-unclear-overlay');
    expect(unclearOverlay.props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByText(translate('voice.unclear.title'))).toBeTruthy();
    const unclearMessage = screen.getByText(translate('voice.unclear.message'));
    expect(unclearMessage.props.accessibilityRole).toBe('alert');
    expect(unclearMessage.props.accessibilityLiveRegion).toBe('assertive');
    expect(createTransactions).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
  } finally {
    jest.useRealTimers();
  }
});

it('clears unclear audio and returns Voice to ready when Record Again is pressed', async () => {
  changeLocale('en');
  useVoiceCaptureStore.getState().patch({
    permission: 'granted',
    state: 'failed',
    errorCode: 'no_speech',
    durationMs: 3_000,
    transcript: fixtureTranscript('no_speech')
  });
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByLabelText('Record Again'));

  await waitFor(() =>
    expect(useVoiceCaptureStore.getState()).toMatchObject({
      state: 'ready',
      durationMs: 0,
      transcript: null,
      group: null,
      errorCode: null
    })
  );
  expect(screen.queryByTestId('home-voice-unclear-overlay')).toBeNull();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it('dismisses unclear audio and stays on Home when Cancel is pressed', async () => {
  changeLocale('en');
  useVoiceCaptureStore.getState().patch({
    permission: 'granted',
    state: 'failed',
    errorCode: 'background_noise'
  });
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByLabelText('Cancel'));

  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().state).toBe('idle')
  );
  expect(screen.queryByTestId('home-voice-unclear-overlay')).toBeNull();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it('stops inline recording and shows the valid result for review on Home', async () => {
  changeLocale('en');
  let resolveTranscript!: (value: ReturnType<typeof fixtureTranscript>) => void;
  jest
    .mocked(voiceRecorderService.getPermission)
    .mockImplementation(() => new Promise(() => undefined));
  jest
    .mocked(voiceRecorderService.stop)
    .mockResolvedValue('private://voice-audio');
  jest.mocked(voiceRecorderService.remove).mockResolvedValue();
  jest.spyOn(voiceAnalyzerService, 'transcribe').mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveTranscript = resolve;
      })
  );
  const createTransactions = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockResolvedValue({
      value: [],
      affectedScopes: ['home.summary']
    } as never);
  useVoiceCaptureStore.getState().patch({
    permission: 'granted',
    scenario: 'clear_en',
    state: 'recording',
    recordingId: 'recording-home',
    startedAt: Date.UTC(2026, 7, 18, 12),
    timezoneOffsetMinutes: 0,
    durationMs: 2_000
  });
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(screen.getByText('0:02')).toBeTruthy();
  fireEvent.press(screen.getByTestId('home-inline-voice-recording'));

  expect(
    await screen.findByTestId('home-voice-processing-inline')
  ).toBeTruthy();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
  await act(async () => {
    resolveTranscript(fixtureTranscript('clear_en', Date.UTC(2026, 7, 18, 12)));
  });
  expect(await screen.findByTestId(/^voice-review-card-/)).toBeTruthy();
  expect(useVoiceCaptureStore.getState().state).toBe('proposal_review');
  expect(createTransactions).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
  expect(screen.queryByTestId('home-voice-processing-inline')).toBeNull();
});

it('keeps multiple analyzed transactions as separate review cards on Home', async () => {
  changeLocale('en');
  jest
    .mocked(voiceRecorderService.stop)
    .mockResolvedValue('private://voice-audio');
  jest.mocked(voiceRecorderService.remove).mockResolvedValue();
  jest
    .spyOn(voiceAnalyzerService, 'transcribe')
    .mockResolvedValue(
      fixtureTranscript('multiple', Date.UTC(2026, 7, 18, 12))
    );
  useVoiceCaptureStore.getState().patch({
    permission: 'granted',
    scenario: 'multiple',
    state: 'recording',
    recordingId: 'recording-review',
    startedAt: Date.UTC(2026, 7, 18, 12),
    timezoneOffsetMinutes: 0
  });
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByTestId('home-inline-voice-recording'));

  await waitFor(() =>
    expect(screen.getAllByTestId(/^voice-review-card-/)).toHaveLength(3)
  );
  expect(router.push).not.toHaveBeenCalledWith('/(tabs)/voice');
});

it('routes account actions and dismisses the Accounts sheet', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  fireEvent.press(screen.getByTestId('home-quick-action-accounts'));
  fireEvent.press(screen.getByText('Manage accounts'));
  expect(router.push).toHaveBeenCalledWith('/accounts');

  fireEvent.press(screen.getByTestId('home-quick-action-accounts'));
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByTestId('account-scope-sheet')).toBeNull();

  fireEvent.press(screen.getByTestId('home-quick-action-accounts'));
  fireEvent.press(
    screen.getByTestId('app-sheet-backdrop', { includeHiddenElements: true })
  );
  expect(screen.queryByTestId('account-scope-sheet')).toBeNull();
});

it('shows the resolved source account without exposing its id', () => {
  changeLocale('en');
  renderWithProviders(
    <HomeScreen accounts={fixtureAccounts} summary={summary} />
  );

  expect(screen.getAllByText('Daily account')).toHaveLength(2);
  expect(screen.queryByText('account-bank')).toBeNull();
  expect(
    screen.getByLabelText(/Al Nakheel Restaurant, Shopping, Daily account/)
  ).toBeTruthy();
});

it('omits unresolved account metadata instead of exposing the raw id', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen accounts={[]} summary={summary} />);

  expect(screen.queryByText('Daily account')).toBeNull();
  expect(screen.queryByText('account-bank')).toBeNull();
});

it.each([
  ['ar', 'row-reverse', 'flex-end', 'flex-start', 'right', 'rtl'],
  ['en', 'row', 'flex-start', 'flex-end', 'left', 'ltr']
] as const)(
  'keeps the recent transaction layout visually correct in %s',
  (
    locale,
    flexDirection,
    textAlignment,
    amountAlignment,
    textAlign,
    writingDirection
  ) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    changeLocale(locale);
    renderWithProviders(<HomeScreen summary={summary} />);

    expect(screen.getByTestId('home-expense-section-heading')).toHaveStyle({
      direction: 'ltr',
      writingDirection: 'ltr',
      flexDirection
    });
    expect(
      screen.getByTestId('home-transaction-row-transaction-2')
    ).toHaveStyle({
      direction: 'ltr',
      writingDirection: 'ltr',
      flexDirection,
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12
    });
    expect(screen.getByTestId('home-account-card')).toHaveStyle({
      direction: 'ltr',
      flexDirection,
      writingDirection: 'ltr'
    });
    expect(
      screen.getByTestId('home-transaction-info-transaction-2')
    ).toHaveStyle({ flexDirection });
    expect(
      screen.getByTestId('home-transaction-text-transaction-2')
    ).toHaveStyle({ alignItems: textAlignment });
    expect(
      screen.getByTestId('home-transaction-amount-transaction-2')
    ).toHaveStyle({ alignItems: amountAlignment });
    expect(screen.getByText('Al Nakheel Restaurant')).toHaveStyle({
      textAlign,
      writingDirection
    });
    expect(screen.getByText('Al Nakheel Restaurant').props.numberOfLines).toBe(
      2
    );
  }
);

it('keeps secondary planning and shortcut content off Home', () => {
  changeLocale('en');
  renderWithProviders(<HomeScreen summary={summary} />);

  expect(
    screen.queryByText(translate('coreFinance.home.attention'))
  ).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.home.quickActions'))
  ).toBeNull();
});

it.each(['ar', 'en'] as const)(
  'reflows transaction cards instead of shrinking their typography at 200%% text in %s',
  (locale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    changeLocale(locale);
    usePreferenceStore.setState({
      locale,
      direction: locale === 'ar' ? 'rtl' : 'ltr'
    });

    renderWithProviders(<HomeScreen summary={summary} />);

    expect(
      screen.getByTestId('home-transaction-row-transaction-2')
    ).toHaveStyle({ alignItems: 'stretch', flexDirection: 'column' });
    expect(
      screen.getByText('Al Nakheel Restaurant').props.numberOfLines
    ).toBeUndefined();
    expect(
      screen.getByTestId('home-period-label').props.numberOfLines
    ).toBeUndefined();
  }
);

it('shows the optional notice only with a populated financial summary', () => {
  changeLocale('en');
  const notice = <StyledText>Tracking invitation</StyledText>;
  const ready = renderWithProviders(
    <HomeScreen notice={notice} summary={summary} />
  );

  expect(screen.getByText('Tracking invitation')).toBeTruthy();
  ready.unmount();

  renderWithProviders(
    <HomeScreen
      notice={notice}
      summary={{ ...summary, dataState: 'empty', recentTransactions: [] }}
    />
  );

  expect(screen.queryByText('Tracking invitation')).toBeNull();
});

it.each([
  ['en', 'ltr', 'column'],
  ['ar', 'rtl', 'column-reverse']
] as const)(
  'stacks quick actions at 200%% text in %s',
  (locale, direction, flexDirection) => {
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    changeLocale(locale);
    usePreferenceStore.setState({ locale, direction });

    renderWithProviders(<HomeScreen summary={summary} />);

    expect(screen.getByTestId('home-quick-actions')).toHaveStyle({
      direction: 'ltr',
      flexDirection
    });
    fontScale.mockRestore();
  }
);

it.each([
  ['en', 'ltr', 'row'],
  ['ar', 'rtl', 'row-reverse']
] as const)(
  'keeps four quick actions in one row in %s',
  (locale, direction, flexDirection) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    changeLocale(locale);
    usePreferenceStore.setState({ locale, direction });
    renderWithProviders(<HomeScreen summary={summary} />);

    expect(screen.getByTestId('home-quick-actions')).toHaveStyle({
      direction: 'ltr',
      flexDirection
    });
  }
);

describe('selected account scope', () => {
  const scopedSummary: HomeSummary = {
    ...summary,
    totalBalanceMinor: 50000,
    periodIncomeMinor: 0,
    periodExpenseMinor: 20000,
    activeAccountCount: 1,
    components: [
      {
        accountId: 'account-wallet',
        originalMinor: 50000,
        currencyCode: 'SAR',
        convertedMinor: 50000,
        rate: 1,
        asOf: 1
      }
    ],
    recentTransactions: [
      makeTransaction(3, {
        accountId: 'account-wallet',
        title: 'Wallet coffee'
      }),
      makeTransaction(4, {
        accountId: 'account-wallet',
        title: 'Wallet lunch'
      })
    ]
  };

  beforeEach(() => {
    act(() => {
      useCoreFinanceViewState.getState().selectAccount(null);
    });
  });

  it('shows the selected account balance in the hero and scopes recent activity', () => {
    changeLocale('en');
    useCoreFinanceViewState.getState().selectAccount('account-wallet');
    renderWithProviders(
      <HomeScreen accounts={fixtureAccounts} summary={scopedSummary} />
    );

    expect(screen.getByText('Balance')).toBeTruthy();
    expect(screen.getAllByText('500.00 SAR')).toHaveLength(2);
    expect(screen.queryByText('200.00 SAR')).toBeNull();
    expect(screen.queryByText('1,250.00 SAR')).toBeNull();
    expect(screen.getByTestId('home-account-card-title')).toHaveTextContent(
      'Wallet'
    );
    expect(
      screen.getByTestId('home-transaction-row-transaction-3')
    ).toBeTruthy();
    expect(
      screen.getByTestId('home-transaction-row-transaction-4')
    ).toBeTruthy();
  });

  it('shows an account-specific empty state when the selected account has no activity', () => {
    changeLocale('en');
    useCoreFinanceViewState.getState().selectAccount('account-wallet');
    renderWithProviders(
      <HomeScreen
        accounts={fixtureAccounts}
        summary={{ ...scopedSummary, recentTransactions: [] }}
      />
    );

    expect(screen.getByText('No activity in this account yet')).toBeTruthy();
  });

  it('updates immediately when switching between accounts', () => {
    changeLocale('en');
    useCoreFinanceViewState.getState().selectAccount('account-wallet');
    const first = renderWithProviders(
      <HomeScreen accounts={fixtureAccounts} summary={scopedSummary} />
    );
    expect(screen.getByTestId('home-account-card-title')).toHaveTextContent(
      'Wallet'
    );
    expect(screen.getAllByText('500.00 SAR')).toHaveLength(2);
    expect(screen.queryByText('200.00 SAR')).toBeNull();
    first.unmount();

    const bankScopedSummary: HomeSummary = {
      ...scopedSummary,
      periodExpenseMinor: 50000,
      components: [
        {
          accountId: 'account-bank',
          originalMinor: 850000,
          currencyCode: 'SAR',
          convertedMinor: 850000,
          rate: 1,
          asOf: 1
        }
      ]
    };
    useCoreFinanceViewState.getState().selectAccount('account-bank');
    renderWithProviders(
      <HomeScreen accounts={fixtureAccounts} summary={bankScopedSummary} />
    );

    expect(screen.getByTestId('home-account-card-title')).toHaveTextContent(
      'Daily account'
    );
    expect(screen.getAllByText('8,500.00 SAR')).toHaveLength(2);
    expect(screen.queryByText('500.00 SAR')).toBeNull();
    expect(screen.queryByText('200.00 SAR')).toBeNull();

    act(() => {
      useCoreFinanceViewState.getState().selectAccount(null);
    });
  });

  it.each([
    ['ar', 'row-reverse', 'rtl'],
    ['en', 'row', 'ltr']
  ] as const)(
    'mirrors the account selector layout in %s',
    (locale, flexDirection, direction) => {
      jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
      changeLocale(locale);
      usePreferenceStore.setState({ locale, direction });
      useCoreFinanceViewState.getState().selectAccount('account-wallet');
      renderWithProviders(
        <HomeScreen accounts={fixtureAccounts} summary={scopedSummary} />
      );

      expect(screen.getByTestId('home-account-card')).toHaveStyle({
        flexDirection,
        writingDirection: 'ltr'
      });
      expect(
        screen.getByTestId('home-account-card-chevron', {
          includeHiddenElements: true
        })
      ).toBeTruthy();
      expect(
        screen.getByTestId('home-account-card-values', {
          includeHiddenElements: true
        })
      ).toHaveStyle({ flexDirection });
    }
  );
});
