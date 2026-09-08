import { randomUUID } from 'expo-crypto';
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import {
  draftInputSchema,
  matchesFilters,
  transactionInputSchema,
  transactionSources,
  type Transaction,
  type TransactionDraft,
  type TransactionFilterSet,
  type TransactionInput
} from '@/domain/core-finance';
import type {
  CoreFinanceService,
  DeleteResult,
  MutationResult,
  TransactionPage
} from '@/services/contracts/core-finance-service';
import { CoreFinanceError } from '@/services/contracts/core-finance-service';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import { CoreFinanceSyncAdapter } from '@/storage/core-finance-sync-adapter';
import { openDatabase } from '@/storage/database';
import { SyncRepository } from '@/storage/sync-repository';
import { SyncHttpService } from '@/services/contracts/sync-service';
import { captureLiveClerkIdentity } from './auth-service';
import { HttpError, requestJson } from './http-client';

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const nullableInstant = instant.nullable();
const safeMinor = z.number().int().safe();
const serverKind = z.enum([
  'income',
  'expense',
  'transfer',
  'opening',
  'refund',
  'reversal',
  'adjustment'
]);
const serverStatus = z.enum([
  'draft',
  'pending',
  'confirmed',
  'reversed',
  'deleted'
]);
const summarySchema = z
  .object({
    id: uuid,
    kind: serverKind,
    status: serverStatus,
    amountMinor: safeMinor.positive(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    accountIds: z
      .array(uuid)
      .min(1)
      .max(3)
      .refine((ids) => new Set(ids).size === ids.length),
    sourceAccountId: uuid,
    destinationAccountId: uuid.nullable(),
    feeMinor: safeMinor.nonnegative(),
    categoryId: uuid.nullable().optional().default(null),
    title: z.string().min(1).max(160),
    merchant: z.string().max(160).nullable().optional().default(null),
    paymentMethod: z.string().max(80).nullable().optional().default(null),
    note: z.string().max(500).nullable().optional().default(null),
    occurredAt: instant,
    source: z.enum(transactionSources),
    originalTransactionId: uuid.nullable().optional().default(null),
    version: z.number().int().safe().positive(),
    deletedAt: nullableInstant.optional().default(null),
    undoExpiresAt: nullableInstant.optional().default(null)
  })
  .strict();
const postingSchema = z
  .object({
    id: uuid,
    accountId: uuid,
    amountMinor: safeMinor,
    clearingState: z.enum(['pending', 'confirmed']),
    postingRole: z.enum([
      'source',
      'destination',
      'fee',
      'opening',
      'refund',
      'reversal',
      'adjustment'
    ]),
    occurredAt: instant
  })
  .strict();
const revisionSchema = z
  .object({
    revisionNo: z.number().int().positive(),
    reason: z.string().min(1).max(500),
    createdAt: instant
  })
  .strict();
const detailSchema = z
  .object({
    transaction: summarySchema,
    postings: z.array(postingSchema).max(1_000),
    revisions: z.array(revisionSchema).max(1_000),
    ledgerVersion: z.number().int().safe().nonnegative(),
    requestId: z.string().min(1).max(128)
  })
  .strict()
  .superRefine(({ transaction, postings }, context) => {
    const accounts = new Set(transaction.accountIds);
    if (
      postings.length === 0 ||
      postings.some((posting) => !accounts.has(posting.accountId)) ||
      transaction.accountIds.some(
        (accountId) =>
          !postings.some((posting) => posting.accountId === accountId)
      )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'posting account mismatch'
      });
    const source = postings.find((posting) => posting.postingRole === 'source');
    const destination = postings.find(
      (posting) => posting.postingRole === 'destination'
    );
    const fee = postings.find((posting) => posting.postingRole === 'fee');
    if (transaction.kind === 'transfer') {
      if (
        !source ||
        !destination ||
        source.accountId === destination.accountId ||
        source.amountMinor >= 0 ||
        destination.amountMinor <= 0 ||
        Math.abs(destination.amountMinor) !== transaction.amountMinor ||
        (fee
          ? fee.amountMinor !== -transaction.feeMinor
          : transaction.feeMinor !== 0)
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'invalid transfer postings'
        });
    } else if (
      transaction.kind === 'expense' &&
      (!source || source.amountMinor !== -transaction.amountMinor)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalid expense posting'
      });
    else if (
      transaction.kind === 'income' &&
      (!source || source.amountMinor !== transaction.amountMinor)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalid income posting'
      });
  });
const pageSchema = z
  .object({
    items: z.array(summarySchema).max(100),
    nextCursor: z.string().max(512).nullable(),
    ledgerVersion: z.number().int().safe().nonnegative(),
    requestId: z.string().min(1).max(128)
  })
  .strict();
