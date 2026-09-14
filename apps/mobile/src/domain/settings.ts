import { z } from 'zod';
import { notificationTargetSchema, safeFailureSchema } from './notifications';
import type { UserPreferences } from './foundation';

const timeZone = z.string().refine((value) => { try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; } });
export const userProfileSchema = z.object({ name: z.string().max(120).nullable(), avatar: z.string().max(64), phone: z.string().nullable(), birthday: z.string().nullable().optional(), gender: z.enum(['male', 'female']).nullable().optional(), googleAccount: z.string().nullable(), email: z.string().email().nullable(), country: z.string().length(2), currency: z.string().regex(/^[A-Z]{3}$/), timeZone, completion: z.array(z.string()), version: z.number().int().positive() });
export type UserProfile = z.infer<typeof userProfileSchema>; export type UserProfileInput = Omit<UserProfile, 'version'>;
export type OwnerPreferences = {
  defaultCurrency: string;
  language: 'ar' | 'en';
  theme: 'light' | 'dark' | 'system';
  calendar: 'gregorian' | 'hijri';
  weekStart: number;
  privacySettings: Record<string, boolean>;
  version: number;
};
export type OwnerOnboardingProgress = {
  step: string;
  completedSteps: string[];
  completedAt: string | null;
  version: number;
};
export type ProfileSetupSnapshot = {
  profile: UserProfile;
  preferences: OwnerPreferences;
  onboarding: OwnerOnboardingProgress;
  complete: boolean;
};
export type ProfileSetupInput = { name: string; currency: string };
export type ProfileSetupStatus =
  | 'unknown'
  | 'loading'
  | 'incomplete'
  | 'complete'
  | 'error';
export const applicationPreferencesSchema = z.object({ locale: z.enum(['ar', 'en']), theme: z.enum(['light', 'dark', 'system']), hideBalances: z.boolean(), reducedMotion: z.boolean(), baseCurrencyCode: z.string().regex(/^[A-Z]{3}$/), timeZone, firstDayOfWeek: z.enum(['sunday', 'monday', 'saturday']), defaultAccountId: z.string().regex(/^[A-Za-z0-9_-]+$/).nullable(), transactionDefaults: z.object({ type: z.enum(['expense', 'income']).optional() }).strict(), dashboardSections: z.array(z.enum(['balance', 'transactions', 'budgets', 'goals', 'reports'])), voiceEnabled: z.boolean() }).strict();
export type ApplicationPreferences = Pick<UserPreferences, 'locale' | 'theme' | 'hideBalances' | 'reducedMotion' | 'baseCurrencyCode'> & z.infer<typeof applicationPreferencesSchema>;
export const userProfileInputSchema = userProfileSchema.omit({ version: true }); export const applicationPreferencesInputSchema = applicationPreferencesSchema;
export const representativeSessionSchema = z.object({ id: z.string().min(1), deviceLabel: z.string().min(1).max(120), platform: z.enum(['android', 'ios', 'web']), createdAt: z.number().int().nonnegative(), lastActiveAt: z.number().int().nonnegative(), isCurrentDevice: z.boolean(), status: z.enum(['active', 'revoking', 'revoked']) });
export type RepresentativeSession = z.infer<typeof representativeSessionSchema>;
export const securityEventSchema = z.object({ id: z.string().min(1), type: z.enum(['new_session', 'session_revocation', 'access_protection_change', 'other']), deviceLabel: z.string().min(1).max(120), platform: z.enum(['android', 'ios', 'web']), occurredAt: z.number().int().nonnegative(), status: z.enum(['pending', 'succeeded', 'failed']), recoveryDestination: notificationTargetSchema });
export type SecurityEvent = z.infer<typeof securityEventSchema>;
export const privacyRequestSchema = z.object({ id: z.string().min(1), operationId: z.string().min(1), kind: z.enum(['data_export', 'account_deletion']), status: z.enum(['review', 'pending', 'accepted', 'failed', 'cancelled']), requestedAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(), safeFailure: safeFailureSchema.nullable() });
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>; export type LocalDataDeletionResult = { deletedRows: number };
