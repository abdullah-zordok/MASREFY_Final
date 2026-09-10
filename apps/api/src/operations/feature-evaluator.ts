import { createHash } from 'node:crypto';

import type { FlagContext } from './operations.schemas';

const INVARIANT_FLAG =
  /auth|permission|role|rls|audit|idempot|ledger|webhook|encrypt|release|billing|payment|subscription|entitlement|checkout|promotion|stripe/iu;

export type EvaluatedFlag = Readonly<{
  key: string;
  enabled: boolean;
  version: number;
  source: 'rule' | 'default' | 'missing' | 'retired' | 'invalid_context' | 'invariant_blocked';
}>;

export type FeatureDefinition = Readonly<{
  key: string;
  defaultEnabled: boolean;
  status: 'draft' | 'active' | 'retired';
  version: number;
  rules: readonly Readonly<{
    priority: number;
    audience: FlagContext;
    enabled: boolean;
  }>[];
}>;

function matches(audience: FlagContext, context: FlagContext): boolean {
  return Object.entries(audience).every(([key, value]) =>
    key === 'appVersion'
      ? context.appVersion?.startsWith(value) === true
      : context[key as keyof FlagContext] === value,
  );
}

export function derivePercentageCohort(subject: string): string {
  const bucket = createHash('sha256').update(subject).digest().readUInt32BE(0) % 100;
  return `percent-${String(bucket).padStart(2, '0')}`;
}

export function evaluateFeatureFlag(
  flag: FeatureDefinition | undefined,
  context: FlagContext,
): EvaluatedFlag {
  if (!flag) return { key: '', enabled: false, version: 0, source: 'missing' };
  if (INVARIANT_FLAG.test(flag.key))
    return {
      key: flag.key,
      enabled: false,
      version: flag.version,
      source: 'invariant_blocked',
    };
  if (flag.status !== 'active')
    return { key: flag.key, enabled: false, version: flag.version, source: 'retired' };
  const rule = [...flag.rules]
    .filter((candidate) => candidate.enabled && matches(candidate.audience, context))
    .sort((left, right) => left.priority - right.priority)[0];
  return {
    key: flag.key,
    enabled: rule ? true : flag.defaultEnabled,
    version: flag.version,
    source: rule ? 'rule' : 'default',
  };
}
