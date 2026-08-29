export const SUPPORT_RESOURCES = Object.freeze([
  'profile-contact',
  'account-status',
  'device-diagnostics',
  'session-diagnostics',
  'subscription-summary',
  'import-summary',
] as const);
export const SUPPORT_ACTIONS = Object.freeze([
  'read-masked',
  'read-status',
  'read-aggregate',
] as const);

export type SupportResource = (typeof SUPPORT_RESOURCES)[number];
export type SupportAction = (typeof SUPPORT_ACTIONS)[number];
export type SupportScope = ReadonlyArray<{
  resource: SupportResource;
  actions: readonly SupportAction[];
}>;

export type PrivacyEvidence = {
  requestId: string;
  userId: string;
  evidenceAt: Date;
  correlationId: string;
};
export type ExportEntry = {
  path: string;
  mediaType: 'application/json' | 'application/x-ndjson';
  stream: AsyncIterable<Uint8Array>;
};
export type DeletionOutcome = {
  deletedCount: number;
  anonymizedCount: number;
  retainedCount: number;
  policyIds: readonly string[];
};
export type RetentionCandidate = { resourceId: string; eligibleAt: Date; version: number };

export interface PrivacyDomainHandler {
  readonly resourceType: string;
  readonly schemaVersion: 1;
  export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry>;
  deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome>;
  listRetentionCandidates(
    before: Date,
    cursor: string | null,
    limit: number,
  ): Promise<{ items: readonly RetentionCandidate[]; nextCursor: string | null }>;
  applyRetention(
    candidate: RetentionCandidate,
    mode: 'delete' | 'anonymize' | 'archive',
    evidence: PrivacyEvidence,
  ): Promise<DeletionOutcome>;
}

export function normalizeSupportScope(
  input: ReadonlyArray<{ resource: string; actions: readonly string[] }>,
): SupportScope {
  if (input.length < 1 || input.length > SUPPORT_RESOURCES.length)
    throw new Error('SUPPORT_SCOPE_INVALID');
  const byResource = new Map<SupportResource, Set<SupportAction>>();
  for (const entry of input) {
    if (
      !SUPPORT_RESOURCES.includes(entry.resource as SupportResource) ||
      entry.actions.length < 1 ||
      entry.actions.length > SUPPORT_ACTIONS.length
    )
      throw new Error('SUPPORT_SCOPE_INVALID');
    const actions = byResource.get(entry.resource as SupportResource) ?? new Set<SupportAction>();
    for (const action of entry.actions) {
      if (!SUPPORT_ACTIONS.includes(action as SupportAction))
        throw new Error('SUPPORT_SCOPE_INVALID');
      actions.add(action as SupportAction);
    }
    byResource.set(entry.resource as SupportResource, actions);
  }
  return [...byResource.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resource, actions]) => ({ resource, actions: [...actions].sort() }));
}

export class PrivacyHandlerRegistry {
  private readonly handlers: readonly PrivacyDomainHandler[];

  constructor(handlers: readonly PrivacyDomainHandler[], expectedManifest: readonly string[]) {
    const ordered = [...handlers].sort((left, right) =>
      left.resourceType.localeCompare(right.resourceType),
    );
    const actual = ordered.map(({ resourceType }) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(resourceType)) throw new Error('PRIVACY_HANDLER_INVALID');
      return `${resourceType}@1`;
    });
    if (new Set(actual).size !== actual.length) throw new Error('PRIVACY_HANDLER_DUPLICATE');
    if (JSON.stringify(actual) !== JSON.stringify([...expectedManifest].sort()))
      throw new Error('PRIVACY_HANDLER_MANIFEST_MISMATCH');
    this.handlers = Object.freeze(ordered);
  }

  entries(): readonly PrivacyDomainHandler[] {
    return this.handlers;
  }
}