const balanceSchema = z
  .object({
    accountId: uuid,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    confirmedMinor: safeMinor,
    pendingMinor: safeMinor,
    ledgerVersion: z.number().int().safe().nonnegative(),
    reconciledAt: nullableInstant.optional().default(null)
  })
  .strict();
const mutationSchema = z
  .object({
    transaction: detailSchema,
    balances: z.array(balanceSchema).min(1).max(3),
    ledgerVersion: z.number().int().safe().positive(),
    requestId: z.string().min(1).max(128)
  })
  .strict();
const linkedMutationSchema = mutationSchema
  .extend({ original: summarySchema })
  .strict();
const deleteSchema = z
  .object({
    transactionId: uuid,
    deletedAt: instant,
    undoExpiresAt: instant,
    version: z.number().int().safe().positive(),
    balances: z.array(balanceSchema).min(1).max(3),
    ledgerVersion: z.number().int().safe().positive(),
    requestId: z.string().min(1).max(128)
  })
  .strict();
const syncCursor = z
  .string()
  .min(45)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
const syncDomain = z.enum(['accounts', 'categories', 'transactions']);
const syncMeta = z.object({ requestId: z.string().min(1) }).strict();
const bootstrapSchema = z
  .object({
    data: z
      .object({
        domains: z.array(
          z
            .object({
              domain: syncDomain,
              cursor: syncCursor,
              items: z.array(z.record(z.unknown())),
              hasMore: z.boolean(),
              nextPage: syncCursor.nullable()
            })
            .strict()
        )
      })
      .strict(),
    meta: syncMeta
  })
  .strict();
const deltaSchema = z
  .object({
    data: z
      .object({
        domain: syncDomain,
        changes: z.array(
          z
            .object({
              cursor: syncCursor.optional(),
              resourceId: z.string().min(1),
              resourceType: z.string().min(1),
              operation: z.enum(['upsert', 'delete']),
              version: z.number().int().safe().nonnegative(),
              snapshot: z.record(z.unknown()).optional(),
              deletedAt: nullableInstant.optional().default(null)
            })
            .strict()
        ),
        nextCursor: syncCursor,
        hasMore: z.boolean()
      })
      .strict(),
    meta: syncMeta
  })
  .strict();
const receiptSchema = z
  .object({
    operationId: uuid,
    status: z.enum([
      'received',
      'processing',
      'applied',
      'conflict',
      'rejected'
    ]),
    resourceId: z.string().min(1).optional(),
    result: z.record(z.unknown()).optional(),
    conflictId: uuid.optional(),
    error: z
      .object({ code: z.string().min(1), message: z.string().min(1) })
      .passthrough()
      .optional()
  })
  .strict();
const mutationBatchSchema = z
  .object({
    data: z
      .object({ receipts: z.array(receiptSchema).min(1).max(100) })
      .strict(),
    meta: syncMeta
  })
  .strict();
const conflictSchema = z
  .object({
    id: uuid,
    transactionId: uuid,
    clientMutationId: uuid,
    serverVersion: z.number().int().safe().nonnegative(),
    clientVersion: z.number().int().safe().nonnegative(),
    conflictFields: z.array(z.string()),
    serverSnapshot: z.record(z.unknown()),
    clientSnapshot: z.record(z.unknown()),
    status: z.enum(['open', 'resolved', 'rejected']),
    resolution: z
      .enum(['server', 'client', 'merged', 'duplicate'])
      .nullable()
      .optional()
      .default(null),
    createdAt: instant,
    resolvedAt: nullableInstant.optional().default(null)
  })
  .strict();
const conflictListSchema = z
  .object({
    data: z
      .object({
        items: z.array(conflictSchema),
        nextCursor: z.string().nullable().optional().default(null)
      })
      .strict(),
    meta: syncMeta
  })
  .strict();
const conflictResponseSchema = z
  .object({ data: conflictSchema, meta: syncMeta })
  .strict();
const devicePageSchema = z
  .object({
    items: z.array(z.object({ id: uuid, current: z.boolean() }).passthrough()),
    nextCursor: z.string().nullable()
  })
  .passthrough();

type LedgerService = Pick<
  CoreFinanceService,
  | 'listTransactions'
  | 'getTransaction'
  | 'getRemainingRefundableMinor'
  | 'createTransaction'
  | 'createCardPayoff'
  | 'createTransactionsAtomically'
  | 'updateTransaction'
  | 'saveDraft'
  | 'loadDraft'
  | 'discardDraft'
  | 'deleteTransaction'
  | 'undoDelete'
  | 'getConflict'
  | 'resolveConflict'
>;

