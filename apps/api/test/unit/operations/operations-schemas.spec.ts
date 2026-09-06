import {
  parseFlagContext,
  parseOperationCommand,
  parseOperationsReadQuery,
  parseJobAction,
  parsePageQuery,
  parseSeriesQuery,
  safeRecord,
} from '../../../src/operations/operations.schemas';

describe('operations schemas', () => {
  it('defaults and bounds cursor pages without accepting extra fields', () => {
    expect(parsePageQuery({})).toEqual({ limit: 25, cursor: null });
    expect(parsePageQuery({ limit: '100', cursor: 'cursor-1' })).toEqual({
      limit: 100,
      cursor: 'cursor-1',
    });
    expect(() => parsePageQuery({ limit: 101 })).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => parsePageQuery({ limit: 25, sql: 'select 1' })).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
  });

  it('bounds time series to thirty days and 720 points', () => {
    expect(
      parseSeriesQuery({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-06T00:00:00.000Z',
        points: '120',
      }),
    ).toEqual({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-06T00:00:00.000Z'),
      points: 120,
    });
    expect(() =>
      parseSeriesQuery({
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-09-06T00:00:00.000Z',
        points: 721,
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
  });

  it('accepts only the documented filters for each operations read', () => {
    expect(parseOperationsReadQuery('providers', { provider: 'ai', limit: '10' })).toEqual({
      provider: 'ai',
      cursor: null,
      limit: 10,
    });
    expect(parseOperationsReadQuery('health', { range: '7d', platform: 'ios' })).toEqual({
      range: '7d',
      platform: 'ios',
    });
    expect(() => parseOperationsReadQuery('job-runs', { ownerSpec: 5 })).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
    expect(() => parseOperationsReadQuery('scheduled-jobs', { ownerSpec: 12 })).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
  });

  it('requires bounded versioned reasons for job actions', () => {
    expect(
      parseJobAction({ expectedVersion: 2, reason: 'Retry after provider recovery.' }),
    ).toEqual({
      expectedVersion: 2,
      reason: 'Retry after provider recovery.',
    });
    expect(() => parseJobAction({ expectedVersion: 0, reason: 'too short' })).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
  });

  it('accepts only server-derived feature context keys', () => {
    expect(parseFlagContext({ platform: 'ios', locale: 'ar', appVersion: '1.2.3' })).toEqual({
      platform: 'ios',
      locale: 'ar',
      appVersion: '1.2.3',
    });
    expect(() => parseFlagContext({ role: 'admin' })).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => parseFlagContext({ plan: 'paid' })).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => parseFlagContext({})).toThrow('OPERATIONS_INPUT_INVALID');
  });

  it('rejects secrets, nested values, controls, and oversized safe metadata', () => {
    expect(safeRecord({ outcome: 'ok', count: 3, enabled: true }, 256)).toEqual({
      outcome: 'ok',
      count: 3,
      enabled: true,
    });
    expect(() => safeRecord({ accessToken: 'unsafe' }, 256)).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => safeRecord({ nested: { value: 'unsafe' } }, 256)).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
    expect(() => safeRecord({ summary: 'bad\u0000value' }, 256)).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
    expect(() => safeRecord({ summary: 'Bearer abcdefghijklmnop' }, 256)).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
    expect(() => safeRecord({ summary: 'operator@example.test' }, 256)).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
  });

  it('uses exact command fields and requires mutation evidence', () => {
    expect(
      parseOperationCommand('createIncident', {
        title: 'Database latency incident',
        severity: 'warning',
        startedAt: '2026-09-06T10:00:00.000Z',
        publicSummary: 'Some requests may be delayed.',
        reason: 'Investigating a sustained latency alert.',
      }),
    ).toEqual({
      title: 'Database latency incident',
      severity: 'warning',
      startedAt: '2026-09-06T10:00:00.000Z',
      publicSummary: 'Some requests may be delayed.',
      reason: 'Investigating a sustained latency alert.',
    });
    expect(() =>
      parseOperationCommand('updateSetting', {
        value: 30,
        expectedVersion: 1,
        reason: 'Adjust the bounded retention window.',
        sql: 'select 1',
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() => parseOperationCommand('createIncident', { title: 'Missing evidence' })).toThrow(
      'OPERATIONS_INPUT_INVALID',
    );
    expect(() =>
      parseOperationCommand('createIncident', {
        title: 'Unsafe provider detail',
        severity: 'warning',
        startedAt: '2026-09-06T10:00:00.000Z',
        publicSummary: 'See https://provider.invalid/private',
        reason: 'Reject raw provider details from public output.',
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
  });

  it('matches the approved flag and maintenance command names', () => {
    expect(
      parseOperationCommand('createFeatureFlag', {
        key: 'mobile.safe-demo',
        description: 'A safe deterministic feature.',
        defaultEnabled: false,
        reason: 'Enable a bounded client experiment.',
      }),
    ).toMatchObject({ key: 'mobile.safe-demo', defaultEnabled: false });
    expect(
      parseOperationCommand('createMaintenance', {
        startsAt: '2026-09-07T10:00:00.000Z',
        endsAt: '2026-09-07T11:00:00.000Z',
        scopes: ['api'],
        message: { ar: 'صيانة مجدولة', en: 'Scheduled maintenance' },
        reason: 'Apply a tested database migration.',
      }),
    ).toMatchObject({ scopes: ['api'] });
  });

  it('validates lifecycle updates before they reach persistence', () => {
    expect(
      parseOperationCommand('updateFeatureFlag', {
        status: 'retired',
        rules: [{ priority: 1, audience: { platform: 'ios' }, enabled: true }],
        expectedVersion: 2,
        reason: 'Retire the bounded client experiment.',
      }),
    ).toMatchObject({ status: 'retired' });
    expect(() =>
      parseOperationCommand('updateFeatureFlag', {
        status: 'enabled',
        expectedVersion: 2,
        reason: 'Reject an unknown lifecycle status.',
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() =>
      parseOperationCommand('updateFeatureFlag', {
        rules: [{ priority: 1, audience: { role: 'admin' }, enabled: true }],
        expectedVersion: 2,
        reason: 'Reject forged evaluation context.',
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');
    expect(() =>
      parseOperationCommand('updateMaintenance', {
        scopes: ['billing'],
        expectedVersion: 1,
        reason: 'Reject paid-service maintenance scope.',
      }),
    ).toThrow('OPERATIONS_INPUT_INVALID');

    expect(
      parseOperationCommand('createIncident', {
        title: 'Database latency incident',
        severity: 'warning',
        startedAt: '2026-09-06T10:00:00.000Z',
        publicSummary: null,
        assignedAdminId: 'admin-1',
        reason: 'Create an incident with an assigned responder.',
      }),
    ).toMatchObject({ publicSummary: null, assignedAdminId: 'admin-1' });
    expect(
      parseOperationCommand('updateIncident', {
        publicSummary: null,
        assignedAdminId: null,
        expectedVersion: 1,
        reason: 'Clear the public summary and current assignee.',
      }),
    ).toMatchObject({ publicSummary: null, assignedAdminId: null });
    expect(
      parseOperationCommand('updateMaintenance', {
        endsAt: '2026-09-07T12:00:00.000Z',
        expectedVersion: 1,
        reason: 'Extend the scheduled maintenance window safely.',
      }),
    ).toMatchObject({ endsAt: '2026-09-07T12:00:00.000Z' });
  });
});
