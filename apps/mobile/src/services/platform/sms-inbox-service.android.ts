import { MasarifiSmsInbox } from '../../../modules/masarifi-sms-inbox';
import type {
  RawSmsMessage,
  SmsInboxService
} from './sms-inbox-service';

interface NativeSmsInbox {
  readRecentSms(since: number, limit: number): Promise<unknown>;
  isNetworkAvailable(): Promise<unknown>;
}

export function createAndroidSmsInboxService(
  native: NativeSmsInbox | null = MasarifiSmsInbox
): SmsInboxService {
  return {
    available: native !== null,
    async readRecent({ since, limit }) {
      if (
        !Number.isSafeInteger(since) ||
        since < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        throw new Error('sms_inbox_invalid_request');
      }
      if (!native) return [];
      const value = await native.readRecentSms(since, limit);
      if (!Array.isArray(value)) throw new Error('sms_inbox_invalid_response');
      return value.map(validateMessage);
    },
    async isNetworkAvailable() {
      if (!native) return false;
      const value = await native.isNetworkAvailable();
      if (typeof value !== 'boolean')
        throw new Error('sms_inbox_invalid_response');
      return value;
    }
  };
}

export const smsInboxService = createAndroidSmsInboxService();

function validateMessage(value: unknown): RawSmsMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('sms_inbox_invalid_response');
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    !row.id ||
    typeof row.sender !== 'string' ||
    !row.sender ||
    typeof row.body !== 'string' ||
    !row.body ||
    !Number.isSafeInteger(row.receivedAt) ||
    Number(row.receivedAt) < 0
  ) {
    throw new Error('sms_inbox_invalid_response');
  }
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    receivedAt: Number(row.receivedAt)
  };
}

