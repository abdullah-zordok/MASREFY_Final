const INVALID = 'OPERATIONS_INPUT_INVALID';
// eslint-disable-next-line no-control-regex -- reject non-printing and bidi control input at the API boundary.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const FORBIDDEN_KEY = /secret|token|password|credential|private.?key|connection|url|sql|command/i;
const FORBIDDEN_FLAG =
  /auth|permission|role|rls|audit|idempot|ledger|webhook|encrypt|release|billing|payment|subscription|entitlement|checkout|promotion|stripe/i;
const SENSITIVE_TEXT =
  /(?:https?:\/\/|postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._~-]{8,}|\bsk_[a-z0-9]{8,}|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b)/iu;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(INVALID);
}

function integer(value: unknown, minimum: number, maximum: number): number {
  const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) < minimum || (parsed as number) > maximum)
    throw new Error(INVALID);
  return parsed as number;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string') throw new Error(INVALID);
  const normalized = value.normalize('NFC').trim();
  if (normalized.length < minimum || normalized.length > maximum || CONTROL.test(normalized))
    throw new Error(INVALID);
  return normalized;
}

function scalarText(value: unknown): string {
  if (typeof value !== 'string') throw new Error(INVALID);
  return value;
}

export function parsePageQuery(value: unknown): { limit: number; cursor: string | null } {
  const input = record(value);
  exact(input, ['limit', 'cursor']);
  return {
    limit: input.limit === undefined ? 25 : integer(input.limit, 1, 100),
    cursor: input.cursor === undefined ? null : text(input.cursor, 1, 256),
  };
}

export function parseSeriesQuery(value: unknown): { from: Date; to: Date; points: number } {
  const input = record(value);
  exact(input, ['from', 'to', 'points']);
  const from = new Date(text(input.from, 20, 35));
  const to = new Date(text(input.to, 20, 35));
  const points = input.points === undefined ? 120 : integer(input.points, 1, 720);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > 30 * 24 * 60 * 60 * 1_000
  )
    throw new Error(INVALID);
  return { from, to, points };
}

const PAGE_FILTERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  providers: ['provider', 'status'],
  'scheduled-jobs': ['ownerSpec', 'enabled'],
  'job-runs': ['jobKey', 'status'],
  incidents: ['status', 'severity'],
  settings: [],
  flags: [],
  maintenance: [],
});

export function parseOperationsReadQuery(kind: string, value: unknown): Record<string, unknown> {
  const input = record(value);
  if (kind === 'job-run') {
    exact(input, ['runId']);
    const runId = text(input.runId, 36, 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(runId))
      throw new Error(INVALID);
    return { runId };
  }
  if (kind === 'setting') {
    exact(input, ['settingKey']);
    const settingKey = text(input.settingKey, 3, 128);
    if (!/^[a-z][a-z0-9_.-]+$/u.test(settingKey)) throw new Error(INVALID);
    return { settingKey };
  }
  if (kind === 'recovery') {
    exact(input, []);
    return {};
  }
  if (kind === 'health' || kind === 'queues' || kind === 'performance') {
    exact(input, kind === 'health' ? ['range', 'platform'] : ['range']);
    const range = input.range === undefined ? '24h' : scalarText(input.range);
    if (!['1h', '24h', '7d', '30d'].includes(range)) throw new Error(INVALID);
    const output: Record<string, unknown> = { range };
    if (kind === 'health') {
      const platform = input.platform === undefined ? 'all' : scalarText(input.platform);
      if (!['all', 'ios', 'android'].includes(platform)) throw new Error(INVALID);
      output.platform = platform;
    }
    return output;
  }
  const filters = PAGE_FILTERS[kind];
  if (!filters) throw new Error(INVALID);
  exact(input, ['limit', 'cursor', ...filters]);
  const output: Record<string, unknown> = parsePageQuery({
    limit: input.limit,
    cursor: input.cursor,
  });
  if (
    input.provider !== undefined &&
    !['database', 'storage', 'identity', 'ai', 'email', 'push'].includes(scalarText(input.provider))
  )
    throw new Error(INVALID);
  if (input.status !== undefined) {
    const statuses =
      kind === 'providers'
        ? ['up', 'degraded', 'down', 'unknown']
        : kind === 'job-runs'
          ? ['queued', 'running', 'succeeded', 'failed', 'retrying', 'dead_lettered', 'canceled']
          : ['open', 'investigating', 'monitoring', 'resolved'];
    if (!statuses.includes(scalarText(input.status))) throw new Error(INVALID);
  }
  if (
    input.severity !== undefined &&
    !['info', 'warning', 'critical'].includes(scalarText(input.severity))
  )
    throw new Error(INVALID);
  if (input.ownerSpec !== undefined) {
    const ownerSpec = integer(input.ownerSpec, 1, 13);
    if (ownerSpec === 12) throw new Error(INVALID);
    output.ownerSpec = ownerSpec;
  }
  if (input.enabled !== undefined) {
    if (!['true', 'false', true, false].includes(input.enabled as never)) throw new Error(INVALID);
    output.enabled = input.enabled === true || input.enabled === 'true';
  }
  if (input.jobKey !== undefined) output.jobKey = text(input.jobKey, 3, 128);
  for (const key of ['provider', 'status', 'severity'] as const)
    if (input[key] !== undefined) output[key] = scalarText(input[key]);
  return output;
}

