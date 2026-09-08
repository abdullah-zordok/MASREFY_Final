import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import {
  categoryInputSchema,
  type Category,
  type CategoryInput
} from '@/domain/core-finance';
import { createDefaultCategories } from '@/domain/core-finance-seeds';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  openDatabase,
  runExclusiveDatabaseTransaction
} from '@/storage/database';
import type {
  CategoryLifecycleService,
  CategoryUsagePreview
} from '@/services/contracts/core-finance-service';
import {
  configureMobileApiTokenProvider,
  HttpError,
  requestJson
} from './http-client';
import { captureLiveClerkIdentity } from './auth-service';

const categorySchema = z
  .object({
    id: z.string().uuid(),
    scope: z.enum(['system', 'custom']),
    kind: z.enum(['income', 'expense', 'transfer']),
    labelAr: z.string(),
    labelEn: z.string(),
    icon: z.string().nullable().optional().default(null),
    color: z.string().nullable().optional().default(null),
    systemKey: z.string().nullable().optional().default(null),
    parentId: z.string().uuid().nullable().optional().default(null),
    mergedIntoId: z.string().uuid().nullable().optional().default(null),
    sortOrder: z.number().int().safe(),
    active: z.boolean(),
    status: z.enum(['active', 'archived', 'merged']),
    version: z.number().int().positive().safe(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true })
  })
  .strict();
const categoryPageSchema = z
  .object({
    items: z.array(categorySchema).max(100),
    nextCursor: z.string().nullable()
  })
  .strict();
const categoryUsageSchema = z
  .object({
    linkedTransactionCount: z.number().int().safe().nonnegative(),
    version: z.number().int().safe().positive()
  })
  .strict();
const mergeCategorySchema = z
  .object({ source: categorySchema, targetId: z.string().uuid() })
  .strict();
const emptySchema = z.null();

export type VersionedCategory = Category & {
  systemKey: string | null;
  sortOrder: number;
  version: number;
};

function categoryFromApi(
  value: unknown,
  serverToLocal: ReadonlyMap<string, string>,
  favorites: ReadonlyMap<string, boolean>
): VersionedCategory {
  const row = categorySchema.parse(value);
  const id = serverToLocal.get(row.id) ?? row.id;
  return {
    id,
    kind: row.scope,
    systemKey: row.systemKey,
    financialType: row.kind === 'transfer' ? null : row.kind,
    parentId:
      row.parentId === null
        ? null
        : (serverToLocal.get(row.parentId) ?? row.parentId),
    labelAr: row.labelAr,
    labelEn: row.labelEn,
    iconKey: row.icon,
    colorKey: row.color,
    isFavorite: favorites.get(id) ?? false,
    status: row.status,
    mergedIntoId:
      row.mergedIntoId === null
        ? null
        : (serverToLocal.get(row.mergedIntoId) ?? row.mergedIntoId),
    sortOrder: row.sortOrder,
    version: row.version,
    createdAt: Date.parse(row.createdAt),
    updatedAt: Date.parse(row.updatedAt)
  };
}

type TokenProvider = () => Promise<string | null>;
type CategoryOwner = {
  database: Awaited<ReturnType<typeof openDatabase>>;
  identity: Awaited<ReturnType<typeof captureLiveClerkIdentity>>;
};

