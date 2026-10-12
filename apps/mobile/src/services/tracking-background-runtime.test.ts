import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { MasarifiSmsInbox } from '../../modules/masarifi-sms-inbox';
import { useAppShellStore } from '@/state/app-shell';
import {
  configureTrackingBackground,
  disableTrackingBackground
} from './tracking-background-runtime';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { invalidateTrackingConsent } from './tracking-source-preferences';
import { resetRuntimeIdentityData } from '@/storage/runtime-user-data-reset';
import * as database from '@/storage/database';

let mockNativeNotifications: string[] = [];

jest.mock('../../modules/masarifi-sms-inbox', () => ({
  MasarifiSmsInbox: {
    configureTrackingOwner: jest.fn(async () => undefined),
    clearTrackingOwner: jest.fn(async () => {
      mockNativeNotifications = [];
    }),
    suspendTrackingOwner: jest.fn(async () => undefined),
    restoreTrackingOwner: jest.fn(async () => 'PRESERVED')
  }
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined)
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => 'digest:' + value
  ),
  randomUUID: () => 'generation-test'
}));
jest.mock('expo-notifications', () => ({
  registerTaskAsync: jest.fn(async () => undefined)
}));
const rules = {
  keywords: [],
  senders: [{ normalizedSender: 'com.bank.app', trusted: true, enabled: true }]
};
beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android'
  });
  await disableTrackingBackground();
  useAppShellStore.setState({
    session: {
      status: 'authenticated',
      userId: 'owner-a',
      method: 'google',
      issuedAt: 1,
      expiresAt: 2,
      restoration: 'restored'
    }
  });
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest
    .mocked(MasarifiSmsInbox!.restoreTrackingOwner)
    .mockResolvedValue('PRESERVED');
  await resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' });
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

it('preserves durable notification work when cold authentication restores the same owner', async () => {
  mockNativeNotifications = ['retained-notification'];
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
    JSON.stringify({
      ownerId: 'owner-a',
      generation: '11111111-1111-4111-8111-111111111111'
    })
  );
  useAppShellStore.setState({ session: null });
  await resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' });
  expect(mockNativeNotifications).toEqual(['retained-notification']);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

it('preserves native work through the actual live cold-authentication store path', async () => {
  process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
  const session = useAppShellStore.getState().session!;
  mockNativeNotifications = ['retained-notification'];
  jest.spyOn(database, 'configureDatabaseOwner').mockResolvedValue(undefined);
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) =>
    key === 'masarifi.tracking.background-context.v2'
      ? JSON.stringify({
          ownerId: 'owner-a',
          generation: '11111111-1111-4111-8111-111111111111'
        })
      : null
  );
  useAppShellStore.setState({ session: null });
  try {
    await useAppShellStore.getState().authenticate(session);
    expect(useAppShellStore.getState().session?.userId).toBe('owner-a');
    expect(mockNativeNotifications).toEqual(['retained-notification']);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith(
      'masarifi.tracking.background-context.v2'
    );
  } finally {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
  }
});

it('still clears durable native notifications on explicit sign-out', async () => {
  mockNativeNotifications = ['retained-notification'];
  await resetRuntimeIdentityData();
  expect(mockNativeNotifications).toEqual([]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    'masarifi.tracking.background-context.v2'
  );
});

it('retains owner continuity when disabling SMS while keeping notifications', async () => {
  mockNativeNotifications = ['retained-notification'];
  await disableTrackingBackground(true);
  expect(mockNativeNotifications).toEqual(['retained-notification']);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(MasarifiSmsInbox?.suspendTrackingOwner).toHaveBeenCalledTimes(1);
});

it('leaves cold authentication uninitialized when ownership cannot be proven', async () => {
  process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
  const session = useAppShellStore.getState().session!;
  mockNativeNotifications = ['retained-notification'];
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('{');
  useAppShellStore.setState({ session: null });
  try {
    await expect(
      useAppShellStore.getState().authenticate(session)
    ).rejects.toThrow('tracking_restore_unavailable');
    expect(useAppShellStore.getState().session).toBeNull();
    expect(mockNativeNotifications).toEqual(['retained-notification']);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  } finally {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
  }
});

it('removes the previous owner background context only after native cross-owner cleanup succeeds', async () => {
  mockNativeNotifications = ['previous-owner-notification'];
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
    JSON.stringify({
      ownerId: 'owner-b',
      generation: '11111111-1111-4111-8111-111111111111'
    })
  );
  jest
    .mocked(MasarifiSmsInbox!.restoreTrackingOwner)
    .mockImplementationOnce(async () => {
      mockNativeNotifications = [];
      return 'CLEARED';
    });
  await resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' });
  expect(mockNativeNotifications).toEqual([]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    'masarifi.tracking.background-context.v2'
  );
});

it('rejects ambiguous native ownership while retaining durable notifications and saved context', async () => {
  mockNativeNotifications = ['retained-notification'];
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
    JSON.stringify({
      ownerId: 'owner-a',
      generation: '11111111-1111-4111-8111-111111111111'
    })
  );
  jest
    .mocked(MasarifiSmsInbox!.restoreTrackingOwner)
    .mockResolvedValueOnce('BLOCKED');
  await expect(
    resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' })
  ).rejects.toThrow('tracking_restore_unavailable');
  await configureTrackingBackground('owner-a', rules, 'automatic_clear');
  expect(mockNativeNotifications).toEqual(['retained-notification']);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(MasarifiSmsInbox?.configureTrackingOwner).not.toHaveBeenCalled();
});

