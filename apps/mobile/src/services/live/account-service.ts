import { z } from 'zod';

import {
  accountInputSchema,
  type Account,
  type AccountInput
} from '@/domain/core-finance';
import { CoreFinanceError } from '@/services/contracts/core-finance-service';

const accountResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: accountInputSchema.innerType().shape.type,
  currency: z.string().regex(/^[A-Z]{3}$/),
  version: z.number().int().positive().safe(),
  status: z.enum(['active', 'archived', 'closed']),
  isDefault: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  institutionName: z.string().nullable().optional(),
  lastFour: z.string().nullable().optional(),
  creditLimitMinor: z.number().int().safe().nonnegative().nullable().optional(),
  statementDay: z.number().int().min(1).max(28).nullable().default(null),
  paymentDueDay: z.number().int().min(1).max(28).nullable().default(null),
  monthlyInterestRateBasisPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .nullable()
    .default(null),
  minimumPaymentMinor: z
    .number()
    .int()
    .safe()
    .positive()
    .nullable()
    .default(null),
  automaticTrackingEnabled: z.boolean().default(true),
  iconKey: z.string().nullable().optional(),
  colorKey: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export type VersionedAccount = Omit<Account, 'openingBalanceMinor'> & {
  version: number;
};

function accountFromApi(value: unknown): VersionedAccount {
  const parsed = accountResponseSchema.safeParse(value);
  if (!parsed.success) throw new CoreFinanceError('unknown');
  const row = parsed.data;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currencyCode: row.currency,
    version: row.version,
    institution: row.institutionName ?? null,
    lastFour: row.lastFour ?? null,
    creditLimitMinor: row.creditLimitMinor ?? null,
    statementDay: row.statementDay,
    paymentDueDay: row.paymentDueDay,
    monthlyInterestRateBasisPoints: row.monthlyInterestRateBasisPoints,
    minimumPaymentMinor: row.minimumPaymentMinor,
    automaticTrackingEnabled: row.automaticTrackingEnabled,
    isDefault: row.isDefault,
    iconKey: row.iconKey ?? null,
    colorKey: row.colorKey ?? null,
    notes: row.notes ?? null,
    status: row.status === 'active' ? 'active' : 'archived',
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
  token: () => Promise<string>;
  request?: typeof fetch;
}) {
  async function send(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    operationId?: string
  ): Promise<unknown> {
    if (!baseUrl) throw new CoreFinanceError('offline');
    if (method !== 'GET' && !operationId?.trim())
      throw new CoreFinanceError('validation');
    const response = await request(
      `${baseUrl.replace(/\/$/u, '')}/api/v1/accounts${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(operationId ? { 'Idempotency-Key': operationId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      }
    );
    if (!response.ok)
      throw new CoreFinanceError(
        response.status === 409
          ? 'conflict'
          : response.status === 404
            ? 'not_found'
            : response.status >= 500
              ? 'offline'
              : 'validation'
      );
    return response.json();
  }
  return {
    async getAccount(id: string): Promise<VersionedAccount> {
      return accountFromApi(await send('GET', `/${encodeURIComponent(id)}`));
    },
    async createAccount(
      input: AccountInput,
      operationId: string
    ): Promise<VersionedAccount> {
      const { currencyCode, institution, ...fields } =
        accountInputSchema.parse(input);
      const result = z.object({ account: z.unknown() }).parse(
        await send(
          'POST',
          '',
          {
            ...fields,
            currency: currencyCode,
            institutionName: institution
          },
          operationId
        )
      );
      return accountFromApi(result.account);
    },
    async updateAccount(
      id: string,
      input: AccountInput,
      expectedVersion: number,
      operationId: string
    ): Promise<VersionedAccount> {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new CoreFinanceError('validation');
      const parsed = accountInputSchema.parse(input);
      const body: Record<string, unknown> = { expectedVersion };
      for (const key of Object.keys(parsed) as (keyof typeof parsed)[]) {
        if (
          key === 'currencyCode' ||
          key === 'openingBalanceMinor' ||
          input[key] === undefined
        )
          continue;
        body[key === 'institution' ? 'institutionName' : key] = parsed[key];
      }
      return accountFromApi(
        await send('PATCH', `/${encodeURIComponent(id)}`, body, operationId)
      );
    }
  };
}