export function createLiveCategoryLifecycleService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch
}: {
  baseUrl?: string;
  token?: TokenProvider;
  request?: typeof fetch;
} = {}) {
  if (token) configureMobileApiTokenProvider(token);
  const serverToLocal = new Map<string, string>();
  const localToServer = new Map<string, string>();
  const localCategories = new CoreFinanceRepository();
  const captureOwner = async (): Promise<CategoryOwner> => {
    const identity = await captureLiveClerkIdentity();
    const database = await openDatabase(identity.userId);
    await identity.assertCurrent();
    return { database, identity };
  };
  const defaultFavorites = new Map(
    createDefaultCategories().map((category) => [
      category.id,
      category.isFavorite
    ])
  );
  const rememberSystemCategories = (values: readonly unknown[]) => {
    for (const value of values) {
      const row = categorySchema.parse(value);
      if (row.scope === 'system' && row.systemKey) {
        serverToLocal.set(row.id, row.systemKey);
        localToServer.set(row.systemKey, row.id);
      }
    }
  };
  const serverId = (id: string) => localToServer.get(id) ?? id;
  const mapCategory = (value: unknown, favorites = defaultFavorites) =>
    categoryFromApi(value, serverToLocal, favorites);
  const persistFavorite = async (
    category: VersionedCategory,
    isFavorite: boolean,
    owner: CategoryOwner
  ) => {
    const value = { ...category, isFavorite };
    try {
      await owner.identity.assertCurrent();
      await localCategories.persistCategory(value, owner.database);
    } catch {
      // Keep the original operation ID available if the server succeeded but local storage failed.
      throw new HttpError('provider_unavailable', 503);
    }
    return value;
  };
  const send = async <T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    options: {
      body?: Record<string, unknown>;
      emptyValue?: T;
      operationId?: string;
      owner?: CategoryOwner;
    } = {}
  ) => {
    const operationId = options.operationId ?? randomUUID();
    const identity =
      options.owner?.identity ?? (await captureLiveClerkIdentity());
    await identity.assertCurrent();
    const result = await requestJson(path, schema, {
      baseUrl,
      request,
      method,
      headers:
        method === 'GET' ? undefined : { 'Idempotency-Key': operationId },
      body: options.body,
      token: identity.token,
      ...(options.emptyValue === undefined
        ? {}
        : { emptyValue: options.emptyValue })
    });
    await identity.assertCurrent();
    return result;
  };
  const scopes = (id: string) => [
    'categories.list',
    `categories.detail.${id}`,
    'transactions.list',
    'home.summary'
  ];

  const service = {
    async listCategories(
      includeArchived = false,
      capturedOwner?: CategoryOwner
    ): Promise<VersionedCategory[]> {
      const owner = capturedOwner ?? (await captureOwner());
      const { database } = owner;
      const categories: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ limit: '100' });
        if (includeArchived) query.set('includeInactive', 'true');
        if (cursor) query.set('cursor', cursor);
        await owner.identity.assertCurrent();
        const page = await send(
          'GET',
          `/api/v1/categories?${query.toString()}`,
          categoryPageSchema,
          { owner }
        );
        categories.push(...page.items);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor))
          throw new HttpError('contract_mismatch', 502);
        if (cursor) cursors.add(cursor);
      } while (cursor);
      await owner.identity.assertCurrent();
      await runExclusiveDatabaseTransaction(database, async () => {
        rememberSystemCategories(categories);
      });
      const favorites = new Map(defaultFavorites);
      for (const category of await localCategories.readPersistedCategories(
        database
      ))
        if (typeof category.isFavorite === 'boolean')
          favorites.set(category.id, category.isFavorite);
      const mapped = categories.map((category) =>
        mapCategory(category, favorites)
      );
      if (includeArchived)
        await localCategories.persistCategories(mapped, database);
      return mapped;
    },
    async createCategory(
      input: CategoryInput,
      operationId = randomUUID()
    ): Promise<VersionedCategory> {
      const value = categoryInputSchema.parse(input);
      const owner = await captureOwner();
      if (value.parentId !== null) await service.listCategories(true, owner);
      await owner.identity.assertCurrent();
      const category = mapCategory(
        await send('POST', '/api/v1/categories', categorySchema, {
          body: {
            kind: value.financialType,
            labelAr: value.labelAr,
            labelEn: value.labelEn,
            icon: value.iconKey,
            color: value.colorKey,
            parentId: value.parentId === null ? null : serverId(value.parentId),
            ...(value.sortOrder === undefined
              ? {}
              : { sortOrder: value.sortOrder })
          },
          operationId,
          owner
        })
      );
      return persistFavorite(category, value.isFavorite, owner);
    },
    async updateCategory(
      id: string,
      input: CategoryInput,
      expectedVersion: number,
      operationId = randomUUID()
    ): Promise<VersionedCategory> {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new HttpError('validation_error', 400);
      const value = categoryInputSchema.parse(input);
      const owner = await captureOwner();
      if (value.parentId !== null) await service.listCategories(true, owner);
      await owner.identity.assertCurrent();
      const category = mapCategory(
        await send(
          'PATCH',
          `/api/v1/categories/${encodeURIComponent(serverId(id))}`,
          categorySchema,
          {
            body: {
              expectedVersion,
              kind: value.financialType,
              labelAr: value.labelAr,
              labelEn: value.labelEn,
              icon: value.iconKey,
              color: value.colorKey,
              parentId:
                value.parentId === null ? null : serverId(value.parentId),
              ...(value.sortOrder === undefined
                ? {}
                : { sortOrder: value.sortOrder })
            },
            operationId,
            owner
          }
        )
      );
      return persistFavorite(category, value.isFavorite, owner);
    },
    async getCategoryUsage(id: string): Promise<CategoryUsagePreview> {
      return send(
        'GET',
        `/api/v1/categories/${encodeURIComponent(serverId(id))}/usage`,
        categoryUsageSchema
      );
    },
    async setCategoryStatus(
      id: string,
      status: 'active' | 'archived',
      preview: CategoryUsagePreview,
      operationId = randomUUID()
    ) {
      const encoded = encodeURIComponent(serverId(id));
      if (status === 'archived')
        await send(
          'DELETE',
          `/api/v1/categories/${encoded}?expectedVersion=${String(preview.version)}&expectedLinkedTransactionCount=${String(preview.linkedTransactionCount)}`,
          emptySchema,
          { emptyValue: null, operationId }
        );
      else
        await send(
          'POST',
          `/api/v1/categories/${encoded}/restore`,
          categorySchema,
          { body: { expectedVersion: preview.version }, operationId }
        );
      return { affectedScopes: scopes(id) };
    },
    async mergeCategory(
      sourceId: string,
      targetId: string,
      preview: CategoryUsagePreview,
      operationId = randomUUID()
    ) {
      const merged = await send(
        'POST',
        `/api/v1/categories/${encodeURIComponent(serverId(sourceId))}/merge`,
        mergeCategorySchema,
        {
          body: {
            targetId: serverId(targetId),
            expectedVersion: preview.version,
            expectedLinkedTransactionCount: preview.linkedTransactionCount
          },
          operationId
        }
      );
      mapCategory(merged.source);
      return {
        affectedScopes: [...scopes(sourceId), `categories.detail.${targetId}`]
      };
    }
  } satisfies CategoryLifecycleService & {
    listCategories(includeArchived?: boolean): Promise<VersionedCategory[]>;
    createCategory(input: CategoryInput): Promise<VersionedCategory>;
    updateCategory(
      id: string,
      input: CategoryInput,
      expectedVersion: number
    ): Promise<VersionedCategory>;
  };
  return service;
}