export function createLiveLedgerService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  request = fetch,
  drafts = new CoreFinanceRepository()
}: {
  baseUrl?: string;
  request?: typeof fetch;
  drafts?: CoreFinanceRepository;
} = {}): LedgerService {
  let localReady: Promise<void> | null = null;
  const ensureLocalReady = () => (localReady ??= drafts.hydrate());
  const pending = new Map<
    string,
    { operationId: string; expectedVersion?: number }
  >();
  const send = async <T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: Record<string, unknown>,
    operationId?: string
  ): Promise<T> => {
    if (method !== 'GET' && !operationId?.trim())
      throw new HttpError('validation_error', 400);
    const identity = await captureLiveClerkIdentity();
    await identity.assertCurrent();
    const value = await requestJson(path, schema, {
      baseUrl,
      request,
      method,
      body,
      token: identity.token,
      headers: operationId ? { 'Idempotency-Key': operationId } : undefined
    });
    await identity.assertCurrent();
    return value;
  };
  const mutate = async <T>(
    key: string,
    prepare: () => Promise<number | undefined>,
    command: (state: {
      operationId: string;
      expectedVersion?: number;
    }) => Promise<T>,
    operationId?: string
  ): Promise<T> => {
    let state = pending.get(key);
    if (!state) {
      state = { operationId: operationId?.trim() || randomUUID() };
      state.expectedVersion = await prepare();
      pending.set(key, state);
    }
    try {
      const value = await command(state);
      pending.delete(key);
      return value;
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        ![
          'provider_unavailable',
          'internal_error',
          'contract_mismatch'
        ].includes(error.code)
      )
        pending.delete(key);
      throw error;
    }
  };
  const current = (id: string) =>
    send(
      'GET',
      `/api/v1/transactions/${encodeURIComponent(id)}`,
      detailSchema
    ).then(transactionFromDetail);
  const mutationResult = (value: Transaction): MutationResult<Transaction> => ({
    value,
    affectedScopes: transactionScopes(value.id)
  });

  return {
    async listTransactions(
      filters,
      cursor = null,
      pageSize = 25
    ): Promise<TransactionPage> {
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
        throw new CoreFinanceError('validation');
      const query = ledgerQuery(filters, cursor, pageSize);
      const page = await send(
        'GET',
        `/api/v1/transactions?${query.toString()}`,
        pageSchema
      );
      const items = page.items
        .map((item) => transactionFromSummary(item))
        .filter((item) => matchesFilters(item, filters));
      return { items, nextCursor: page.nextCursor };
    },
    getTransaction: current,
    async getRemainingRefundableMinor(originalTransactionId, excludedRefundId) {
      const original = await current(originalTransactionId);
      if (original.type !== 'expense') throw new CoreFinanceError('validation');
      let refunded = 0;
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const query = new URLSearchParams({ kind: 'refund', limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const page = await send(
          'GET',
          `/api/v1/transactions?${query.toString()}`,
          pageSchema
        );
        for (const item of page.items)
          if (
            item.id !== excludedRefundId &&
            item.originalTransactionId === originalTransactionId &&
            item.status !== 'deleted'
          ) {
            refunded += item.amountMinor;
            if (!Number.isSafeInteger(refunded))
              throw new HttpError('contract_mismatch', 502);
          }
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor))
          throw new HttpError('contract_mismatch', 502);
        if (cursor) seen.add(cursor);
      } while (cursor);
      return Math.max(0, original.amountMinor - refunded);
    },
    async createTransaction(input, operationId, source) {
      const value = transactionInputSchema.parse(input);
      if (value.type === 'transfer') {
        const result = await mutate(
          `transaction:transfer:${JSON.stringify(value)}`,
          async () => undefined,
          ({ operationId: key }) => createTransfer(send, value, key),
          operationId
        );
        return mutationResult(result);
      }
      if (value.type === 'refund' || value.type === 'reversal') {
        const originalId = value.originalTransactionId!;
        const result = await mutate(
          `${value.type}:${originalId}:${JSON.stringify(value)}`,
          async () => (await current(originalId)).version,
          async ({ operationId: key, expectedVersion }) => {
            const path =
              value.type === 'refund'
                ? `/api/v1/transactions/${encodeURIComponent(originalId)}/refunds`
                : `/api/v1/transactions/${encodeURIComponent(originalId)}/reverse`;
            const body =
              value.type === 'refund'
                ? {
                    expectedVersion,
                    amountMinor: value.amountMinor,
                    occurredAt: new Date(value.occurredAt).toISOString(),
                    reason: value.notes || value.title
                  }
                : {
                    expectedVersion,
                    occurredAt: new Date(value.occurredAt).toISOString(),
                    reason: value.notes || value.title
                  };
            return send('POST', path, linkedMutationSchema, body, key);
          },
          operationId
        );
        return mutationResult(transactionFromDetail(result.transaction));
      }
      if (value.type !== 'income' && value.type !== 'expense')
        throw new CoreFinanceError('validation');
      const body = {
        kind: value.type,
        amountMinor: value.amountMinor,
        currency: value.currencyCode,
        accountId: value.accountId,
        categoryId: value.categoryId,
        title: value.title,
        merchant: value.merchant,
        note: value.notes,
        occurredAt: new Date(value.occurredAt).toISOString(),
        source: source ?? 'manual'
      };
      const result = await mutate(
        `transaction:create:${JSON.stringify(body)}`,
        async () => undefined,
        ({ operationId: key }) =>
          send('POST', '/api/v1/transactions', mutationSchema, body, key),
        operationId
      );
      return mutationResult(transactionFromDetail(result.transaction));
    },
    async createCardPayoff(input, operationId) {
      const transfer: TransactionInput = {
        type: 'transfer',
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        accountId: input.fundingAccountId,
        destinationAccountId: input.cardAccountId,
        transferPurpose: 'card_payoff',
        feeMinor: 0,
        categoryId: null,
        title: input.title,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null
      };
      const value = await createTransfer(
        send,
        transactionInputSchema.parse(transfer),
        operationId
      );
      return mutationResult({ ...value, transferPurpose: 'card_payoff' });
    },
    async createTransactionsAtomically(inputs, operationId, source) {
      await ensureLocalReady();
      const replay = drafts.batchOperationResult(operationId);
      if (replay)
        return {
          value: replay,
          affectedScopes: replay.flatMap((item) => transactionScopes(item.id))
        };
      const groupId = uuid.safeParse(operationId);
      if (!groupId.success || inputs.length < 1 || inputs.length > 100)
        throw new CoreFinanceError('validation');
      const values = inputs.map((input) => transactionInputSchema.parse(input));
      if (
        values.some(
          (input) => input.type !== 'income' && input.type !== 'expense'
        )
      )
        throw new CoreFinanceError('validation');
      const owner = await captureLiveClerkIdentity();
      const deviceId = await currentDeviceId(baseUrl, request, owner.token);
      const client = new SyncHttpService(
        baseUrl,
        async () => owner.token,
        async () => deviceId,
        request
      );
      const operationIds = values.map((_, index) =>
        index === 0 ? groupId.data : derivedOperationId(groupId.data, index)
      );
      const batch = mutationBatchSchema.parse(
        await client.mutations(
          values.map((input, index) => ({
            operationId: operationIds[index]!,
            domain: 'transactions' as const,
            resourceType: 'transaction' as const,
            schemaVersion: 1 as const,
            dependsOn: index === 0 ? [] : [operationIds[index - 1]!],
            operation: 'create' as const,
            payload: {
              kind: input.type as 'income' | 'expense',
              amountMinor: input.amountMinor,
              currency: input.currencyCode,
              accountId: input.accountId,
              categoryId: input.categoryId,
              title: input.title,
              merchant: input.merchant,
              note: input.notes,
              occurredAt: new Date(input.occurredAt).toISOString(),
              source
            }
          })),
          groupId.data
        )
      );
      if (
        batch.data.receipts.length !== operationIds.length ||
        batch.data.receipts.some(
          (receipt, index) =>
            receipt.operationId !== operationIds[index] ||
            receipt.status !== 'applied' ||
            !receipt.result
        )
      )
        throw new CoreFinanceError('conflict');
      const transactions = batch.data.receipts.map((receipt) =>
        transactionFromDetail(mutationSchema.parse(receipt.result).transaction)
      );
      await owner.assertCurrent();
      await drafts.persistBatchOperationResult(operationId, transactions);
      return {
        value: transactions,
        affectedScopes: transactions.flatMap((item) =>
          transactionScopes(item.id)
        )
      };
    },
    async updateTransaction(id, input) {
      const next = transactionInputSchema.parse(input);
      const result = await mutate(
        `transaction:update:${id}:${JSON.stringify(next)}`,
        async () => (await current(id)).version,
        async ({ operationId, expectedVersion }) => {
          const prior = await current(id);
          if (
            prior.type !== next.type ||
            prior.currencyCode !== next.currencyCode ||
            prior.destinationAccountId !== next.destinationAccountId ||
            prior.feeMinor !== next.feeMinor ||
            prior.originalTransactionId !== next.originalTransactionId
          )
            throw new CoreFinanceError('validation');
          const body: Record<string, unknown> = {
            expectedVersion,
            reason: next.notes || 'Mobile edit'
          };
          for (const [field, value] of [
            ['amountMinor', next.amountMinor],
            ['accountId', next.accountId],
            ['categoryId', next.categoryId],
            ['title', next.title],
            ['merchant', next.merchant],
            ['note', next.notes],
            ['occurredAt', new Date(next.occurredAt).toISOString()]
          ] as const)
            if (value !== prior[field === 'note' ? 'notes' : field])
              body[field] = value;
          return send(
            'PATCH',
            `/api/v1/transactions/${encodeURIComponent(id)}`,
            mutationSchema,
            body,
            operationId
          );
        }
      );
      return mutationResult(transactionFromDetail(result.transaction));
    },
    async saveDraft(draft: TransactionDraft) {
      await ensureLocalReady();
      const value = drafts.saveDraft(draftInputSchema.parse(draft));
      await drafts.persistDraft(value);
      return value;
    },
    async loadDraft(id: string) {
      await ensureLocalReady();
      return drafts.loadDraft(id);
    },
    async discardDraft(id: string) {
      await ensureLocalReady();
      drafts.discardDraft(id);
      await drafts.removePersistedDraft(id);
    },
    async deleteTransaction(id): Promise<DeleteResult> {
      const prior = await current(id);
      const deleted = await mutate(
        `transaction:delete:${id}`,
        async () => prior.version,
        ({ operationId, expectedVersion }) =>
          send(
            'DELETE',
            `/api/v1/transactions/${encodeURIComponent(id)}`,
            deleteSchema,
            { expectedVersion, reason: 'Mobile delete' },
            operationId
          )
      );
      if (deleted.transactionId !== id)
        throw new HttpError('contract_mismatch', 502);
      const value: Transaction = {
        ...prior,
        status: 'deleted',
        version: deleted.version,
        deletedAt: Date.parse(deleted.deletedAt),
        undoExpiresAt: Date.parse(deleted.undoExpiresAt),
        updatedAt: Date.parse(deleted.deletedAt)
      };
      return { ...mutationResult(value), undoExpiresAt: value.undoExpiresAt! };
    },
    async undoDelete(id) {
      const result = await mutate(
        `transaction:restore:${id}`,
        async () => (await current(id)).version,
        ({ operationId, expectedVersion }) =>
          send(
            'POST',
            `/api/v1/transactions/${encodeURIComponent(id)}/restore`,
            mutationSchema,
            { expectedVersion },
            operationId
          )
      );
      return mutationResult(transactionFromDetail(result.transaction));
    },
    async getConflict(id) {
      try {
        const { conflict } = await remoteConflict(
          id,
          baseUrl,
          request,
          current
        );
        await ensureLocalReady();
        drafts.saveConflict(conflict);
        await drafts.persistConflictRecord(conflict);
        return conflict;
      } catch (error) {
        if (
          error instanceof HttpError &&
          ['provider_unavailable', 'rate_limited'].includes(error.code)
        ) {
          await ensureLocalReady();
          return drafts.requireConflict(id);
        }
        throw error;
      }
    },
    async resolveConflict(id, resolution) {
      if (resolution === 'keep_both') throw new CoreFinanceError('validation');
      const remote = await remoteConflict(id, baseUrl, request, current);
      const serverResolution =
        resolution === 'keep_local' ? 'client' : 'server';
      const payload =
        serverResolution === 'client'
          ? conflictResolutionPayload(remote.conflict, remote.conflictFields)
          : undefined;
      const resolved = conflictResponseSchema.parse(
        await remote.client.resolveConflict(
          id,
          serverResolution,
          randomUUID(),
          payload
        )
      );
      const conflict = conflictFromServer(
        resolved.data,
        remote.conflict.laterSnapshot
      );
      const selected = {
        ...(serverResolution === 'client'
          ? conflict.localSnapshot
          : conflict.laterSnapshot),
        syncStatus: 'synced' as const
      };
      await remote.owner.assertCurrent();
      await ensureLocalReady();
      drafts.saveConflict(conflict);
      await Promise.all([
        drafts.persistConflictRecord(conflict),
        drafts.persistTransaction(selected)
      ]);
      return mutationResult(selected);
    }
  };
}

