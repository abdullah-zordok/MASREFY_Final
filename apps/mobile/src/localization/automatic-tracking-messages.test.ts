import ar from './messages/ar';
import en from './messages/en';

const forbidden = /inbox|keyword|sender|background|خلفية|مرسل|كلمات/i;
const iosKeys = [
  'appShell.onboarding.ios.title',
  'appShell.onboarding.ios.body',
  'capture.ios.noSms',
  'capture.ios.alternatives',
  'tracking.ios.title',
  'tracking.ios.limitation',
  'tracking.ios.alternatives',
  'tracking.ios.skip',
  'tracking.ios.recovery'
] as const;

describe('automatic tracking messages', () => {
  it.each([en, ar])('includes per-account tracking controls', (messages) => {
    expect(messages['coreFinance.accounts.automaticTracking']).toBeTruthy();
    expect(messages['coreFinance.accounts.automaticTrackingDescription']).toBeTruthy();
    expect(messages['coreFinance.accounts.automaticTrackingEnabled']).toBeTruthy();
    expect(messages['coreFinance.accounts.automaticTrackingDisabled']).toBeTruthy();
  });

  it('keeps iOS alternatives free of Android tracking controls', () => {
    for (const key of iosKeys) {
      expect(en[key]).not.toMatch(/inbox|keyword|sender|background/i);
      expect(ar[key]).not.toMatch(forbidden);
    }
  });
});
