import { z } from 'zod';

import {
  accountInputSchema,
  type Account,
  type AccountInput
} from '@/domain/core-finance';
import {
  configureMobileApiTokenProvider,
  HttpError,
  requestJson
} from './http-client';
import type { AccountBalanceProjection } from '@/services/contracts/core-finance-service';
import { captureLiveClerkIdentity } from './auth-service';

const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const timestamp = Date.parse(value);
    return (
      Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
    );
  })
  .nullable();
const accountResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    type: accountInputSchema.innerType().shape.type,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    institutionName: z.string().nullable().optional().default(null),
    lastFour: z
      .string()
      .regex(/^\d{4}$/u)
      .nullable()
      .optional()
      .default(null),
    creditLimitMinor: z
      .number()
      .int()
      .safe()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    isDefault: z.boolean(),
    iconKey: z.string().nullable().optional().default(null),
    colorKey: z.string().nullable().optional().default(null),
    notes: z.string().nullable().optional().default(null),
    status: z.enum(['active', 'archived', 'closed']),
    sortOrder: z.number().int().safe(),
    includeInTotals: z.boolean(),
    automaticTrackingEnabled: z.boolean(),
    statementDay: z.number().int().min(1).max(28).nullable(),
    paymentDueDay: z.number().int().min(1).max(28).nullable(),
    monthlyInterestRateBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .nullable(),
    minimumPaymentMinor: z.number().int().safe().positive().nullable(),
    openedAt: nullableDate.optional().default(null),
    closedAt: nullableDate.optional().default(null),
    version: z.number().int().positive().safe(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();
const accountPageSchema = z
  .object({
    items: z.array(accountResponseSchema).max(100),
    nextCursor: z.string().nullable()
  })
  .strict();
const createAccountResponseSchema = z
  .object({
    account: accountResponseSchema,
    openingTransactionId: z.string().uuid().nullable().optional()
  })
  .strict();
const emptyResponseSchema = z.null();
const accountSummarySchema = z
  .object({
    accountId: z.string().uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    balance: z
      .object({
        accountId: z.string().uuid(),
        currency: z.string().regex(/^[A-Z]{3}$/u),
        confirmedMinor: z.number().int().safe(),
        pendingMinor: z.number().int().safe(),
        ledgerVersion: z.number().int().safe().nonnegative(),
        reconciledAt: z
          .string()
          .datetime({ offset: true })
          .nullable()
          .optional()
          .default(null)
      })
      .strict(),
    recentTransactions: z.array(z.unknown()).max(25),
    ledgerVersion: z.number().int().safe().nonnegative(),
    requestId: z.string().min(1).max(128)
  })
  .strict();
const payoffInputSchema = z
  .object({
    balanceMinor: z.number().int().safe().nonnegative(),
    monthlyInterestRateBasisPoints: z.number().int().min(0).max(10_000),
    paymentMinor: z.number().int().safe().positive()
  })
  .strict();
const payoffResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('payoff'),
      months: z.number().int().min(0).max(1_200),
      totalInterestMinor: z.number().int().safe().nonnegative(),
      totalPaidMinor: z.number().int().safe().nonnegative(),
      finalPaymentMinor: z.number().int().safe().nonnegative()
    })
    .strict(),
  z
    .object({
      status: z.literal('non_payoff'),
      reason: z.enum(['payment_not_above_interest', 'month_limit_exceeded']),
      monthlyInterestMinor: z.number().int().safe().nonnegative()
    })
    .strict()
]);

export type VersionedAccount = Omit<
  Account,
  'openingBalanceMinor' | 'status'
> & {
  status: 'active' | 'archived' | 'closed';
  sortOrder: number;
  includeInTotals: boolean;
  openedAt: number | null;
  closedAt: number | null;
  version: number;
  openingTransactionId?: string | null;
};

function accountFromApi(value: unknown): VersionedAccount {
  const row = accountResponseSchema.parse(value);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currencyCode: row.currency,
    version: row.version,
    institution: row.institutionName,
    lastFour: row.lastFour,
    creditLimitMinor: row.creditLimitMinor,
    statementDay: row.statementDay,
    paymentDueDay: row.paymentDueDay,
    monthlyInterestRateBasisPoints: row.monthlyInterestRateBasisPoints,
    minimumPaymentMinor: row.minimumPaymentMinor,
    automaticTrackingEnabled: row.automaticTrackingEnabled,
    isDefault: row.isDefault,
    iconKey: row.iconKey,
    colorKey: row.colorKey,
    notes: row.notes,
    status: row.status,
    sortOrder: row.sortOrder,
    includeInTotals: row.includeInTotals,
    openedAt: row.openedAt === null ? null : Date.parse(row.openedAt),
    closedAt: row.closedAt === null ? null : Date.parse(row.closedAt),
    createdAt: Date.parse(row.createdAt),
    updatedAt: Date.parse(row.updatedAt)
  };
}