export function createLiveCoreFinanceSync({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  request = fetch,
  database,
  repository,
  adapter,
  sync,
  identity = captureLiveClerkIdentity
}: {
  baseUrl?: string;
  request?: typeof fetch;
  database?: Awaited<ReturnType<typeof openDatabase>>;
  repository?: SyncRepository;
  adapter?: CoreFinanceSyncAdapter;
  sync?: SyncHttpService;
  identity?: typeof captureLiveClerkIdentity;
} = {}) {
  return {
    async synchronize() {
      const owner = await identity();
      await owner.assertCurrent();
      let ownerDatabase = database;
      if (!ownerDatabase && (!repository || !adapter))
        ownerDatabase = await openDatabase(owner.userId);
      const queue = repository ?? new SyncRepository(ownerDatabase!);
      const apply =
        adapter ?? new CoreFinanceSyncAdapter(ownerDatabase!, queue);
      const client =
        sync ??
        new SyncHttpService(
          baseUrl,
          async () => owner.token,
          async () => currentDeviceId(baseUrl, request, owner.token),
          request
        );
      let uploaded = 0;
      let bootstrapped = 0;
      let deltas = 0;
      await queue.recoverSending();
      for (;;) {
        const ready = await queue.ready(Date.now(), 100);
        if (!ready.length) break;
        const mutations = ready.map((entry) => ({
          operationId: uuid.parse(entry.operationId),
          domain: entry.domain,
          resourceType: entry.resourceType,
          schemaVersion: 1 as const,
          dependsOn: z.array(uuid).max(100).parse(entry.dependsOn),
          operation: z
            .enum(['create', 'update', 'archive', 'restore', 'delete'])
            .parse(entry.operation),
          ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
          ...(entry.baseVersion === null
            ? {}
            : { baseVersion: entry.baseVersion }),
          payload: entry.payload
        }));
        const operationIds = mutations.map((entry) => entry.operationId);
        await queue.markSending(operationIds);
        let batch: z.output<typeof mutationBatchSchema>;
        try {
          batch = mutationBatchSchema.parse(
            await client.mutations(mutations, randomUUID())
          );
        } catch (error) {
          await queue.recoverSending();
          throw error;
        }
        const receipts = new Map(
          batch.data.receipts.map((receipt) => [receipt.operationId, receipt])
        );
        if (
          receipts.size !== operationIds.length ||
          operationIds.some((operationId) => !receipts.has(operationId))
        ) {
          await queue.recoverSending();
          throw new HttpError('contract_mismatch', 502);
        }
        for (const entry of ready) {
          const receipt = receipts.get(entry.operationId)!;
          if (receipt.status === 'applied') {
            await queue.complete(entry.operationId, 'applied', null);
            if (entry.resourceId && receipt.resourceId)
              await queue.mapId(
                entry.domain,
                entry.resourceId,
                receipt.resourceId
              );
          } else if (receipt.status === 'conflict')
            await queue.complete(
              entry.operationId,
              'conflict',
              receipt.error?.code ?? 'SYNC_CONFLICT'
            );
          else if (receipt.status === 'rejected')
            await queue.complete(
              entry.operationId,
              'rejected',
              receipt.error?.code ?? 'SYNC_REJECTED'
            );
          else
            await queue.retry(
              entry.operationId,
              Date.now() + 1_000,
              `SYNC_${receipt.status.toUpperCase()}`
            );
          uploaded += 1;
        }
      }
      for (const domain of syncDomain.options) {
        const cursor = await queue.cursor(domain);
        if (!cursor) {
          let after: string | undefined;
          for (;;) {
            const value = bootstrapSchema.parse(
              await client.bootstrap([domain], after, 500)
            );
            const page = value.data.domains.find(
              (item) => item.domain === domain
            );
            if (!page || value.data.domains.length !== 1)
              throw new HttpError('contract_mismatch', 502);
            await apply.applyBootstrap(
              domain,
              page.items,
              page.cursor,
              page.hasMore
            );
            bootstrapped += 1;
            if (!page.hasMore) break;
            if (!page.nextPage || page.nextPage === after)
              throw new HttpError('contract_mismatch', 502);
            after = page.nextPage;
          }
          continue;
        }
        let next = syncCursor.parse(cursor);
        for (;;) {
          const value = deltaSchema.parse(
            await client.delta(domain, next, 500)
          );
          if (value.data.domain !== domain)
            throw new HttpError('contract_mismatch', 502);
          await apply.applyDelta(
            domain,
            value.data.changes.map((change) => ({
              resourceId: change.resourceId,
              operation: change.operation,
              version: change.version,
              ...(change.snapshot ? { snapshot: change.snapshot } : {}),
              deletedAt: change.deletedAt
            })),
            value.data.nextCursor,
            null
          );
          await client.acknowledge(domain, value.data.nextCursor);
          deltas += 1;
          if (!value.data.hasMore) break;
          if (value.data.nextCursor === next)
            throw new HttpError('contract_mismatch', 502);
          next = value.data.nextCursor;
        }
      }
      let after: string | undefined;
      for (;;) {
        const conflicts = conflictListSchema.parse(
          await client.conflicts('open', after, 100)
        );
        for (const conflict of conflicts.data.items)
          await apply.storeConflict(conflict);
        if (!conflicts.data.nextCursor) break;
        if (conflicts.data.nextCursor === after)
          throw new HttpError('contract_mismatch', 502);
        after = conflicts.data.nextCursor;
      }
      await owner.assertCurrent();
      return { uploaded, bootstrapped, deltas };
    }
  };
}

