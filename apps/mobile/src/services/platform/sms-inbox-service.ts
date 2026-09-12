export interface RawSmsMessage {
  id: string;
  sender: string;
  body: string;
  receivedAt: number;
}

export interface SmsInboxService {
  available: boolean;
  readRecent(input: { since: number; limit: number }): Promise<RawSmsMessage[]>;
  isNetworkAvailable(): Promise<boolean>;
}

export function createSmsInboxService(): SmsInboxService {
  return {
    available: false,
    async readRecent() {
      return [];
    },
    async isNetworkAvailable() {
      return false;
    }
  };
}