it('cannot restore old identity after a sign-out races the native restoration', async () => {
  mockNativeNotifications = ['retained-notification'];
  let release!: (value: string) => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest
    .mocked(MasarifiSmsInbox!.restoreTrackingOwner)
    .mockImplementationOnce(async () => {
      entered();
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    });
  const restoration = resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' });
  const rejected = expect(restoration).rejects.toThrow(
    'tracking_restore_unavailable'
  );
  await ready;
  const signout = resetRuntimeIdentityData();
  release('PRESERVED');
  await Promise.all([rejected, signout]);
  expect(mockNativeNotifications).toEqual([]);
  await configureTrackingBackground('owner-a', rules, 'automatic_clear');
  expect(MasarifiSmsInbox?.configureTrackingOwner).not.toHaveBeenCalled();
});

it('preserves durable work when cold restoration overtakes native configuration', async () => {
  mockNativeNotifications = ['retained-notification'];
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  jest
    .mocked(MasarifiSmsInbox!.configureTrackingOwner)
    .mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
  const configuring = configureTrackingBackground(
    'owner-a',
    rules,
    'automatic_clear'
  );
  await ready;
  const restoring = resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' });
  release();
  await Promise.all([configuring, restoring]);
  expect(mockNativeNotifications).toEqual(['retained-notification']);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

it.each(['{', '{}', '{"ownerId":"owner-a","generation":"short"}'])(
  'rejects ambiguous saved ownership without deleting notifications: %s',
  async (raw) => {
    mockNativeNotifications = ['retained-notification'];
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(raw);
    await expect(
      resetRuntimeIdentityData({ restoringOwnerId: 'owner-a' })
    ).rejects.toThrow('tracking_restore_unavailable');
    expect(mockNativeNotifications).toEqual(['retained-notification']);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(MasarifiSmsInbox?.suspendTrackingOwner).toHaveBeenCalled();
  }
);
it('disables both native intake mechanisms when cached lifecycle safety rules need refresh', async () => {
  await configureTrackingBackground(
    'owner-a',
    { ...rules, requiresRefresh: true },
    'automatic_clear'
  );
  expect(MasarifiSmsInbox?.configureTrackingOwner).toHaveBeenCalledWith(
    'digest:owner-a',
    'generation-test',
    false,
    false,
    ['com.bank.app'],
    [],
    null
  );
});

it('does not resurrect native capture when consent changes while storage is awaited', async () => {
  let loaded!: () => void;
  const awaiting = new Promise<void>((resolve) => {
    loaded = resolve;
  });
  let resume!: () => void;
  jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(async () => {
    loaded();
    await new Promise<void>((resolve) => {
      resume = resolve;
    });
    return JSON.stringify({ smsEnabled: true, notificationEnabled: true });
  });
  const configuring = configureTrackingBackground(
    'owner-a',
    rules,
    'automatic_clear'
  );
  await awaiting;
  invalidateTrackingConsent();
  const disabling = disableTrackingBackground();
  resume();
  await Promise.all([configuring, disabling]);
  expect(MasarifiSmsInbox?.configureTrackingOwner).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(MasarifiSmsInbox?.clearTrackingOwner).toHaveBeenCalled();
});
it('rejects a configuration belonging to the previous account', async () => {
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockResolvedValue(
      JSON.stringify({ smsEnabled: true, notificationEnabled: true })
    );
  await configureTrackingBackground('owner-b', rules, 'automatic_clear');
  expect(MasarifiSmsInbox?.configureTrackingOwner).not.toHaveBeenCalled();
});
it('configures both sources with trusted package scope for the active owner', async () => {
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockResolvedValue(
      JSON.stringify({ smsEnabled: false, notificationEnabled: true })
    );
  await configureTrackingBackground('owner-a', rules, 'automatic_clear');
  expect(MasarifiSmsInbox?.configureTrackingOwner).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    false,
    true,
    ['com.bank.app'],
    [],
    null
  );
});
it('syncs a validated discovery policy and disabled packages without trusting unknown packages', async () => {
  const { defaultSnapshot } = require('@masarifi/transaction-parser');
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockResolvedValue(
      JSON.stringify({ smsEnabled: true, notificationEnabled: true })
    );
  await configureTrackingBackground(
    'owner-a',
    {
      ...rules,
      snapshot: defaultSnapshot,
      senders: [
        ...rules.senders,
        { normalizedSender: 'com.blocked.app', enabled: false, trusted: true }
      ]
    },
    'review_all'
  );
  const call = (MasarifiSmsInbox?.configureTrackingOwner as jest.Mock).mock
    .calls[0];
  expect(call[4]).toEqual(['com.bank.app']);
  expect(call[5]).toEqual(['com.blocked.app']);
  expect(JSON.parse(call[6])).toMatchObject({
    version: 1,
    releaseId: defaultSnapshot.releaseId
  });
});
