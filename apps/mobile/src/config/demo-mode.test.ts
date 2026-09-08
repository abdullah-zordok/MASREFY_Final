import { isDemoModeEnabled, isFixtureModeEnabled } from './demo-mode';

describe('client demo mode', () => {
  it('is enabled only by the explicit public value', () => {
    expect(isDemoModeEnabled('1')).toBe(true);
    expect(isDemoModeEnabled('0')).toBe(false);
    expect(isDemoModeEnabled(undefined)).toBe(false);
  });

  it('keeps fixture routes out of production', () => {
    expect(isFixtureModeEnabled('production', false)).toBe(false);
    expect(() => isFixtureModeEnabled('production', true)).toThrow(
      'production requires live client mode'
    );
    expect(isFixtureModeEnabled('test', false)).toBe(true);
  });
});
