import { createHash } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from '../ledger/idempotency';
import { LedgerService } from '../ledger/ledger.service';
import {
  decodeTrackingCursor,
  encodeTrackingCursor,
  normalizeAdminTrackingAction,
  normalizeNormalizedImport,
  normalizeTrackingId,
  normalizeTrackingList,
  normalizeTrackingOwnerFilters,
  normalizeVersion,
  type NormalizedImport,
} from './tracking.dto';
import {
  executeParserDefinition,
  parseTrackingCsv,
  validateParserDefinition,
} from './tracking.parser';
import { TrackingRepository } from './tracking.repository';
import { TrackingStorage } from './tracking.storage';
import { recordTrackingIntake } from './tracking.observability';

type Input = {
  principal: ClerkPrincipal;
  body: unknown;
  idempotencyKey: string;
  requestId: string;
};

type RawPayload = {
  storageRef: string;
  payloadHash: string;
  contentType: 'text/csv' | 'application/json';
  sizeBytes: number;
  expiresAt: Date;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('VALIDATION_FAILED');
  return value as Record<string, unknown>;
}

function exact(input: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('VALIDATION_FAILED');
}

function boundedText(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error('VALIDATION_FAILED');
  const normalized = value.normalize('NFKC').trim();
  if (
    normalized.length < min ||
    Buffer.byteLength(normalized, 'utf8') > max ||
    unsafeText(normalized)
  )
    throw new Error('VALIDATION_FAILED');
  return normalized;
}

function unsafeText(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 31 ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return true;
  }
  return false;
}

