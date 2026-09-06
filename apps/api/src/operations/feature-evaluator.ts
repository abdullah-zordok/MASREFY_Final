import type { FlagContext } from './operations.schemas';

export type EvaluatedFlag = Readonly<{
  key: string;
  enabled: boolean;
  version: number;
  source: 'rule' | 'default' | 'missing' | 'retired' | 'invalid_context';
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

export function evaluateFeatureFlag(
  flag: FeatureDefinition | undefined,
  context: FlagContext,
): EvaluatedFlag {
  if (!flag) return { key: '', enabled: false, version: 0, source: 'missing' };
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
