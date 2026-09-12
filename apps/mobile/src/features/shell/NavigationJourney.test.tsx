import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { notifyManager } from '@tanstack/react-query';

import HomeRoute from '@app/(tabs)/home';
import TransactionsRoute from '@app/(tabs)/transactions';
import AddRoute from '@app/(tabs)/add';
import ReportsRoute from '@app/(tabs)/reports';
import MoreRoute from '@app/(tabs)/more';
import AccountsRoute from '@app/accounts';
import AssistantRoute from '@app/assistant';
import AuthRequiredRoute from '@app/modals/auth-required';
import { createClientDemoSession } from '@/domain/demo-session';
import { translate, translateDynamic } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

let mockSearchParams: { returnTo?: string } = {};

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn()
  },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (callback: () => void) =>
    require('react').useEffect(callback, [callback]),
  Tabs: Object.assign(() => null, { Screen: () => null }),
  Stack: () => null
}));

jest.mock('@/services/mocks/core-finance-service', () => ({
  coreFinanceService: {
    getHomeSummary: jest.fn(async () => ({
      totalBalanceMinor: 0,
      currencyCode: 'SAR',
      isEstimated: false,
      components: [],
      excludedAccountIds: [],
      periodIncomeMinor: 0,
      periodExpenseMinor: 0,
      activeAccountCount: 0,
      recentTransactions: [],
      reviewCount: 0,
      pendingSyncCount: 0,
      dataState: 'ready'
    })),
    loadDraft: jest.fn(async () => null),
    listAccounts: jest.fn(async () => []),
    listAccountBalances: jest.fn(async () => []),
    listCategories: jest.fn(async () => []),
    listTransactions: jest.fn(async () => ({ items: [], total: 0 }))
  }
}));

jest.mock('@/services/mocks/assistant-notifications-service', () => ({
  assistantNotificationsService: {
    list: jest.fn(async (input: { unreadOnly?: boolean } = {}) => ({
      items: [],
      nextCursor: null,
      total: input.unreadOnly ? 7 : 0
    }))
  }
}));

jest.mock('@/features/assistant/assistant-queries', () => ({
  useAssistantConsent: jest.fn(),
  useAssistantAvailability: jest.fn(),
  useSetAssistantConsent: jest.fn(),
  useCreateAssistantConversation: jest.fn(),
  useAssistantConversations: jest.fn(),
  useAssistantConversation: jest.fn(),
  useAskAssistant: jest.fn(),
  useRenameAssistantConversation: jest.fn(),
  useDeleteAssistantConversation: jest.fn(),
  useAssistantFeedback: jest.fn()
}));

const mockAssistantQueries = jest.requireMock(
  '@/features/assistant/assistant-queries'
) as Record<string, jest.Mock>;

beforeAll(() => {
  notifyManager.setNotifyFunction((callback) => {
    act(callback);
  });
});

afterAll(() => {
  notifyManager.setNotifyFunction((callback) => {
    callback();
  });
});