async function currentDeviceId(
  baseUrl: string,
  request: typeof fetch,
  token: string
): Promise<string> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: z.output<typeof devicePageSchema> = await requestJson(
      `/api/v1/me/devices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      devicePageSchema,
      { baseUrl, request, token, method: 'GET' }
    );
    const current = page.items.find((device) => device.current);
    if (current) return current.id;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor))
      throw new HttpError('contract_mismatch', 502);
    if (cursor) seen.add(cursor);
  } while (cursor);
  throw new HttpError('contract_mismatch', 502);
}

async function createTransfer(
  send: <T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: Record<string, unknown>,
    operationId?: string
  ) => Promise<T>,
  value: z.output<typeof transactionInputSchema>,
  operationId: string
): Promise<Transaction> {
  const result = await send(
    'POST',
    '/api/v1/transfers',
    mutationSchema,
    {
      sourceAccountId: value.accountId,
      destinationAccountId: value.destinationAccountId,
      amountMinor: value.amountMinor,
      currency: value.currencyCode,
      feeMinor: value.feeMinor,
      occurredAt: new Date(value.occurredAt).toISOString(),
      title: value.title,
      note: value.notes
    },
    operationId
  );
  return transactionFromDetail(result.transaction);
}

function transactionFromDetail(value: unknown): Transaction {
  const detail = detailSchema.parse(value);
  const source = detail.postings.find((posting) =>
    ['source', 'opening', 'refund', 'reversal', 'adjustment'].includes(
      posting.postingRole
    )
  );
  const destination = detail.postings.find(
    (posting) => posting.postingRole === 'destination'
  );
  return transactionFromSummary(
    detail.transaction,
    source?.accountId,
    destination?.accountId,
    source?.amountMinor
  );
}

function transactionFromSummary(
  input: unknown,
  mappedAccountId?: string,
  mappedDestinationAccountId?: string,
  signedAmount?: number
): Transaction {
  const value = summarySchema.parse(input);
  const accountId = mappedAccountId ?? value.sourceAccountId;
  const destinationAccountId =
    mappedDestinationAccountId ?? value.destinationAccountId ?? undefined;
  if (!accountId || (value.kind === 'transfer' && !destinationAccountId))
    throw new HttpError('contract_mismatch', 502);
  return {
    id: value.id,
    type: value.kind === 'opening' ? 'adjustment' : value.kind,
    amountMinor: value.amountMinor,
    currencyCode: value.currency,
    accountId,
    destinationAccountId: destinationAccountId ?? null,
    transferPurpose: value.kind === 'transfer' ? 'internal' : null,
    feeMinor: value.feeMinor,
    categoryId: value.kind === 'transfer' ? null : value.categoryId,
    title: value.title,
    merchant: value.merchant,
    paymentMethod: value.paymentMethod,
    occurredAt: Date.parse(value.occurredAt),
    source: value.kind === 'opening' ? 'adjustment' : value.source,
    status:
      value.status === 'confirmed'
        ? 'posted'
        : value.status === 'draft'
          ? 'pending'
          : value.status,
    reviewStatus: 'none',
    syncStatus: 'synced',
    originalTransactionId: value.originalTransactionId,
    obligationId: null,
    notes: value.note,
    version: value.version,
    adjustmentSign: signedAmount !== undefined && signedAmount < 0 ? -1 : 1,
    deletedAt: value.deletedAt === null ? null : Date.parse(value.deletedAt),
    undoExpiresAt:
      value.undoExpiresAt === null ? null : Date.parse(value.undoExpiresAt),
    createdAt: Date.parse(value.occurredAt),
    updatedAt: Date.parse(value.occurredAt)
  };
}

function ledgerQuery(
  filters: TransactionFilterSet,
  cursor: string | null,
  pageSize: number
): URLSearchParams {
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (cursor) query.set('cursor', cursor);
  if (filters.accountIds.length === 1)
    query.set('accountId', filters.accountIds[0]!);
  if (filters.categoryIds.length === 1)
    query.set('categoryId', filters.categoryIds[0]!);
  const kind = filters.types[0];
  if (
    filters.types.length === 1 &&
    kind !== undefined &&
    serverKind.options.includes(kind as z.infer<typeof serverKind>)
  )
    query.set('kind', kind);
  if (filters.sources.length === 1) query.set('source', filters.sources[0]!);
  if (filters.statuses.length === 1) {
    const status = filters.statuses[0]!;
    const mapped = status === 'posted' ? 'confirmed' : status;
    if (serverStatus.options.includes(mapped as z.infer<typeof serverStatus>))
      query.set('status', mapped);
  }
  if (filters.periodStart !== null)
    query.set('from', new Date(filters.periodStart).toISOString());
  if (filters.periodEnd !== null)
    query.set('to', new Date(filters.periodEnd).toISOString());
  if (filters.search.trim()) query.set('query', filters.search.trim());
  return query;
}

function transactionScopes(id: string): readonly string[] {
  return [
    'home.summary',
    'accounts.list',
    'transactions.list',
    `transactions.detail.${id}`,
    'reports.live',
    'assistant.context'
  ];
}

async function remoteConflict(
  id: string,
  baseUrl: string,
  request: typeof fetch,
  current: (id: string) => Promise<Transaction>
) {
  const owner = await captureLiveClerkIdentity();
  const deviceId = await currentDeviceId(baseUrl, request, owner.token);
  const client = new SyncHttpService(
    baseUrl,
    async () => owner.token,
    async () => deviceId,
    request
  );
  const value = conflictResponseSchema.parse(await client.conflict(id));
  const latest = await current(value.data.transactionId);
  await owner.assertCurrent();
  return {
    owner,
    client,
    conflictFields: value.data.conflictFields,
    conflict: conflictFromServer(value.data, latest)
  };
}

function conflictFromServer(
  value: z.output<typeof conflictSchema>,
  current: Transaction
) {
  const laterSnapshot = applyConflictSnapshot(
    current,
    value.serverSnapshot,
    value.serverVersion,
    'synced'
  );
  const localSnapshot = applyConflictSnapshot(
    laterSnapshot,
    value.clientSnapshot,
    value.clientVersion,
    'conflict'
  );
  return {
    id: value.id,
    transactionId: value.transactionId,
    localSnapshot,
    laterSnapshot,
    resolution:
      value.resolution === 'client' || value.resolution === 'merged'
        ? ('keep_local' as const)
        : value.resolution === 'server' || value.resolution === 'duplicate'
          ? ('keep_later' as const)
          : null,
    status:
      value.status === 'open' ? ('pending' as const) : ('resolved' as const),
    createdAt: Date.parse(value.createdAt),
    resolvedAt: value.resolvedAt ? Date.parse(value.resolvedAt) : null
  };
}

function applyConflictSnapshot(
  base: Transaction,
  snapshot: Record<string, unknown>,
  version: number,
  syncStatus: Transaction['syncStatus']
): Transaction {
  const next = { ...base, version, syncStatus };
  const amount = snapshot.amountMinor ?? snapshot.amount_minor;
  if (amount !== undefined) {
    if (
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount < 1
    )
      throw new HttpError('contract_mismatch', 502);
    next.amountMinor = amount;
  }
  for (const field of ['accountId', 'categoryId', 'title', 'merchant'] as const)
    if (field in snapshot) {
      const value = snapshot[field];
      if (
        (field === 'accountId' && !uuid.safeParse(value).success) ||
        (field === 'categoryId' &&
          value !== null &&
          !uuid.safeParse(value).success) ||
        ((field === 'title' || field === 'merchant') &&
          value !== null &&
          typeof value !== 'string')
      )
        throw new HttpError('contract_mismatch', 502);
      Object.assign(next, { [field]: value });
    }
  const note = snapshot.note ?? snapshot.notes;
  if (note !== undefined) {
    if (note !== null && typeof note !== 'string')
      throw new HttpError('contract_mismatch', 502);
    next.notes = note;
  }
  const occurredAt = snapshot.occurredAt ?? snapshot.occurred_at;
  if (occurredAt !== undefined) {
    const parsed =
      typeof occurredAt === 'number'
        ? occurredAt
        : Date.parse(String(occurredAt));
    if (!Number.isSafeInteger(parsed) || parsed < 0)
      throw new HttpError('contract_mismatch', 502);
    next.occurredAt = parsed;
  }
  return next;
}

function conflictResolutionPayload(
  conflict: ReturnType<typeof conflictFromServer>,
  fields: readonly string[]
) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field === 'note' ? 'notes' : field;
    if (!(key in conflict.localSnapshot)) continue;
    const value = conflict.localSnapshot[key as keyof Transaction];
    payload[field] =
      key === 'occurredAt'
        ? new Date(conflict.localSnapshot.occurredAt).toISOString()
        : value;
  }
  return payload;
}

function derivedOperationId(operationId: string, index: number): string {
  const bytes = sha256(
    new TextEncoder().encode(`${operationId}:${String(index)}`)
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytesToHex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

let liveCoreFinanceSync: Promise<unknown> | null = null;

export function synchronizeLiveCoreFinance(): Promise<unknown> {
  return (liveCoreFinanceSync ??= createLiveCoreFinanceSync()
    .synchronize()
    .finally(() => {
      liveCoreFinanceSync = null;
    }));
}
