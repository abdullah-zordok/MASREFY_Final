/**
 * Foundation domain contracts.
 *
 * These types define the frontend contract surface for the Masarifi mobile
 * foundation. They are NOT production backend schemas; they model the typed
 * boundaries between UI, mock services, storage, and platform adapters.
 *
 * Authority: specs/001-mobile-foundation/data-model.md
 */

// ─── Platform ────────────────────────────────────────────────────────────────

export type Platform = 'android' | 'ios';

export type Locale = 'ar' | 'en';

export type LayoutDirection = 'rtl' | 'ltr';

export const localeDirection: Record<Locale, LayoutDirection> = {
  ar: 'rtl',
  en: 'ltr'
};

export function directionForLocale(locale: Locale): LayoutDirection {
  return localeDirection[locale];
}

// ─── Capability scope ────────────────────────────────────────────────────────

export type CapabilityScope =
  'core_v1' | 'platform_v1' | 'post_mvp' | 'excluded';

// ─── ProductCapability ───────────────────────────────────────────────────────

export interface ProductCapability {
  id: string;
  titleKey: string;
  scope: CapabilityScope;
  platforms: ReadonlySet<Platform>;
  primaryOutcome: string;
  manualFallbackId: string | null;
}

// ─── CaptureMethod ───────────────────────────────────────────────────────────

export type CaptureKind =
  'automatic' | 'voice' | 'manual' | 'platform_assisted';

export type CaptureAvailability =
  'available' | 'permission_required' | 'unavailable' | 'paused';

export interface CaptureMethod {
  kind: CaptureKind;
  platformAvailability: ReadonlySet<Platform>;
  permissionId: string | null;
  fallbackCapabilityId: string | null;
  availability: CaptureAvailability;
}

// ─── FinancialChange ─────────────────────────────────────────────────────────

export type FinancialChangeSource =
  'automatic' | 'voice' | 'manual' | 'assistant' | 'platform_assisted';

export type FinancialChangeCertainty = 'clear' | 'review_required' | 'rejected';

export type FinancialChangeStatus =
  | 'proposed'
  | 'awaiting_confirmation'
  | 'review_required'
  | 'applied'
  | 'rejected'
  | 'undone'
  | 'corrected';

export type CorrectionAction = 'undo' | 'edit' | 'report';

export interface FinancialChange {
  id: string;
  source: FinancialChangeSource;
  certainty: FinancialChangeCertainty;
  status: FinancialChangeStatus;
  sourceReference: string | null;
  confirmationRequired: boolean;
  correctionActions: ReadonlySet<CorrectionAction>;
  createdAt: number;
}

/**
 * Allowed FinancialChange state transitions.
 * See data-model.md §FinancialChange "State transitions".
 */
export const FINANCIAL_CHANGE_TRANSITIONS: ReadonlyMap<
  FinancialChangeStatus,
  ReadonlySet<FinancialChangeStatus>
> = new Map([
  [
    'proposed',
    new Set(['awaiting_confirmation', 'review_required', 'applied'])
  ],
  ['awaiting_confirmation', new Set(['applied'])],
  ['review_required', new Set(['applied', 'rejected'])],
  ['applied', new Set(['undone', 'corrected'])],
  ['rejected', new Set()],
  ['undone', new Set()],
  ['corrected', new Set()]
]);

// ─── PlatformCapability ──────────────────────────────────────────────────────

export type PlatformCapabilityAvailability =
  'supported' | 'unsupported' | 'permission_required';

export interface PlatformCapability {
  id: string;
  platform: Platform;
  availability: PlatformCapabilityAvailability;
  explanationKey: string;
  fallbackCapabilityIds: readonly string[];
}

// ─── PermissionState ─────────────────────────────────────────────────────────

export type PermissionStatus =
  | 'not_requested'
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'revoked'
  | 'unavailable';

export interface PermissionAction {
  key: string;
  kind: 'recovery' | 'disable' | 'continue' | 'skip';
}

export interface PermissionState {
  id: string;
  status: PermissionStatus;
  purposeKey: string;
  dataUseKey: string;
  disableAction: PermissionAction;
  recoveryAction: PermissionAction | null;
  blocking: boolean;
}

/**
 * Allowed PermissionState transitions.
 * See data-model.md §PermissionState "State transitions".
 */
export const PERMISSION_TRANSITIONS: ReadonlyMap<
  PermissionStatus,
  ReadonlySet<PermissionStatus>