export function parseJobAction(value: unknown): { expectedVersion: number; reason: string } {
  const input = record(value);
  exact(input, ['expectedVersion', 'reason']);
  return {
    expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER),
    reason: text(input.reason, 10, 500),
  };
}

export type FlagContext = {
  platform?: 'ios' | 'android' | 'admin';
  locale?: 'ar' | 'en';
  appVersion?: string;
  cohort?: string;
};

export function parseFlagContext(value: unknown): FlagContext {
  const input = record(value);
  exact(input, ['platform', 'locale', 'appVersion', 'cohort']);
  if (Object.keys(input).length === 0) throw new Error(INVALID);
  const output: FlagContext = {};
  if (input.platform !== undefined) {
    if (!['ios', 'android', 'admin'].includes(scalarText(input.platform))) throw new Error(INVALID);
    output.platform = input.platform as FlagContext['platform'];
  }
  if (input.locale !== undefined) {
    if (!['ar', 'en'].includes(scalarText(input.locale))) throw new Error(INVALID);
    output.locale = input.locale as FlagContext['locale'];
  }
  if (input.appVersion !== undefined) {
    const version = text(input.appVersion, 1, 32);
    if (!/^\d+(\.\d+){0,2}$/u.test(version)) throw new Error(INVALID);
    output.appVersion = version;
  }
  if (input.cohort !== undefined) {
    const cohort = text(input.cohort, 2, 32);
    if (!/^[a-z][a-z0-9_-]+$/u.test(cohort)) throw new Error(INVALID);
    output.cohort = cohort;
  }
  return output;
}

export function safeRecord(
  value: unknown,
  maximumBytes = 2_048,
): Record<string, string | number | boolean | null> {
  const input = record(value);
  if (Object.keys(input).length > 20) throw new Error(INVALID);
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(input)) {
    if (!/^[a-z][a-zA-Z0-9_.-]{0,79}$/u.test(key) || FORBIDDEN_KEY.test(key))
      throw new Error(INVALID);
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item))
      throw new Error(INVALID);
    if (
      typeof item === 'string' &&
      (item.length > 500 || CONTROL.test(item) || SENSITIVE_TEXT.test(item))
    )
      throw new Error(INVALID);
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error(INVALID);
    output[key] = item as string | number | boolean | null;
  }
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > maximumBytes) throw new Error(INVALID);
  return output;
}

