import { validateEnvironment } from '../../../src/platform/config/environment.schema';

const base = {
  NODE_ENV: 'test',
  MASARIFI_PROCESS_KIND: 'migration',
  MASARIFI_RELEASE_VERSION: 'phase11-test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
};

describe('Phase 11 engagement configuration', () => {
  it('applies safe bounded defaults', () => {
    expect(validateEnvironment(base)).toMatchObject({
      MASARIFI_NOTIFICATION_BATCH_SIZE: 100,
      MASARIFI_CAMPAIGN_BATCH_SIZE: 500,
      MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE: 25,
      MASARIFI_NOTIFICATION_MAX_ATTEMPTS: 5,
      MASARIFI_SUPPORT_REOPEN_HOURS: 168,
      MASARIFI_CAMPAIGN_APPROVAL_THRESHOLD: 10_000,
      MASARIFI_SUPPORT_ATTACHMENT_MAX_BYTES: 10_485_760,
      MASARIFI_ENGAGEMENT_PROVIDER_MODE: 'disabled',
    });
  });

  it.each([
    ['MASARIFI_NOTIFICATION_BATCH_SIZE', 101],
    ['MASARIFI_CAMPAIGN_BATCH_SIZE', 501],
    ['MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE', 26],
    ['MASARIFI_NOTIFICATION_MAX_ATTEMPTS', 21],
    ['MASARIFI_SUPPORT_REOPEN_HOURS', 721],
    ['MASARIFI_CAMPAIGN_APPROVAL_THRESHOLD', 1_000_001],
    ['MASARIFI_SUPPORT_ATTACHMENT_MAX_BYTES', 10_485_761],
    ['MASARIFI_ENGAGEMENT_PROVIDER_MODE', 'unknown'],
  ])('rejects unsafe or unbounded %s', (key, value) => {
    expect(() => validateEnvironment({ ...base, [key]: value })).toThrow(key);
  });

  it('never echoes provider or scanner secrets', () => {
    const sentinel = 'SENTINEL-ENGAGEMENT-SECRET';
    try {
      validateEnvironment({ ...base, MASARIFI_EXPO_ACCESS_TOKEN: sentinel });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('MASARIFI_EXPO_ACCESS_TOKEN');
      expect(String(error)).not.toContain(sentinel);
    }
  });
});