> = new Map([
  ['not_requested', new Set(['granted', 'denied'])],
  ['granted', new Set(['revoked'])],
  ['denied', new Set(['granted', 'permanently_denied'])],
  ['revoked', new Set(['granted'])],
  ['permanently_denied', new Set()],
  ['unavailable', new Set()]
]);

// ─── FrontendState ───────────────────────────────────────────────────────────

export type FrontendStateKind =
  | 'initial'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error'
  | 'offline'
  | 'partial'
  | 'permission_required'
  | 'permission_denied'
  | 'permission_permanently_denied'
  | 'sync_pending'
  | 'sync_failed'
  | 'read_only'
  | 'disabled'
  | 'archived';

export interface FrontendState {
  kind: FrontendStateKind;
  messageKey: string;
  recoveryAction: PermissionAction | null;
  isDataComplete: boolean;
}

// ─── ReportingCurrency ───────────────────────────────────────────────────────

export interface ReportingCurrency {
  currencyCode: string;
  originalAmount: number;
  convertedAmount: number | null;
  conversionAsOf: number | null;
  isEstimated: boolean;
}

// ─── UserPreferences ─────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPreferences {
  locale: Locale;
  direction: LayoutDirection;
  firstLaunchOnboardingCompleted: boolean;
  theme: ThemePreference;
  hideBalances: boolean;
  baseCurrencyCode: string;
  timeZone: string;
  reducedMotion: boolean;
  firstDayOfWeek: 'sunday' | 'monday' | 'saturday';
  defaultAccountId: string | null;
  transactionDefaultType: 'expense' | 'income';
  dashboardSections: (
    'balance' | 'transactions' | 'budgets' | 'goals' | 'reports'
  )[];
  voiceEnabled: boolean;
  trackingPersonalization: boolean;
  assistantPersonalization: boolean;
  analyticsEnabled: boolean;
  monthStartDay: number;
}

export function buildPreferences(
  overrides: Partial<UserPreferences>
): UserPreferences {
  const defaults: UserPreferences = {
    locale: 'ar',
    direction: 'rtl',
    firstLaunchOnboardingCompleted: false,
    theme: 'light',
    hideBalances: false,
    baseCurrencyCode: 'SAR',
    timeZone: 'Asia/Riyadh',
    reducedMotion: false,
    firstDayOfWeek: 'sunday',
    defaultAccountId: null,
    transactionDefaultType: 'expense',
    dashboardSections: [
      'balance',
      'transactions',
      'budgets',
      'goals',
      'reports'
    ],
    voiceEnabled: true,
    trackingPersonalization: true,
    assistantPersonalization: true,
    analyticsEnabled: true,
    monthStartDay: 1
  };
  const merged = { ...defaults, ...overrides };
  // Direction is derived from locale; never store an inconsistent pair.
  return { ...merged, direction: directionForLocale(merged.locale) };
}

// ─── OfflineEntry ────────────────────────────────────────────────────────────

export type OfflineEntrySyncStatus =
  'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export type OfflineEntryPayload = {
  amount: number;
  currencyCode: string;
  categoryKey: string;
  note: string | null;
};

export interface OfflineEntry {
  localId: string;
  payload: OfflineEntryPayload;
  syncStatus: OfflineEntrySyncStatus;
  createdAt: number;
  updatedAt: number;
  lastErrorKey: string | null;
}

/**
 * Sentinel used by the deleted transition. OfflineEntry has no `deleted` status
 * in its enum, but the transition table permits `pending -> deleted`. Deleted
 * entries are removed from storage; this constant represents that terminal.
 */
export const OFFLINE_ENTRY_DELETED = 'deleted' as const;
export type OfflineEntryTerminal = typeof OFFLINE_ENTRY_DELETED;

/**
 * Allowed OfflineEntry sync transitions.
 * See data-model.md §OfflineEntry "State transitions".
 *
 * Values may contain the `deleted` terminal alongside sync statuses.
 */
export const OFFLINE_ENTRY_TRANSITIONS: ReadonlyMap<
  OfflineEntrySyncStatus,
  ReadonlySet<OfflineEntrySyncStatus | OfflineEntryTerminal>
> = new Map([
  ['pending', new Set(['syncing', OFFLINE_ENTRY_DELETED])],
  ['syncing', new Set(['synced', 'failed', 'conflict'])],
  ['failed', new Set(['pending'])],
  ['conflict', new Set(['pending'])],
  ['synced', new Set()]
]);