export type OperationCommand =
  | 'createIncident'
  | 'updateIncident'
  | 'updateSetting'
  | 'createFeatureFlag'
  | 'updateFeatureFlag'
  | 'createMaintenance'
  | 'updateMaintenance';

const MAINTENANCE_SCOPES = new Set([
  'api',
  'database',
  'storage',
  'identity',
  'ai',
  'email',
  'push',
  'imports',
  'reports',
  'notifications',
]);

const COMMAND_FIELDS: Readonly<Record<OperationCommand, readonly string[]>> = Object.freeze({
  createIncident: ['title', 'severity', 'startedAt', 'publicSummary', 'assignedAdminId', 'reason'],
  updateIncident: [
    'status',
    'severity',
    'publicSummary',
    'assignedAdminId',
    'expectedVersion',
    'reason',
  ],
  updateSetting: ['value', 'expectedVersion', 'reason'],
  createFeatureFlag: ['key', 'description', 'defaultEnabled', 'reason'],
  updateFeatureFlag: [
    'description',
    'defaultEnabled',
    'status',
    'rules',
    'expectedVersion',
    'reason',
  ],
  createMaintenance: ['startsAt', 'endsAt', 'scopes', 'message', 'reason'],
  updateMaintenance: [
    'startsAt',
    'endsAt',
    'scopes',
    'message',
    'status',
    'expectedVersion',
    'reason',
  ],
});

function safeJson(value: unknown, depth = 0): void {
  if (depth > 4 || value === undefined || typeof value === 'function' || typeof value === 'symbol')
    throw new Error(INVALID);
  if (
    typeof value === 'string' &&
    (value.length > 500 || CONTROL.test(value) || SENSITIVE_TEXT.test(value))
  )
    throw new Error(INVALID);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(INVALID);
  if (Array.isArray(value)) {
    if (value.length > 20) throw new Error(INVALID);
    value.forEach((item) => {
      safeJson(item, depth + 1);
    });
  } else if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length > 20) throw new Error(INVALID);
    for (const [key, item] of Object.entries(object)) {
      if (FORBIDDEN_KEY.test(key)) throw new Error(INVALID);
      safeJson(item, depth + 1);
    }
  }
}