describe('navigation journey', () => {
  beforeEach(() => {
    mockSearchParams = {};
    jest.clearAllMocks();
    mockAssistantQueries.useAssistantConsent.mockReturnValue({
      data: { status: 'enabled', version: 1 },
      error: null,
      isError: false
    });
    mockAssistantQueries.useAssistantAvailability.mockReturnValue({
      data: { status: 'available', remainingQuestions: 2 },
      error: null,
      isError: false
    });
    mockAssistantQueries.useSetAssistantConsent.mockReturnValue({
      mutate: jest.fn()
    });
    mockAssistantQueries.useCreateAssistantConversation.mockReturnValue({
      mutate: jest.fn(),
      error: null
    });
    mockAssistantQueries.useAssistantConversations.mockReturnValue({
      data: { items: [], nextCursor: null, total: 0 },
      isLoading: false,
      isError: false
    });
    mockAssistantQueries.useAssistantConversation.mockReturnValue({
      data: {
        conversation: { id: 'conversation-1', title: 'Assistant', version: 1 },
        responses: { items: [], nextCursor: null, total: 0 }
      }
    });
    mockAssistantQueries.useAskAssistant.mockReturnValue({ mutate: jest.fn() });
    mockAssistantQueries.useRenameAssistantConversation.mockReturnValue({
      mutate: jest.fn()
    });
    mockAssistantQueries.useDeleteAssistantConversation.mockReturnValue({
      mutate: jest.fn()
    });
    mockAssistantQueries.useAssistantFeedback.mockReturnValue({
      mutate: jest.fn()
    });
  });

  it('renders every primary and representative secondary destination', async () => {
    const home = renderWithProviders(<HomeRoute />);
    expect(await screen.findByTestId('home-quick-action-accounts')).toBeOnTheScreen();
    home.unmount();

    const transactions = renderWithProviders(<TransactionsRoute />);
    expect(
      await screen.findByText(translate('appShell.tabs.transactions'))
    ).toBeOnTheScreen();
    transactions.unmount();

    const add = renderWithProviders(<AddRoute />);
    expect(
      await screen.findByText(translate('appShell.tabs.add'))
    ).toBeOnTheScreen();
    add.unmount();

    const reports = renderWithProviders(<ReportsRoute />);
    expect(
      screen.getByText(translate('reports.analytics.title'))
    ).toBeOnTheScreen();
    reports.unmount();

    const more = renderWithProviders(<MoreRoute />);
    expect(
      screen.getByLabelText(translate('appShell.shell.security'))
    ).toBeOnTheScreen();
    for (const [label, route] of [
      [translate('appShell.shell.profile'), '/profile'],
      [translate('appShell.shell.security'), '/security/settings'],
      [translate('settings.profile.applicationOwner'), '/profile/application'],
      [translate('tracking.action.openTracking'), '/tracking'],
      [translate('appShell.shell.support'), '/support']
    ] as const) {
      const link = screen.getByLabelText(label);
      expect(link).toBeOnTheScreen();
      fireEvent.press(link);
      expect(router.push).toHaveBeenCalledWith(route);
    }
    more.unmount();

    const accounts = renderWithProviders(<AccountsRoute />);
    expect(
      await screen.findByLabelText(translate('coreFinance.accounts.add'))
    ).toBeOnTheScreen();
    accounts.unmount();

    const assistant = renderWithProviders(<AssistantRoute />);
    expect(
      screen.getByText(translateDynamic('assistant.consent.title'))
    ).toBeOnTheScreen();
    assistant.unmount();

    const authRequired = renderWithProviders(<AuthRequiredRoute />);
    expect(
      screen.getByText(translate('appShell.navigation.authRequired'))
    ).toBeOnTheScreen();
    authRequired.unmount();
  });

  it('makes More the directory for every relocated secondary destination', async () => {
    useAppShellStore.setState({ profilePromptDismissed: true });
    renderWithProviders(<MoreRoute />);

    for (const heading of [
      'appShell.more.financePlanning',
      'appShell.more.services',
      'appShell.more.accountSettings'
    ] as const) {
      expect(screen.getByText(translate(heading))).toBeOnTheScreen();
    }

    for (const [label, route] of [
      [translate('appShell.shell.accounts'), '/accounts'],
      [translate('coreFinance.action.categories'), '/categories'],
      [translate('planning.budgets.title'), '/budgets'],
      [translate('planning.savings.title'), '/savings'],
      [translate('planning.salary.title'), '/salary'],
      [translate('planning.obligations.title'), '/obligations'],
      [translate('appShell.shell.assistant'), '/assistant'],
      [translate('appShell.shell.support'), '/support']
    ] as const) {
      const link = screen.getByLabelText(label);
      fireEvent.press(link);
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
  });

  it('keeps the client demo profile separate from subscriptions', () => {
    useAppShellStore.setState({ session: createClientDemoSession(Date.now()) });
    const more = renderWithProviders(<MoreRoute />);

    expect(screen.getAllByText('client-demo').length).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText(
        `client-demo, ${translate('appShell.more.planBasic')}`
      )
    ).toBeNull();
    expect(
      screen.queryByText(translate('appShell.more.planBasic'))
    ).toBeNull();

    more.unmount();
    useAppShellStore.setState({ session: null });
  });

  it('updates mounted More labels immediately when the locale changes', () => {
    void usePreferenceStore.getState().setLocale('en');
    renderWithProviders(<MoreRoute />);
    expect(screen.getByText(translate('appShell.more.services', 'en'))).toBeOnTheScreen();

    act(() => {
      void usePreferenceStore.getState().setLocale('ar');
    });

    expect(screen.getByText(translate('appShell.more.services', 'ar'))).toBeOnTheScreen();
    expect(screen.queryByText(translate('appShell.more.services', 'en'))).toBeNull();
  });

  it('maintains profile preferences without displaying progressive setup on More screen', () => {
    useAppShellStore.setState({ profilePromptDismissed: false });
    const visible = renderWithProviders(<MoreRoute />);

    expect(
      screen.queryByText(translate('appShell.shell.progressiveSetup'))
    ).toBeNull();
    visible.unmount();

    useAppShellStore.setState({ profilePromptDismissed: true });
    renderWithProviders(<MoreRoute />);

    expect(
      screen.queryByText(translate('appShell.shell.progressiveSetup'))
    ).toBeNull();
  });

  it('offers a safe return action when transactions opened from reports', async () => {
    mockSearchParams = { returnTo: '/(tabs)/reports' };
    renderWithProviders(<TransactionsRoute />);

    expect(
      await screen.findByText(translate('coreFinance.ledger.empty'))
    ).toBeOnTheScreen();
    fireEvent.press(
      await screen.findByLabelText(translate('appShell.navigation.back'))
    );
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/reports');
  });

  it('returns from Reports to its sanitized primary origin', () => {
    mockSearchParams = { returnTo: '/(tabs)/transactions' };
    renderWithProviders(<ReportsRoute />);

    fireEvent.press(screen.getByLabelText(translate('appShell.navigation.back')));
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/transactions');
  });

  it('returns from More to Home when the origin is missing or invalid', () => {
    mockSearchParams = { returnTo: '/not-approved' };
    renderWithProviders(<MoreRoute />);

    fireEvent.press(screen.getByLabelText(translate('appShell.navigation.back')));
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('does not display notifications row in More services list', () => {
    renderWithProviders(<MoreRoute />);

    expect(
      screen.queryByLabelText(translate('appShell.shell.notifications'))
    ).toBeNull();
  });

  it('opens assistant from More and announces disabled and limit states', async () => {
    mockAssistantQueries.useAssistantConsent.mockReturnValue({
      data: { status: 'disabled', version: 2 },
      error: null,
      isError: false
    });
    const disabled = renderWithProviders(<MoreRoute />);
    const assistantDisabled = await screen.findByLabelText(
      `${translate('appShell.shell.assistant')} ${translate('appShell.shell.assistantDisabled')}`
    );
    fireEvent.press(assistantDisabled);
    expect(router.push).toHaveBeenCalledWith('/assistant');
    disabled.unmount();

    mockAssistantQueries.useAssistantConsent.mockReturnValue({
      data: { status: 'enabled', version: 2 },
      error: null,
      isError: false
    });
    mockAssistantQueries.useAssistantAvailability.mockReturnValue({
      data: { status: 'limit_reached', remainingQuestions: 0 },
      error: null,
      isError: false
    });
    renderWithProviders(<MoreRoute />);
    expect(
      await screen.findByLabelText(
        `${translate('appShell.shell.assistant')} ${translate('appShell.shell.assistantLimitReached')}`
      )
    ).toBeOnTheScreen();
  });
});
