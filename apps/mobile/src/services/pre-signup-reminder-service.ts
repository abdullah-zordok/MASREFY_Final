import * as SecureStore from 'expo-secure-store';

import type { NotificationPermissionState } from '@/domain/notifications';
import { currentLocale } from '@/localization/i18n';
import type { PhoneNotificationService } from '@/services/contracts/assistant-notifications-service';
import { phoneNotificationService } from '@/services/platform/phone-notification-service';

const key = 'masarifi.pre-signup-reminders.v1';
const hour = 60 * 60 * 1_000;

type State = {
  startedAt: number;
  permissionAttempted: boolean;
  scheduledIds: string[];
  authenticated: boolean;
};

type Storage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync'>;
type Phone = Pick<PhoneNotificationService, 'scheduleLocal' | 'cancelScheduled'>;

const copy = {
  en: [
    {
      title: 'Finish setting up Masarifi 👋',
      body: 'Create your account and let Masarifi organize your spending automatically.',
    },
    {
      title: 'Masarifi is ready for you',
      body: 'Finish signing up and start keeping track of your spending with less effort.',
    },
  ],
  ar: [
    {
      title: 'كمّل إعداد مصاريفي 👋',
      body: 'سجّل حسابك وخلي مصاريفك تتسجل وتترتب تلقائيًا.',
    },
    {
      title: 'مصاريفي جاهز لك',
      body: 'كمّل تسجيلك وابدأ تتابع صرفك بشكل أسهل.',
    },
  ],
} as const;

export function createPreSignupReminderService({
  phone,
  storage,
  now = Date.now,
  locale = currentLocale,
}: {
  phone: Phone;
  storage: Storage;
  now?: () => number;
  locale?: () => string;
}) {
  async function load(): Promise<State | null> {
    try {
      const raw = await storage.getItemAsync(key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<State>;
      return typeof value.startedAt === 'number' &&
        typeof value.permissionAttempted === 'boolean' &&
        Array.isArray(value.scheduledIds) &&
        value.scheduledIds.every((id) => typeof id === 'string') &&
        typeof value.authenticated === 'boolean'
        ? (value as State)
        : null;
    } catch {
      return null;
    }
  }

  const save = (state: State) => storage.setItemAsync(key, JSON.stringify(state));

  return {
    async prepare() {
      let state = await load();
      if (!state) {
        state = {
          startedAt: now(),
          permissionAttempted: false,
          scheduledIds: [],
          authenticated: false,
        };
        await save(state);
      }
      return {
        shouldRequestPermission: !state.authenticated && !state.permissionAttempted,
      };
    },
    async scheduleAfterPermission(permission: NotificationPermissionState) {
      const state = await load();
      if (!state || state.authenticated || state.permissionAttempted) return;
      state.permissionAttempted = true;
      await save(state);
      if (permission !== 'granted') return;
      const messages = locale() === 'ar' ? copy.ar : copy.en;
      for (const [index, delay] of [24 * hour, 72 * hour].entries()) {
        const scheduledAt = state.startedAt + delay;
        if (scheduledAt <= now()) continue;
        const result = await phone.scheduleLocal({
          ...messages[index],
          destination: 'auth',
          scheduledAt: new Date(scheduledAt),
        });
        if (result.status === 'scheduled' && result.identifier) {
          state.scheduledIds.push(result.identifier);
          await save(state);
        }
      }
    },
    async completeAuthentication() {
      const state = await load();
      if (!state) {
        await save({
          startedAt: now(),
          permissionAttempted: true,
          scheduledIds: [],
          authenticated: true,
        });
        return;
      }
      if (state.authenticated) return;
      await Promise.all(state.scheduledIds.map((id) => phone.cancelScheduled(id)));
      await save({ ...state, authenticated: true, scheduledIds: [] });
    },
  };
}

export const preSignupReminderService = createPreSignupReminderService({
  phone: phoneNotificationService,
  storage: SecureStore,
});