function uuidFrom(seed: string): string {
  const value = createHash('sha256').update(seed).digest('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function trackingPage(items: unknown[], limit: number, resource = ''): Record<string, unknown> {
  const selected = items.slice(0, limit);
  if (items.length <= limit) return { items: selected, nextCursor: null };
  const last = record(selected.at(-1));
  const at =
    resource === 'sessions'
      ? last.startedAt
      : resource === 'items' || resource === 'history'
        ? (last.occurredAt ?? last.createdAt)
        : last.createdAt;
  return {
    items: selected,
    nextCursor: encodeTrackingCursor({ at: String(at), id: String(last.id) }),
  };
}

@Injectable()
export class TrackingService {
  constructor(
    readonly repository: TrackingRepository,
    private readonly ledger: LedgerService,
    private readonly storage: TrackingStorage,
  ) {}

  preferences(principal: ClerkPrincipal): Promise<Record<string, unknown>> {
    return this.repository.getPreferences(principal);
  }

  async status(principal: ClerkPrincipal): Promise<Record<string, unknown>> {
    const preferences = await this.repository.getPreferences(principal);
    return {
      available: true,
      mode: preferences.enabled
        ? preferences.reviewRequired
          ? 'review_all'
          : 'automatic_clear'
        : 'paused',
      preferences,
    };
  }

  updatePreferences(input: Input): Promise<Record<string, unknown>> {
    try {
      const body = record(input.body);
      exact(body, [
        'mode',
        'enabled',
        'reviewRequired',
        'rawRetentionDays',
        'sourceRetentionDays',
        'historyRetentionDays',
        'expectedVersion',
      ]);
      const mode = body.mode == null ? null : boundedText(body.mode, 1, 32);
      if (mode !== null && !['automatic_clear', 'review_all', 'paused'].includes(mode))
        throw new Error();
      if (
        mode === null &&
        (typeof body.enabled !== 'boolean' || typeof body.reviewRequired !== 'boolean')
      )
        throw new Error();
      const command = {
        enabled: mode === null ? body.enabled : mode !== 'paused',
        reviewRequired: mode === null ? body.reviewRequired : mode !== 'automatic_clear',
        sourceRetentionDays: body.sourceRetentionDays ?? body.rawRetentionDays ?? 30,
        historyRetentionDays: body.historyRetentionDays ?? 365,
        expectedVersion: normalizeVersion(body.expectedVersion),
      };
      if (
        !Number.isInteger(command.sourceRetentionDays) ||
        Number(command.sourceRetentionDays) < 1 ||
        Number(command.sourceRetentionDays) > 365 ||
        !Number.isInteger(command.historyRetentionDays) ||
        Number(command.historyRetentionDays) < 30 ||
        Number(command.historyRetentionDays) > 730
      )
        throw new Error();
      return this.repository.updatePreferences(
        input.principal,
        command,
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  list(
    principal: ClerkPrincipal,
    resource: string,
    query: unknown,
  ): Promise<Record<string, unknown>> {
    try {
      const filters = normalizeTrackingOwnerFilters(resource, query);
      const values = record(query ?? {});
      const page = normalizeTrackingList({ cursor: values.cursor, limit: values.limit });
      const cursor = page.cursor ? decodeTrackingCursor(page.cursor) : null;
      return this.repository
        .listOwner(principal, resource, null, page.limit + 1, cursor, filters)
        .then((items) => trackingPage(items, page.limit, resource));
    } catch {
      throw this.validation();
    }
  }

  detail(principal: ClerkPrincipal, resource: string, id: string): Promise<unknown> {
    try {
      id = normalizeTrackingId(id);
    } catch {
      throw this.validation();
    }
    return this.repository
      .listOwner(principal, resource, id, 1)
      .then((items) => items[0] ?? Promise.reject(new HttpException({ code: 'NOT_FOUND' }, 404)));
  }

  sessionItems(
    principal: ClerkPrincipal,
    sessionId: string,
    itemId: string | null,
    query: unknown,
  ): Promise<unknown> {
    try {
      sessionId = normalizeTrackingId(sessionId);
      if (itemId) itemId = normalizeTrackingId(itemId);
      const filters = normalizeTrackingOwnerFilters('items', query);
      const values = record(query ?? {});
      const page = normalizeTrackingList({ cursor: values.cursor, limit: values.limit });
      const cursor = page.cursor ? decodeTrackingCursor(page.cursor) : null;
      return this.repository
        .listSessionItems(
          principal,
          sessionId,
          itemId,
          itemId ? 1 : page.limit + 1,
          cursor,
          filters,
        )
        .then((items) =>
          itemId
            ? (items[0] ?? Promise.reject(new HttpException({ code: 'NOT_FOUND' }, 404)))
            : trackingPage(items, page.limit, 'items'),
        );
    } catch {
      throw this.validation();
    }
  }

  async createImport(
    input: Input,
    contentType: string,
    rawBody?: Buffer,
    sourceName?: string,
  ): Promise<Record<string, unknown>> {
    let normalized: NormalizedImport, bytes: Buffer;
    let idempotencyHash: string;
    try {
      idempotencyHash = hashIdempotencyKey(input.idempotencyKey);
      if (contentType === 'text/csv') {
        if (!rawBody) throw new Error();
        const rows = parseTrackingCsv(rawBody);
        const fileHash = createHash('sha256').update(rawBody).digest('hex');
        normalized = normalizeNormalizedImport({
          schemaVersion: 1,
          sourceType: 'manual',
          sourceChannel: 'manual',
          events: rows.map((row, index) => ({
            sourceItemKey: row.sourceItemKey || `${fileHash}:row:${String(index + 1)}`,
            receivedAt: row.receivedAt,
            body: row.body,
            ...(row.amountMinor ? { amountMinor: Number(row.amountMinor) } : {}),
            ...(row.currency ? { currency: row.currency } : {}),
            ...(row.merchant ? { merchant: row.merchant } : {}),
            ...(row.occurredAt ? { occurredAt: row.occurredAt } : {}),
            ...(row.accountId ? { accountId: row.accountId } : {}),
            ...(row.categoryId ? { categoryId: row.categoryId } : {}),
          })),
        });
        bytes = rawBody;
      } else if (contentType === 'application/json') {
        normalized = normalizeNormalizedImport(input.body);
        bytes = Buffer.from(JSON.stringify(normalized));
      } else {
        throw new Error('UNSUPPORTED_FORMAT');
      }
      if (sourceName && (sourceName.includes('/') || sourceName.includes('\\'))) throw new Error();
    } catch (error) {
      const code =
        error instanceof Error && ['UNSAFE_IMPORT', 'UNSUPPORTED_FORMAT'].includes(error.message)
          ? error.message
          : 'VALIDATION_FAILED';
      const unsupported = rawBody
        ? await this.repository.recordUnsupported(
            input.principal,
            createHash('sha256').update(rawBody).digest('hex'),
            sourceName &&
              Buffer.byteLength(sourceName, 'utf8') <= 120 &&
              !unsafeText(sourceName) &&
              !sourceName.includes('/') &&
              !sourceName.includes('\\')
              ? sourceName
              : null,
            code,
          )
        : undefined;
      recordTrackingIntake(rawBody ? 'file' : 'manual', 'rejected');
      throw new HttpException(
        { code, ...(unsupported ? { unsupported } : {}) },
        code === 'UNSUPPORTED_FORMAT' ? 415 : 400,
      );
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    const key = `tracking/${uuidFrom(input.principal.userId)}/${uuidFrom(`${hash}\0${idempotencyHash}`)}`;
    const preferences = await this.repository.getPreferences(input.principal);
    const days = Number(preferences.sourceRetentionDays ?? 30);
    const uploaded = await this.storage.upload(
      key,
      bytes,
      contentType === 'text/csv' ? 'text/csv' : 'application/json',
    );
    const raw: RawPayload = {
      storageRef: key,
      payloadHash: hash,
      contentType: contentType === 'text/csv' ? 'text/csv' : 'application/json',
      sizeBytes: bytes.length,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    };
    let created: Record<string, unknown>;
    try {
      created = await this.repository.createImport(input.principal, normalized, {
        sourceName: sourceName ?? null,
        key: input.idempotencyKey,
        requestId: input.requestId,
        raw,
      });
    } catch (error) {
      if (uploaded) {
        try {
          await this.deleteOrQueueRaw(input.principal, raw);
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'TRACKING_STORAGE_CLEANUP_FAILED');
        }
      }
      throw error;
    }
    if (created.replayed === true) {
      if (!(await this.repository.rawPayloadRegistered(input.principal, key)))
        await this.deleteOrQueueRaw(input.principal, raw);
    }
    recordTrackingIntake(contentType === 'text/csv' ? 'file' : normalized.sourceType, 'accepted');
    return created;
  }

  keyword(input: Input, id?: string): Promise<Record<string, unknown>> {
    try {
      const body = record(input.body);
      exact(body, [
        'value',
        'group',
        'language',
        'matchType',
        'categoryId',
        'priority',
        'enabled',
        'expectedVersion',
      ]);
      return this.repository.keyword(
        input.principal,
        {
          id: id ? normalizeTrackingId(id) : null,
          keyword: boundedText(body.value, 1, 120),
          groupKey: boundedText(body.group, 1, 40),
          languageCode: boundedText(body.language, 2, 2),
          matchType: body.matchType ?? 'contains',
          categoryId: body.categoryId == null ? null : normalizeTrackingId(body.categoryId),
          priority: body.priority ?? 100,
          enabled: body.enabled,
          expectedVersion:
            body.expectedVersion == null ? null : normalizeVersion(body.expectedVersion),
        },
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  sender(input: Input, id?: string): Promise<Record<string, unknown>> {
    try {
      const body = record(input.body);
      exact(body, [
        'value',
        'displayLabel',
        'institutionId',
        'trusted',
        'enabled',
        'expectedVersion',
      ]);
      return this.repository.sender(
        input.principal,
        {
          id: id ? normalizeTrackingId(id) : null,
          senderPattern: boundedText(body.value, 1, 256),
          displayLabel: boundedText(body.displayLabel, 1, 120),
          institutionId:
            body.institutionId == null ? null : normalizeTrackingId(body.institutionId),
          trusted: body.trusted === true,
          enabled: body.enabled !== false,
          expectedVersion:
            body.expectedVersion == null ? null : normalizeVersion(body.expectedVersion),
        },
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  removeRule(
    kind: 'keyword' | 'sender',
    id: string,
    query: Record<string, unknown>,
    input: Input,
  ): Promise<Record<string, unknown>> {
    try {
      return this.repository.removeRule(
        input.principal,
        kind,
        normalizeTrackingId(id),
        normalizeVersion(Number(query.expectedVersion)),
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  restoreKeywords(input: Input): Promise<Record<string, unknown>> {
    return this.repository.restoreKeywords(input.principal, input.idempotencyKey, input.requestId);
  }

  async decideReview(id: string, input: Input): Promise<Record<string, unknown>> {
    let command: Record<string, unknown>;
    try {
      const body = record(input.body);
      exact(body, ['decision', 'expectedVersion', 'edit']);
      const decision = boundedText(body.decision, 1, 20);
      if (!['accept', 'reject', 'edit_accept'].includes(decision)) throw new Error();
      const patch = body.edit == null ? {} : record(body.edit);
      exact(patch, [
        'amountMinor',
        'currency',
        'accountId',
        'categoryId',
        'title',
        'merchant',
        'paymentMethod',
        'note',
        'occurredAt',
      ]);
      if ((decision === 'edit_accept') !== Object.keys(patch).length > 0) throw new Error();
      command = {
        decision,
        expectedVersion: normalizeVersion(body.expectedVersion),
        patch,
      };
      hashIdempotencyKey(input.idempotencyKey);
      id = normalizeTrackingId(id);
    } catch {
      throw this.validation();
    }
    const decisionToken = uuidFrom(input.idempotencyKey);
    await this.repository.claimReview(
      input.principal,
      id,
      command.decision,
      command.expectedVersion,
      decisionToken,
    );
    if (command.decision === 'reject')
      return this.repository.decideReview(
        input.principal,
        id,
        command,
        decisionToken,
        null,
        null,
        input.idempotencyKey,
        input.requestId,
      );
    const review = record(await this.detail(input.principal, 'reviews', id));
    const importItem = record(
      await this.detail(input.principal, 'items', String(review.importItemId)),
    );
    const sourceKey = `tracking:${await this.repository.getImportSourceIdentityHash(
      input.principal,
      String(importItem.id),
    )}`;
    const values = { ...record(review.proposedValues), ...record(command.patch) };
    const ledger = record(
      await this.ledger.createTransaction({
        principal: input.principal,
        body: {
          kind: values.kind,
          amountMinor: Math.abs(Number(values.amountMinor)),
          currency: values.currency,
          accountId: values.accountId,
          categoryId: values.categoryId ?? null,
          title: values.title ?? values.merchant ?? 'Imported transaction',
          merchant: values.merchant ?? null,
          paymentMethod: values.paymentMethod ?? null,
          note: values.note ?? null,
          occurredAt: values.occurredAt,
          source: 'tracking-import',
          externalRef: sourceKey,
        },
        idempotencyKey: sourceKey,
        requestId: input.requestId,
      }),
    );
    const transaction = record(record(ledger.transaction).transaction);
    return this.repository.decideReview(
      input.principal,
      id,
      command,
      decisionToken,
      typeof ledger.operationId === 'string' ? ledger.operationId : uuidFrom(input.idempotencyKey),
      String(transaction.id),
      input.idempotencyKey,
      input.requestId,
    );
  }

  async decideDuplicate(id: string, input: Input): Promise<Record<string, unknown>> {
    let command: Record<string, unknown>;
    try {
      const body = record(input.body);
      exact(body, ['resolution', 'expectedVersion', 'merge']);
      const resolution = boundedText(body.resolution, 1, 24);
      if (!['keep_existing', 'keep_new', 'keep_both', 'merge_details'].includes(resolution))
        throw new Error();
      command = {
        resolution,
        expectedVersion: normalizeVersion(body.expectedVersion),
        merge: body.merge == null ? {} : record(body.merge),
      };
      exact(command.merge as Record<string, unknown>, [
        'title',
        'merchant',
        'categoryId',
        'occurredAt',
      ]);
      if (resolution === 'merge_details' && Object.keys(command.merge as object).length === 0)
        throw new Error();
      hashIdempotencyKey(input.idempotencyKey);
      id = normalizeTrackingId(id);
    } catch {
      throw this.validation();
    }
    const decisionToken = uuidFrom(input.idempotencyKey);
    await this.repository.claimDuplicate(
      input.principal,
      id,
      command.resolution,
      command.expectedVersion,
      decisionToken,
    );
    const candidate = record(await this.detail(input.principal, 'duplicates', id));
    if (command.resolution === 'merge_details') {
      const transactionId = String(candidate.rightTransactionId);
      const current = record(
        record(await this.ledger.getTransaction(input.principal, transactionId, input.requestId))
          .transaction,
      );
      const revision = record(
        await this.ledger.reviseTransaction({
          principal: input.principal,
          transactionId,
          body: {
            expectedVersion: current.version,
            reason: 'Merged details from a reviewed tracking duplicate',
            ...(command.merge as Record<string, unknown>),
          },
          idempotencyKey: `tracking-merge:${uuidFrom(input.idempotencyKey)}`,
          requestId: input.requestId,
        }),
      );
      return this.repository.decideDuplicate(
        input.principal,
        id,
        command,
        decisionToken,
        typeof revision.operationId === 'string'
          ? revision.operationId
          : uuidFrom(`merge:${input.idempotencyKey}`),
        transactionId,
        input.idempotencyKey,
        input.requestId,
      );
    }
    if (command.resolution === 'keep_existing')
      return this.repository.decideDuplicate(
        input.principal,
        id,
        command,
        decisionToken,
        null,
        String(candidate.rightTransactionId),
        input.idempotencyKey,
        input.requestId,
      );
    const item = record(await this.detail(input.principal, 'items', String(candidate.leftItemId)));
    const sourceKey = `tracking:${await this.repository.getImportSourceIdentityHash(
      input.principal,
      String(item.id),
    )}`;
    const values = { ...record(item.normalizedPayload), ...record(command.merge) };
    const ledger = record(
      await this.ledger.createTransaction({
        principal: input.principal,
        body: {
          kind: values.kind,
          amountMinor: Math.abs(Number(values.amountMinor)),
          currency: values.currency,
          accountId: values.accountId,
          categoryId: values.categoryId ?? null,
          title: values.title ?? values.merchant ?? 'Imported transaction',
          merchant: values.merchant ?? null,
          paymentMethod: values.paymentMethod ?? null,
          note: values.note ?? null,
          occurredAt: values.occurredAt,
          source: 'tracking-import',
          externalRef: sourceKey,
        },
        idempotencyKey: sourceKey,
        requestId: input.requestId,
      }),
    );
    const transaction = record(record(ledger.transaction).transaction);
    return this.repository.decideDuplicate(
      input.principal,
      id,
      command,
      decisionToken,
      typeof ledger.operationId === 'string' ? ledger.operationId : uuidFrom(input.idempotencyKey),
      String(transaction.id),
      input.idempotencyKey,
      input.requestId,
    );
  }

  feedback(input: Input): Promise<Record<string, unknown>> {
    try {
      const body = record(input.body);
      exact(body, ['historyId', 'kind', 'correctedCategoryId', 'comment']);
      const kind = boundedText(body.kind, 1, 40);
      if (
        ![
          'wrong_detection',
          'wrong_category',
          'wrong_merchant',
          'duplicate_missed',
          'other',
        ].includes(kind)
      )
        throw new Error();
      if (body.correctedCategoryId != null && kind !== 'wrong_category') throw new Error();
      return this.repository.feedback(
        input.principal,
        {
          historyId: normalizeTrackingId(body.historyId),
          feedbackType: kind,
          correctedCategoryId:
            body.correctedCategoryId == null ? null : normalizeTrackingId(body.correctedCategoryId),
          comment: body.comment == null ? null : boundedText(body.comment, 1, 500),
        },
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  async adminRead(
    principal: ClerkPrincipal,
    resource: string,
    id: string | null,
    query: unknown,
  ): Promise<unknown> {
    try {
      const values = record(query);
      exact(values, [
        'cursor',
        'limit',
        'purpose',
        'search',
        'status',
        'sourceType',
        'institutionId',
        'parserVersionId',
        'from',
        'to',
      ]);
      const page = normalizeTrackingList({ cursor: values.cursor, limit: values.limit });
      const cursor = page.cursor ? decodeTrackingCursor(page.cursor) : null;
      for (const key of [
        'search',
        'status',
        'sourceType',
        'institutionId',
        'parserVersionId',
        'from',
        'to',
      ])
        if (values[key] != null) boundedText(values[key], 1, 128);
      const purpose = values.purpose == null ? null : boundedText(values.purpose, 10, 500);
      const response = await this.repository.adminRead(
        principal,
        resource,
        id ? normalizeTrackingId(id) : null,
        id ? 1 : page.limit + 1,
        purpose,
        cursor,
        Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => !['cursor', 'limit', 'purpose'].includes(key) && value != null,
          ),
        ),
      );
      if (id) {
        const entries = Array.isArray(response) ? response : [];
        return entries[0] ?? Promise.reject(new HttpException({ code: 'NOT_FOUND' }, 404));
      }
      return Array.isArray(response) ? trackingPage(response, page.limit, resource) : response;
    } catch {
      throw this.validation();
    }
  }

  publishVersion(id: string, input: Input): Promise<Record<string, unknown>> {
    try {
      const action = normalizeAdminTrackingAction(input.body);
      if (action.action !== 'publish') throw new Error();
      return this.repository.publishVersion(
        input.principal,
        normalizeTrackingId(id),
        action.expectedVersion,
        action.reason,
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  adminMutate(resource: string, id: string | null, input: Input): Promise<Record<string, unknown>> {
    try {
      const action = normalizeAdminTrackingAction(input.body);
      const policies: Record<string, { actions: readonly string[]; fields: readonly string[] }> = {
        sessions: { actions: ['retry', 'retry_handoff', 'cancel'], fields: [] },
        failures: {
          actions: [
            'retry_handoff',
            'assign_parser_issue',
            'mark_unsupported',
            'create_rule_draft_handoff',
            'save',
          ],
          fields: [],
        },
        'low-confidence': {
          actions: [
            'accept_suggestion',
            'correct_merchant',
            'correct_category',
            'defer',
            'mark_unsupported',
          ],
          fields: ['title', 'merchant', 'categoryId'],
        },
        duplicates: { actions: ['confirm_duplicate', 'reject_match', 'defer'], fields: [] },
        unsupported: {
          actions: [
            'acknowledge',
            'ignore',
            'covered',
            'assign_parser_issue',
            'mark_unsupported',
            'create_rule_draft_handoff',
            'defer',
          ],
          fields: [],
        },
        institutions: {
          actions: ['create', 'save', 'deactivate'],
          fields: ['countryCode', 'name', 'code', 'active'],
        },
        senders: {
          actions: ['create', 'save', 'activate', 'deactivate'],
          fields: ['institutionId', 'senderPattern', 'displayLabel', 'priority', 'active'],
        },
        rules: {
          actions: ['create', 'save', 'activate', 'deactivate'],
          fields: ['institutionId', 'name', 'sourceType'],
        },
        versions: {
          actions: ['create', 'retire', 'rollback'],
          fields: ['ruleId', 'versionNo', 'definition'],
        },
        'test-cases': {
          actions: ['create', 'save', 'activate', 'deactivate'],
          fields: ['parserVersionId', 'name', 'inputFixture', 'expectedOutput', 'enabled'],
        },
        'merchant-rules': {
          actions: ['create', 'save', 'activate', 'deactivate'],
          fields: ['pattern', 'normalizedMerchant', 'priority', 'active'],
        },
        'category-rules': {
          actions: ['create', 'save', 'activate', 'deactivate'],
          fields: ['pattern', 'categoryId', 'priority', 'active'],
        },
        settings: {
          actions: ['save'],
          fields: ['rawRetentionDays', 'historyRetentionDays', 'maxCsvBytes', 'maxRows'],
        },
      };
      const policy = policies[resource];
      if (!policy || !policy.actions.includes(action.action)) throw new Error();
      exact(action.patch, policy.fields);
      if (
        resource === 'low-confidence' &&
        ((action.action === 'correct_merchant' &&
          (Object.keys(action.patch).length === 0 ||
            Object.keys(action.patch).some((key) => !['title', 'merchant'].includes(key)))) ||
          (action.action === 'correct_category' &&
            (Object.keys(action.patch).length !== 1 ||
              Object.keys(action.patch).some((key) => key !== 'categoryId'))) ||
          (!['correct_merchant', 'correct_category'].includes(action.action) &&
            Object.keys(action.patch).length > 0))
      )
        throw new Error();
      if (resource === 'versions' && id === null) validateParserDefinition(action.patch.definition);
      return this.repository.adminMutate(
        input.principal,
        resource,
        id ? normalizeTrackingId(id) : null,
        action.action,
        action.patch,
        action.expectedVersion,
        action.reason,
        input.idempotencyKey,
        input.requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  async parserPreview(
    principal: ClerkPrincipal,
    ruleId: string,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    try {
      const input = record(body);
      exact(input, ['sample']);
      const preview = record(
        await this.repository.parserPreview(principal, normalizeTrackingId(ruleId)),
      );
      return executeParserDefinition(validateParserDefinition(preview.definition), {
        body: boundedText(input.sample, 1, 4096),
        sender: '',
      });
    } catch {
      throw this.validation();
    }
  }

  createParserVersion(ruleId: string, input: Input): Promise<Record<string, unknown>> {
    try {
      const action = normalizeAdminTrackingAction(input.body);
      exact(action.patch, ['versionNo', 'definition']);
      return this.adminMutate('versions', null, {
        ...input,
        body: {
          ...action,
          patch: { ...action.patch, ruleId: normalizeTrackingId(ruleId) },
        },
      });
    } catch {
      throw this.validation();
    }
  }

  async runCorpus(versionId: string | null, input: Input): Promise<Record<string, unknown>> {
    let normalizedVersionId: string;
    let reason: string;
    try {
      const action = normalizeAdminTrackingAction(input.body);
      if (action.action !== 'run') throw new Error();
      if (versionId === null) {
        exact(action.patch, ['versionId']);
        if (Object.keys(action.patch).length !== 1) throw new Error();
        normalizedVersionId = normalizeTrackingId(action.patch.versionId);
      } else {
        normalizedVersionId = normalizeTrackingId(versionId);
        if (Object.keys(action.patch).length) throw new Error();
      }
      reason = action.reason;
    } catch {
      throw this.validation();
    }
    return this.repository.queueParserCorpus(
      input.principal,
      normalizedVersionId,
      reason,
      input.idempotencyKey,
      input.requestId,
    );
  }

  private async deleteOrQueueRaw(principal: ClerkPrincipal, raw: RawPayload): Promise<void> {
    try {
      await this.storage.delete(raw.storageRef);
    } catch (deleteError) {
      try {
        await this.repository.queueRawCleanup(principal, raw);
      } catch (queueError) {
        throw new AggregateError(
          [deleteError, queueError],
          'TRACKING_STORAGE_CLEANUP_QUEUE_FAILED',
        );
      }
      throw deleteError;
    }
  }

  private validation(): HttpException {
    return new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  }
}