export function createLiveAccountService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch
}: {
  baseUrl?: string;
  token?: () => Promise<string | null>;
  request?: typeof fetch;
} = {}) {
  if (token) configureMobileApiTokenProvider(token);
  const send = async <T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    options: {
      body?: Record<string, unknown>;
      operationId?: string;
      emptyValue?: T;
      identity?: Awaited<ReturnType<typeof captureLiveClerkIdentity>>;
    } = {}
  ) => {
    if (method !== 'GET' && !options.operationId?.trim())
      throw new HttpError('validation_error', 400);
    const identity = options.identity ?? (await captureLiveClerkIdentity());
    await identity.assertCurrent();
    const result = await requestJson(path, schema, {
      baseUrl,
      request,
      method,
      headers: options.operationId
        ? { 'Idempotency-Key': options.operationId }
        : undefined,
      body: options.body,
      token: identity.token,
      ...(options.emptyValue === undefined
        ? {}
        : { emptyValue: options.emptyValue })
    });
    await identity.assertCurrent();
    return result;
  };

  return {
    async listAccounts(includeArchived = false): Promise<VersionedAccount[]> {
      const identity = await captureLiveClerkIdentity();
      const accounts: VersionedAccount[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ limit: '100' });
        if (!includeArchived) query.set('status', 'active');
        if (cursor) query.set('cursor', cursor);
        const page = await send(
          'GET',
          `/api/v1/accounts?${query.toString()}`,
          accountPageSchema,
          { identity }
        );
        accounts.push(...page.items.map(accountFromApi));
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new HttpError('contract_mismatch', 502);
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return accounts;
    },
    async getAccount(id: string): Promise<VersionedAccount> {
      return accountFromApi(
        await send(
          'GET',
          `/api/v1/accounts/${encodeURIComponent(id)}`,
          accountResponseSchema
        )
      );
    },
    async getAccountBalance(
      id: string,
      expectedCurrency: string
    ): Promise<AccountBalanceProjection> {
      const value = await send(
        'GET',
        `/api/v1/accounts/${encodeURIComponent(id)}/summary`,
        accountSummarySchema
      );
      if (
        value.accountId !== id ||
        value.balance.accountId !== id ||
        value.currency !== expectedCurrency ||
        value.balance.currency !== expectedCurrency ||
        value.balance.ledgerVersion !== value.ledgerVersion
      )
        throw new HttpError('contract_mismatch', 502);
      return {
        accountId: id,
        balanceMinor: value.balance.confirmedMinor,
        currencyCode: value.currency
      };
    },
    async calculateCreditCardPayoff(
      input: z.input<typeof payoffInputSchema>
    ): Promise<z.output<typeof payoffResponseSchema>> {
      const body = payoffInputSchema.parse(input);
      const identity = await captureLiveClerkIdentity();
      await identity.assertCurrent();
      const result = await requestJson(
        '/api/v1/credit-card-payoff',
        payoffResponseSchema,
        {
          baseUrl,
          request,
          method: 'POST',
          body,
          token: identity.token
        }
      );
      await identity.assertCurrent();
      return result;
    },
    async createAccount(
      input: AccountInput,
      operationId: string
    ): Promise<VersionedAccount> {
      const { currencyCode, institution, openedAt, ...fields } =
        accountInputSchema.parse(input);
      const result = await send(
        'POST',
        '/api/v1/accounts',
        createAccountResponseSchema,
        {
          body: {
            ...fields,
            currency: currencyCode,
            institutionName: institution,
            ...(openedAt === undefined
              ? {}
              : {
                  openedAt:
                    openedAt === null
                      ? null
                      : new Date(openedAt).toISOString().slice(0, 10)
                })
          },
          operationId
        }
      );
      return {
        ...accountFromApi(result.account),
        openingTransactionId: result.openingTransactionId ?? null
      };
    },
    async updateAccount(
      id: string,
      input: AccountInput,
      expectedVersion: number,
      operationId: string
    ): Promise<VersionedAccount> {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new HttpError('validation_error', 400);
      const parsed = accountInputSchema.parse(input);
      const body: Record<string, unknown> = { expectedVersion };
      for (const key of Object.keys(parsed) as (keyof typeof parsed)[]) {
        if (
          key === 'currencyCode' ||
          key === 'openingBalanceMinor' ||
          input[key] === undefined
        )
          continue;
        body[key === 'institution' ? 'institutionName' : key] =
          key === 'openedAt' && typeof parsed[key] === 'number'
            ? new Date(parsed[key]).toISOString().slice(0, 10)
            : parsed[key];
      }
      return accountFromApi(
        await send(
          'PATCH',
          `/api/v1/accounts/${encodeURIComponent(id)}`,
          accountResponseSchema,
          { body, operationId }
        )
      );
    },
    async archiveAccount(
      id: string,
      expectedVersion: number,
      operationId: string
    ): Promise<void> {
      await send(
        'DELETE',
        `/api/v1/accounts/${encodeURIComponent(id)}?expectedVersion=${String(expectedVersion)}`,
        emptyResponseSchema,
        { operationId, emptyValue: null }
      );
    },
    async restoreAccount(
      id: string,
      expectedVersion: number,
      operationId: string
    ): Promise<VersionedAccount> {
      return accountFromApi(
        await send(
          'POST',
          `/api/v1/accounts/${encodeURIComponent(id)}/restore`,
          accountResponseSchema,
          { body: { expectedVersion }, operationId }
        )
      );
    },
    async closeAccount(
      id: string,
      closedAt: string,
      expectedVersion: number,
      operationId: string
    ): Promise<VersionedAccount> {
      return accountFromApi(
        await send(
          'POST',
          `/api/v1/accounts/${encodeURIComponent(id)}/close`,
          accountResponseSchema,
          { body: { closedAt, expectedVersion }, operationId }
        )
      );
    }
  };
}
