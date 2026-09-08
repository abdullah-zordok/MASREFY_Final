import { advanceCutover, createInitialCutoverPolicy } from './cutover';

const next = {
  schemaVersion: 1 as const,
  configVersion: 'mobile-wave-1-shadow-v1',
  client: 'mobile' as const,
  mode: 'live' as const,
  wave: 1,
  stage: 'shadow' as const,
  cohort: 'internal-employees',
  cohortSource: 'server' as const,
  acceptedVersion: '24d3cac',
  rollbackVersion: '24d3cac',
  billingAvailable: false as const
};

describe('Mobile cutover policy', () => {
  it('starts from the accepted documentation version with billing unavailable', () => {
    expect(createInitialCutoverPolicy('mobile', '24d3cac')).toEqual({
      schemaVersion: 1,
      configVersion: 'mobile-wave-0-full-24d3cac',
      client: 'mobile',
      mode: 'live',
      wave: 0,
      stage: 'full',
      cohort: 'all',
      cohortSource: 'server',
      acceptedVersion: '24d3cac',
      rollbackVersion: '24d3cac',
      billingAvailable: false
    });
  });

  it('accepts only ordered stages and waves', () => {
    const wave0 = createInitialCutoverPolicy('mobile', '24d3cac');
    const shadow = advanceCutover(wave0, next);
    const internal = advanceCutover(shadow, {
      ...next,
      configVersion: 'mobile-wave-1-internal-v1',
      stage: 'internal'
    });
    const bounded = advanceCutover(internal, {
      ...next,
      configVersion: 'mobile-wave-1-bounded-v1',
      stage: 'bounded-write'
    });
    expect(
      advanceCutover(bounded, {
        ...next,
        configVersion: 'mobile-wave-1-full-v1',
        stage: 'full',
        acceptedVersion: 'mobile-wave-1-v1'
      }).stage
    ).toBe('full');
    expect(() => advanceCutover(wave0, { ...next, stage: 'internal' })).toThrow(
      'invalid cutover transition'
    );
    expect(() => advanceCutover(wave0, { ...next, wave: 2 })).toThrow(
      'invalid cutover transition'
    );
  });

  it('requires a stable server-derived cohort and versioned rollback', () => {
    const wave0 = createInitialCutoverPolicy('mobile', '24d3cac');
    expect(advanceCutover(wave0, next)).toEqual(
      advanceCutover(wave0, { ...next })
    );
    expect(() =>
      advanceCutover(wave0, { ...next, cohortSource: 'client' as 'server' })
    ).toThrow('server-derived cohort');
    expect(() =>
      advanceCutover(wave0, { ...next, rollbackVersion: '' })
    ).toThrow('invalid cutover version');
  });

  it('retains and reselects the accepted rollback version after full cutover', () => {
    const wave0 = createInitialCutoverPolicy('mobile', '24d3cac');
    const shadow = advanceCutover(wave0, next);
    const internal = advanceCutover(shadow, {
      ...next,
      configVersion: 'mobile-wave-1-internal-v1',
      stage: 'internal'
    });
    const bounded = advanceCutover(internal, {
      ...next,
      configVersion: 'mobile-wave-1-bounded-v1',
      stage: 'bounded-write'
    });
    const full = advanceCutover(bounded, {
      ...next,
      configVersion: 'mobile-wave-1-full-v1',
      stage: 'full',
      acceptedVersion: 'mobile-wave-1-v1'
    });

    expect(full.rollbackVersion).toBe('24d3cac');
    expect(
      createInitialCutoverPolicy('mobile', full.rollbackVersion).acceptedVersion
    ).toBe('24d3cac');
  });

  it('keeps Wave 1 as the rollback target through Wave 2 staged writes', () => {
    const acceptedWave1 = {
      ...createInitialCutoverPolicy('mobile', '4f1ba15'),
      configVersion: 'mobile-wave-1-full-v1',
      wave: 1,
      acceptedVersion: '4f1ba15',
      rollbackVersion: '4f1ba15'
    };
    const wave2 = {
      ...next,
      wave: 2,
      acceptedVersion: '4f1ba15',
      rollbackVersion: '4f1ba15'
    };
    const shadow = advanceCutover(acceptedWave1, {
      ...wave2,
      configVersion: 'mobile-wave-2-shadow-v1'
    });
    const internal = advanceCutover(shadow, {
      ...wave2,
      configVersion: 'mobile-wave-2-internal-v1',
      stage: 'internal'
    });
    const bounded = advanceCutover(internal, {
      ...wave2,
      configVersion: 'mobile-wave-2-bounded-v1',
      stage: 'bounded-write'
    });

    expect(bounded).toMatchObject({
      wave: 2,
      stage: 'bounded-write',
      rollbackVersion: '4f1ba15',
      billingAvailable: false
    });
    expect(
      createInitialCutoverPolicy('mobile', bounded.rollbackVersion)
        .acceptedVersion
    ).toBe('4f1ba15');
  });

  it('keeps the accepted Wave 2 version as the Wave 3 rollback target', () => {
    const acceptedWave2 = {
      ...createInitialCutoverPolicy('mobile', '4fa0626'),
      configVersion: 'mobile-wave-2-full-v1',
      wave: 2,
      acceptedVersion: '4fa0626',
      rollbackVersion: '4f1ba15'
    };
    const wave3 = {
      ...next,
      wave: 3,
      acceptedVersion: '4fa0626',
      rollbackVersion: '4fa0626'
    };
    const shadow = advanceCutover(acceptedWave2, {
      ...wave3,
      configVersion: 'mobile-wave-3-shadow-v1'
    });
    const internal = advanceCutover(shadow, {
      ...wave3,
      configVersion: 'mobile-wave-3-internal-v1',
      stage: 'internal'
    });
    const bounded = advanceCutover(internal, {
      ...wave3,
      configVersion: 'mobile-wave-3-bounded-v1',
      stage: 'bounded-write'
    });
    expect(bounded).toMatchObject({
      wave: 3,
      stage: 'bounded-write',
      rollbackVersion: '4fa0626',
      billingAvailable: false
    });
    expect(
      createInitialCutoverPolicy('mobile', bounded.rollbackVersion)
        .acceptedVersion
    ).toBe('4fa0626');
  });
});
