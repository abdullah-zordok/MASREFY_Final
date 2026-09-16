import { isDemoModeEnabled, isFixtureModeEnabled } from './demo-mode';

describe('client demo mode', () => {
  it('is enabled only by the explicit public value', () => {
    expect(isDemoModeEnabled('1')).toBe(true);
    expect(isDemoModeEnabled('0')).toBe(false);
    expect(isDemoModeEnabled(undefined)).toBe(false);
  });

  it('lets an explicitly approved demo profile use fixtures in an optimized bundle', () => {
    expect(isFixtureModeEnabled('production', false)).toBe(false);
    expect(isFixtureModeEnabled('production', true)).toBe(true);
    expect(isFixtureModeEnabled('test', false)).toBe(true);
  });
});