export function parseOperationCommand(
  operation: OperationCommand,
  value: unknown,
): Record<string, unknown> {
  const input = record(value);
  exact(input, COMMAND_FIELDS[operation]);
  safeJson(input);
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 4_096) throw new Error(INVALID);
  const output = { ...input };
  output.reason = text(input.reason, 10, 500);
  if (operation.startsWith('update'))
    output.expectedVersion = integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER);
  if (operation === 'createIncident') {
    output.title = text(input.title, 5, 160);
    if (!['info', 'warning', 'critical'].includes(String(input.severity))) throw new Error(INVALID);
    if (!Number.isFinite(Date.parse(text(input.startedAt, 20, 35)))) throw new Error(INVALID);
    if (input.publicSummary !== undefined)
      output.publicSummary =
        input.publicSummary === null ? null : text(input.publicSummary, 1, 500);
    if (input.assignedAdminId !== undefined)
      output.assignedAdminId =
        input.assignedAdminId === null ? null : text(input.assignedAdminId, 1, 128);
  } else if (operation === 'updateIncident') {
    if (
      !['status', 'severity', 'publicSummary', 'assignedAdminId'].some(
        (key) => input[key] !== undefined,
      )
    )
      throw new Error(INVALID);
    if (
      input.status !== undefined &&
      !['open', 'investigating', 'monitoring', 'resolved'].includes(scalarText(input.status))
    )
      throw new Error(INVALID);
    if (
      input.severity !== undefined &&
      !['info', 'warning', 'critical'].includes(scalarText(input.severity))
    )
      throw new Error(INVALID);
    if (input.publicSummary !== undefined)
      output.publicSummary =
        input.publicSummary === null ? null : text(input.publicSummary, 1, 500);
    if (input.assignedAdminId !== undefined)
      output.assignedAdminId =
        input.assignedAdminId === null ? null : text(input.assignedAdminId, 1, 128);
  } else if (operation === 'createFeatureFlag') {
    const key = text(input.key, 3, 80);
    if (
      !/^[a-z][a-z0-9.-]+$/u.test(key) ||
      FORBIDDEN_FLAG.test(key) ||
      typeof input.defaultEnabled !== 'boolean'
    )
      throw new Error(INVALID);
    output.key = key;
    output.description = text(input.description, 10, 240);
  } else if (operation === 'updateFeatureFlag') {
    if (
      !['description', 'defaultEnabled', 'status', 'rules'].some((key) => input[key] !== undefined)
    )
      throw new Error(INVALID);
    if (input.description !== undefined) output.description = text(input.description, 10, 240);
    if (input.defaultEnabled !== undefined && typeof input.defaultEnabled !== 'boolean')
      throw new Error(INVALID);
    if (
      input.status !== undefined &&
      !['draft', 'active', 'retired'].includes(scalarText(input.status))
    )
      throw new Error(INVALID);
    if (input.rules !== undefined) {
      if (!Array.isArray(input.rules) || input.rules.length > 100) throw new Error(INVALID);
      output.rules = input.rules.map((value) => {
        const rule = record(value);
        exact(rule, ['priority', 'audience', 'enabled']);
        if (typeof rule.enabled !== 'boolean') throw new Error(INVALID);
        return {
          priority: integer(rule.priority, 1, 1_000),
          audience: parseFlagContext(rule.audience),
          enabled: rule.enabled,
        };
      });
    }
  } else if (operation === 'createMaintenance' || operation === 'updateMaintenance') {
    if (
      operation === 'updateMaintenance' &&
      !['startsAt', 'endsAt', 'scopes', 'message', 'status'].some((key) => input[key] !== undefined)
    )
      throw new Error(INVALID);
    if (
      operation === 'createMaintenance' &&
      (input.scopes === undefined || input.message === undefined)
    )
      throw new Error(INVALID);
    if (input.startsAt !== undefined) output.startsAt = text(input.startsAt, 20, 35);
    if (input.endsAt !== undefined) output.endsAt = text(input.endsAt, 20, 35);
    if (operation === 'createMaintenance') {
      if (typeof output.startsAt !== 'string' || typeof output.endsAt !== 'string')
        throw new Error(INVALID);
    }
    if (
      output.startsAt !== undefined &&
      (typeof output.startsAt !== 'string' || !Number.isFinite(Date.parse(output.startsAt)))
    )
      throw new Error(INVALID);
    if (
      output.endsAt !== undefined &&
      (typeof output.endsAt !== 'string' || !Number.isFinite(Date.parse(output.endsAt)))
    )
      throw new Error(INVALID);
    if (typeof output.startsAt === 'string' && typeof output.endsAt === 'string') {
      const startsAt = new Date(output.startsAt);
      const endsAt = new Date(output.endsAt);
      if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 86_400_000)
        throw new Error(INVALID);
    }
    if (input.scopes !== undefined) {
      if (
        !Array.isArray(input.scopes) ||
        input.scopes.length < 1 ||
        input.scopes.length > 10 ||
        new Set(input.scopes).size !== input.scopes.length ||
        input.scopes.some((scope) => typeof scope !== 'string' || !MAINTENANCE_SCOPES.has(scope))
      )
        throw new Error(INVALID);
    }
    if (input.message !== undefined) {
      const message = record(input.message);
      exact(message, ['ar', 'en']);
      output.message = { ar: text(message.ar, 1, 240), en: text(message.en, 1, 240) };
    }
    if (
      input.status !== undefined &&
      !['scheduled', 'active', 'completed', 'canceled'].includes(scalarText(input.status))
    )
      throw new Error(INVALID);
  }
  return output;
}
