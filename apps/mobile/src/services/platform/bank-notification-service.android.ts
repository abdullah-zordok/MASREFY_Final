import { MasarifiSmsInbox } from '../../../modules/masarifi-sms-inbox';
import type {
  BankNotificationService,
  RawBankNotification
} from './bank-notification-service';

interface NativeBankNotifications {
  isNotificationAccessEnabled(): Promise<unknown>;
  openNotificationAccessSettings(): Promise<void>;
  readRecentNotifications(limit: number): Promise<unknown>;
  acknowledgeNotifications(keys: readonly string[]): Promise<void>;
}

export function createAndroidBankNotificationService(
  native: NativeBankNotifications | null = MasarifiSmsInbox
): BankNotificationService {
  return {
    async getAccessState() {
      if (!native) return 'unavailable';
      try {
        return (await native.isNotificationAccessEnabled()) === true
          ? 'granted'
          : 'denied';
      } catch {
        return 'unavailable';
      }
    },
    async openSettings() {
      await native?.openNotificationAccessSettings();
    },
    async readRecent(limit) {
      if (!native) return [];
      const value = await native.readRecentNotifications(
        Math.max(1, Math.min(100, Math.trunc(limit)))
      );
      if (!Array.isArray(value))
        throw new Error('bank_notification_invalid_response');
      return value.flatMap((row) => {
        const parsed = parseNotification(row);
        return parsed ? [parsed] : [];
      });
    },
    async acknowledge(keys) {
      if (!native) return;
      const validKeys = [...new Set(keys.filter((key) => key.length > 0))];
      if (validKeys.length > 0)
        await native.acknowledgeNotifications(validKeys);
    }
  };
}

export const bankNotificationService =
  createAndroidBankNotificationService();

function parseNotification(value: unknown): RawBankNotification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.key !== 'string' ||
    row.key.length === 0 ||
    typeof row.packageName !== 'string' ||
    row.packageName.length === 0 ||
    typeof row.title !== 'string' ||
    typeof row.text !== 'string' ||
    (row.title.length === 0 && row.text.length === 0) ||
    !Number.isSafeInteger(row.postedAt) ||
    Number(row.postedAt) < 0
  )
    return null;
  return {
    key: row.key,
    packageName: row.packageName,
    title: row.title,
    text: row.text,
    postedAt: Number(row.postedAt)
  };
}
