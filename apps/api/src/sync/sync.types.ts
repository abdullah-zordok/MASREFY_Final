export const SYNC_DOMAINS = ['accounts', 'categories', 'planning', 'transactions'] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];

export const SYNC_OPERATIONS = ['create', 'update', 'archive', 'restore', 'delete'] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const SYNC_RESOURCE_TYPES = [
  'account',
  'category',
  'transaction',
  'salary-profile',
  'salary-receipt',
  'budget',
  'budget-category',
  'obligation',
  'obligation-schedule',
  'obligation-payment',
  'payment-match',
  'savings-goal',
  'savings-movement',
] as const;
export type SyncResourceType = (typeof SYNC_RESOURCE_TYPES)[number];

export interface SyncCursor {
  domain: SyncDomain;
  position: bigint;
}

export interface BootstrapCursor extends SyncCursor {
  after: string;
}

export interface SyncCursorScope {
  userId: string;
  deviceId: string;
}

export interface SyncMutation {
  operationId: string;
  domain: SyncDomain;
  resourceType: SyncResourceType;
  schemaVersion: 1;
  dependsOn: readonly string[];
  operation: SyncOperation;
  resourceId: string | null;
  baseVersion: number | null;
  payload: Record<string, unknown>;
}

export function isSyncDomain(value: unknown): value is SyncDomain {
  return typeof value === 'string' && (SYNC_DOMAINS as readonly string[]).includes(value);
}
