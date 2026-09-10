import {
  derivePercentageCohort,
  evaluateFeatureFlag,
} from '../../../src/operations/feature-evaluator';

describe('feature evaluator', () => {
  const flag = {
    key: 'mobile.safe-demo',
    defaultEnabled: false,
    status: 'active' as const,
    version: 4,
    rules: [
      { priority: 20, audience: { platform: 'ios' as const }, enabled: true },
      {
        priority: 10,
        audience: { platform: 'ios' as const, locale: 'ar' as const },
        enabled: true,
      },
    ],
  };

  it('evaluates enabled rules in stable priority order without mutating input', () => {
    const rules = [...flag.rules];
    expect(evaluateFeatureFlag(flag, { platform: 'ios', locale: 'ar' })).toEqual({
      key: flag.key,
      enabled: true,
      version: 4,
      source: 'rule',
    });
    expect(flag.rules).toEqual(rules);
  });

  it('uses fail-safe fallback states', () => {
    expect(evaluateFeatureFlag(flag, { platform: 'android' })).toMatchObject({
      enabled: false,
      source: 'default',
    });
    expect(evaluateFeatureFlag(undefined, {})).toEqual({
      key: '',
      enabled: false,
      version: 0,
      source: 'missing',
    });
    expect(evaluateFeatureFlag({ ...flag, status: 'retired' }, {})).toMatchObject({
      enabled: false,
      source: 'retired',
    });
  });

  it('matches app-version prefixes consistently with the database evaluator', () => {
    expect(
      evaluateFeatureFlag(
        { ...flag, rules: [{ priority: 1, audience: { appVersion: '2.4' }, enabled: true }] },
        { appVersion: '2.4.7' },
      ),
    ).toMatchObject({ enabled: true, source: 'rule' });
  });

  it('derives a stable server-owned percentage cohort for one-percent rules', () => {
    const subjects = Array.from({ length: 1_000 }, (_, index) => `owner-${String(index)}`);
    const included = subjects.find((subject) => derivePercentageCohort(subject) === 'percent-00');
    const excluded = subjects.find((subject) => derivePercentageCohort(subject) !== 'percent-00');
    expect(included).toBeDefined();
    expect(excluded).toBeDefined();
    if (!included || !excluded) throw new Error('expected included and excluded cohort fixtures');
    expect(derivePercentageCohort(included)).toBe(derivePercentageCohort(included));

    const onePercent = {
      ...flag,
      rules: [{ priority: 1, audience: { cohort: 'percent-00' }, enabled: true }],
    };
    expect(
      evaluateFeatureFlag(onePercent, { cohort: derivePercentageCohort(included) }),
    ).toMatchObject({ enabled: true, source: 'rule' });
    expect(
      evaluateFeatureFlag(onePercent, { cohort: derivePercentageCohort(excluded) }),
    ).toMatchObject({ enabled: false, source: 'default' });
  });

  it('blocks invariant flag keys even if a stored definition enables them', () => {
    expect(
      evaluateFeatureFlag(
        { ...flag, key: 'billing.checkout', defaultEnabled: true, rules: [] },
        {},
      ),
    ).toEqual({
      key: 'billing.checkout',
      enabled: false,
      version: 4,
      source: 'invariant_blocked',
    });
  });
});
