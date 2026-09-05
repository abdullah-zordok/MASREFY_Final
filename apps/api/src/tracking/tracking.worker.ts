import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { LedgerService } from '../ledger/ledger.service';
import {
  recordTrackingDuration,
  recordTrackingJob,
  recordTrackingOperational,
} from './tracking.observability';
import { TrackingRepository, type ImportClaim } from './tracking.repository';
import { executeParserDefinition } from './tracking.parser';
import { TrackingStorage } from './tracking.storage';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('IMPORT_RESULT_INVALID');
  return value as Record<string, unknown>;
}

function stableUuid(seed: string): string {
  const value = createHash('sha256').update(seed).digest('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

@Injectable()
export class TrackingWorker implements OnModuleDestroy {
  private active: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private readonly workerId = `tracking-${String(process.pid)}-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)}`;

  constructor(
    private readonly repository: TrackingRepository,
    private readonly ledger: LedgerService,
    private readonly storage: TrackingStorage,
  ) {}

  runOnce(): Promise<void> {
    if (this.active) return this.active;
    const current = this.execute();
    this.active = current;
    void current
      .finally(() => {
        if (this.active === current) this.active = undefined;
      })
      .catch(() => undefined);
    return current;
  }

  start(): void {
    if (this.stopped || this.timer) return;
    void this.runOnce().catch(() => undefined);
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), 30_000);
    this.timer.unref();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active?.catch(() => undefined);
  }
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private async execute(): Promise<void> {
    const startedAt = performance.now();
    const [corpusClaims, claims] = await Promise.all([
      this.repository.claimParserCorpus(this.workerId),
      this.repository.claimImports(this.workerId),
    ]);
    for (const claim of corpusClaims) await this.processCorpus(claim);
    recordTrackingJob(
      'parser.corpus',
      corpusClaims.length ? 'success' : 'empty',
      corpusClaims.length,
    );
    for (const claim of claims) await this.process(claim);
    recordTrackingJob('import.parse', claims.length ? 'success' : 'empty', claims.length);
    const due = await this.repository.rawDue();
    let purged = 0;
    let purgeFailed = false;
    for (const item of due) {
      try {
        await this.storage.delete(item.storage_ref);
        if (await this.repository.completeRaw(item.id, item.purge_token)) purged += 1;
        else purgeFailed = true;
      } catch {
        purgeFailed = true;
      }
    }
    recordTrackingJob(
      'raw.purge',
      purgeFailed ? 'failure' : due.length ? 'success' : 'empty',
      purged,
    );
    await this.repository.maintenance();
    recordTrackingJob('tracking.reconcile', 'success', 1);
    const operational = await this.repository.operationalMetrics();
    recordTrackingOperational('backlog', 'import.parse', Number(operational.importBacklog));
    recordTrackingOperational('backlog', 'review', Number(operational.reviewBacklog));
    recordTrackingOperational('backlog', 'duplicate', Number(operational.duplicateBacklog));
    recordTrackingOperational(
      'oldestAge',
      'import.parse',
      Number(operational.oldestImportAgeSeconds),
    );
    recordTrackingOperational('rawPurgeLag', 'raw.purge', Number(operational.rawPurgeLagSeconds));
    recordTrackingDuration('tracking.reconcile', 'success', performance.now() - startedAt);
  }

  private async processCorpus(claim: { id: string; claim_token: string }): Promise<void> {
    try {
      const corpus = record(await this.repository.prepareParserCorpus(claim.id, claim.claim_token));
      if (!Array.isArray(corpus.cases)) throw new Error('PARSER_CORPUS_INVALID');
      const results = corpus.cases.map((value) => {
        const item = record(value);
        return {
          id: String(item.id),
          passed: isDeepStrictEqual(
            executeParserDefinition(corpus.definition, {
              body: String(item.input),
              sender: '',
            }),
            item.expected,
          ),
        };
      });
      await this.repository.completeParserCorpus(claim.id, claim.claim_token, results, null);
    } catch (error) {
      const code =
        (error instanceof Error ? error.message : 'PARSER_CORPUS_FAILED').match(
          /[A-Z][A-Z0-9_]{2,79}/,
        )?.[0] ?? 'PARSER_CORPUS_FAILED';
      await this.repository
        .completeParserCorpus(claim.id, claim.claim_token, null, code)
        .catch(() => undefined);
      recordTrackingJob('parser.corpus', 'failure');
    }
  }

  private async process(claim: ImportClaim): Promise<void> {
    try {
      const prepared = await this.repository.prepareImport(claim.id, claim.claim_token);
      const parserItems = Array.isArray(prepared.parserItems) ? prepared.parserItems : [];
      for (const value of parserItems) {
        const item = record(value);
        if (item.definition && typeof item.definition === 'object') {
          const input = record(item.input);
          const source = Object.fromEntries(
            Object.entries(input).map(([key, entry]) => [
              key,
              typeof entry === 'string' ? entry : '',
            ]),
          );
          await this.repository.applyParserResult(
            String(item.id),
            claim.claim_token,
            executeParserDefinition(item.definition, source),
          );
        }
      }
      const finalized = await this.repository.finalizeImport(claim.id, claim.claim_token);
      const items = Array.isArray(finalized.autoItems) ? finalized.autoItems : [];
      for (const value of items) {
        const item = record(value),
          command = record(item.values);
        const principal: ClerkPrincipal = {
          userId: String(item.userId),
          sessionId: this.workerId,
          factorAgeSeconds: null,
          mfaAgeSeconds: null,
        };
        const key = `tracking:${await this.repository.getImportSourceIdentityHash(
          principal,
          String(item.id),
        )}`;
        try {
          const response = record(
            await this.ledger.createTransaction({
              principal,
              body: {
                kind: command.kind,
                amountMinor: Math.abs(Number(command.amountMinor)),
                currency: command.currency,
                accountId: command.accountId,
                categoryId: command.categoryId ?? null,
                title: command.title ?? command.merchant ?? 'Imported transaction',
                merchant: command.merchant ?? null,
                paymentMethod: command.paymentMethod ?? null,
                note: command.note ?? null,
                occurredAt: command.occurredAt,
                source: 'tracking-import',
                externalRef: key,
              },
              idempotencyKey: key,
              requestId: stableUuid(key),
            }),
          );
          const transaction = record(record(response.transaction).transaction);
          await this.repository.acceptImportItem(
            String(item.id),
            claim.claim_token,
            typeof response.operationId === 'string' ? response.operationId : stableUuid(key),
            String(transaction.id),
          );
        } catch (error) {
          const response =
            error && typeof error === 'object' && 'response' in error
              ? Reflect.get(error, 'response')
              : null;
          const code =
            response && typeof response === 'object' && 'code' in response
              ? Reflect.get(response, 'code')
              : '';
          if (typeof code !== 'string') throw error;
          if (
            !['RECENT_AUTH_REQUIRED', 'VALIDATION_FAILED', 'TRACKING_ACCOUNT_BLOCKED'].includes(
              code,
            )
          )
            throw error;
          await this.repository.deferImportItem(
            String(item.id),
            claim.claim_token,
            code === 'RECENT_AUTH_REQUIRED'
              ? 'recent_auth_required'
              : code === 'TRACKING_ACCOUNT_BLOCKED'
                ? 'account_tracking_blocked'
                : 'ledger_validation_failed',
          );
        }
      }
      await this.repository.completeImport(claim.id, claim.claim_token, 'succeeded', null);
    } catch (error) {
      const code =
        (error instanceof Error ? error.message : 'IMPORT_PROCESSING_FAILED').match(
          /[A-Z][A-Z0-9_]{2,79}/,
        )?.[0] ?? 'IMPORT_PROCESSING_FAILED';
      await this.repository
        .completeImport(claim.id, claim.claim_token, 'failed', code)
        .catch(() => undefined);
      recordTrackingJob('import.parse', 'failure');
    }
  }
}
