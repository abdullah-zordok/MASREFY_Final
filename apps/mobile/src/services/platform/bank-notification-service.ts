export type BankNotificationAccessState = 'granted' | 'denied' | 'unavailable';

export interface RawBankNotification {
  key: string;
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
}

export interface BankNotificationService {
  getAccessState(): Promise<BankNotificationAccessState>;
  openSettings(): Promise<void>;
  setCaptureEnabled(enabled: boolean): Promise<void>;
  readRecent(limit: number): Promise<RawBankNotification[]>;
  acknowledge(keys: readonly string[]): Promise<void>;
}

export function createBankNotificationService(): BankNotificationService {
  return {
    async getAccessState() {
      return 'unavailable';
    },
    async openSettings() {},
    async setCaptureEnabled() {},
    async readRecent() {
      return [];
    },
    async acknowledge() {}
  };
}

export const bankNotificationService = createBankNotificationService();
