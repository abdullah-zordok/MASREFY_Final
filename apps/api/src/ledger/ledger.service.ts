import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { LEDGER_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { SecurityRepository } from '../security/security.repository';
import type { ReferenceOperation, ReferenceRepository } from '../reference/reference.repository';
import {
  normalizeCreateTransaction,
  normalizeDelete,
  normalizeLedgerRead,
  normalizeRefund,
  normalizeRestore,
  normalizeReverse,
  normalizeRevision,
  normalizeTransactionId,
  normalizeTransfer,
} from './ledger.dto';
import { LedgerRepository } from './ledger.repository';

export interface LedgerMutation {
  operation: string;
  scope: string;
  principal: ClerkPrincipal;
  command: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string;
  status: number;
}

interface MutationInput {
  principal: ClerkPrincipal;
  body: unknown;
  idempotencyKey: string;
  requestId: string;
  now?: Date;
}
interface ExistingMutationInput extends MutationInput {
  transactionId: string;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly security: SecurityRepository,
    private readonly config: PlatformConfigService,
  ) {}

  async listTransactions(
    principal: ClerkPrincipal,
    query: Record<string, unknown>,
    requestId: string,
  ): Promise<unknown> {
    try {
      normalizeLedgerRead(query);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.repository.listTransactions(principal, query, requestId);
  }

  async getTransaction(
    principal: ClerkPrincipal,
    transactionId: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      transactionId = normalizeTransactionId(transactionId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.repository.getTransaction(principal, transactionId, requestId);
  }

  async getAccountSummary(
    principal: ClerkPrincipal,
    accountId: string,
    query: Record<string, unknown>,
    requestId: string,
  ): Promise<unknown> {
    try {
      accountId = normalizeTransactionId(accountId);
      normalizeLedgerRead(query);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.repository.getAccountSummary(principal, accountId, query, requestId);
  }

  async createTransaction(input: MutationInput): Promise<unknown> {
    let command;
    try {
      command = normalizeCreateTransaction(input.body, input.now);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const mutation = {
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: input.principal,
      command,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      status: 201,
    };
    const replay = await this.repository.replayCompleted(mutation);
    if (replay !== undefined) return replay;
    await this.assertWriteRate(input.principal, 'create_transaction');
    this.assertRecentAuth(input.principal, command.currency, command.amountMinor);
    return this.repository.mutate(mutation);
  }

  async transfer(input: MutationInput): Promise<unknown> {
    let command;
    try {
      command = normalizeTransfer(input.body, input.now);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const mutation = {
      operation: 'transfer',
      scope: 'ledger.transfer.create',
      principal: input.principal,
      command,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      status: 201,
    };
    const replay = await this.repository.replayCompleted(mutation);
    if (replay !== undefined) return replay;
    await this.assertWriteRate(input.principal, 'transfer');
    const amount = Number(command.amountMinor),
      fee = Number(command.feeMinor);
    this.assertRecentAuth(
      input.principal,
      String(command.currency),
      amount > Number.MAX_SAFE_INTEGER - fee ? Number.MAX_SAFE_INTEGER : amount + fee,
    );
    return this.repository.mutate(mutation);
  }

  async reviseTransaction(input: ExistingMutationInput): Promise<unknown> {
    let normalized, transactionId;
    try {
      normalized = normalizeRevision(input.body, input.now);
      transactionId = normalizeTransactionId(input.transactionId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const mutation = {
      operation: 'reviseTransaction',
      scope: 'ledger.transaction.revise',
      principal: input.principal,
      command: { transactionId, ...normalized },
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      status: 200,
    };
    const replay = await this.repository.replayCompleted(mutation);
    if (replay !== undefined) return replay;
    const current = await this.repository.effect(input.principal, transactionId);
    if (current.version !== normalized.expectedVersion)
      throw new HttpException({ code: 'VERSION_CONFLICT', currentVersion: current.version }, 409);
    await this.assertWriteRate(input.principal, 'revise_transaction');
    const next =
      typeof normalized.patch.amountMinor === 'number'
        ? normalized.patch.amountMinor
        : current.amountMinor;
    this.assertRecentAuth(
      input.principal,
      current.currency,
      Math.max(current.amountMinor + current.feeMinor, next),
    );
    return this.repository.mutate(mutation);
  }

  async refundTransaction(input: ExistingMutationInput): Promise<unknown> {
    return this.compensate(input, 'refundTransaction');
  }

  async reverseTransaction(input: ExistingMutationInput): Promise<unknown> {
    return this.compensate(input, 'reverseTransaction');
  }

  private async compensate(
    input: ExistingMutationInput,
    operation: 'refundTransaction' | 'reverseTransaction',
  ): Promise<unknown> {
    let normalized: Record<string, unknown>, transactionId: string;
    try {
      normalized =
        operation === 'refundTransaction'
          ? normalizeRefund(input.body, input.now)
          : normalizeReverse(input.body, input.now);
      transactionId = normalizeTransactionId(input.transactionId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const mutation = {
      operation,
      scope:
        operation === 'refundTransaction'
          ? 'ledger.transaction.refund'
          : 'ledger.transaction.reverse',
      principal: input.principal,
      command: { transactionId, ...normalized },
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      status: 201,
    };
    const replay = await this.repository.replayCompleted(mutation);
    if (replay !== undefined) return replay;
    const current = await this.repository.effect(input.principal, transactionId);
    if (current.version !== normalized.expectedVersion)
      throw new HttpException({ code: 'VERSION_CONFLICT', currentVersion: current.version }, 409);
    await this.assertWriteRate(input.principal, operation);
    this.assertRecentAuth(
      input.principal,
      current.currency,
      current.amountMinor + current.feeMinor,
    );
    return this.repository.mutate(mutation);
  }

  async deleteTransaction(input: ExistingMutationInput): Promise<unknown> {
    return this.changeState(input, 'deleteTransaction');
  }

  async restoreTransaction(input: ExistingMutationInput): Promise<unknown> {
    return this.changeState(input, 'restoreTransaction');
  }

  private async changeState(
    input: ExistingMutationInput,
    operation: 'deleteTransaction' | 'restoreTransaction',
  ): Promise<unknown> {
    let normalized: Record<string, unknown>, transactionId: string;
    try {
      normalized =
        operation === 'deleteTransaction'
          ? normalizeDelete(input.body)
          : normalizeRestore(input.body);
      transactionId = normalizeTransactionId(input.transactionId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    const mutation = {
      operation,
      scope:
        operation === 'deleteTransaction'
          ? 'ledger.transaction.delete'
          : 'ledger.transaction.restore',
      principal: input.principal,
      command: { transactionId, ...normalized },
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      status: 200,
    };
    const replay = await this.repository.replayCompleted(mutation);
    if (replay !== undefined) return replay;
    const current = await this.repository.effect(input.principal, transactionId);
    if (current.version !== normalized.expectedVersion)
      throw new HttpException({ code: 'VERSION_CONFLICT', currentVersion: current.version }, 409);
    await this.assertWriteRate(input.principal, operation);
    this.assertRecentAuth(
      input.principal,
      current.currency,
      current.amountMinor + current.feeMinor,
    );
    return this.repository.mutate(mutation);
  }

  async createAccount(input: ReferenceOperation, reference: ReferenceRepository): Promise<unknown> {
    const opening = Number(input.body.openingBalanceMinor ?? 0),
      currency = typeof input.body.currency === 'string' ? input.body.currency : '';
    const replay = await this.repository.replayCompleted({
      operation: 'createAccountOpening',
      scope: 'reference.account.create',
      principal: input.principal,
      command: input.body,
      idempotencyKey: input.idempotencyKey ?? '',
      requestId: input.requestId,
      status: 201,
    });
    if (replay !== undefined) return replay;
    await this.assertWriteRate(input.principal, 'create_account_opening');
    this.assertRecentAuth(input.principal, currency, Math.abs(opening));
    return this.repository.createAccount(input, reference);
  }

  private assertRecentAuth(principal: ClerkPrincipal, currency: string, effect: number): void {
    const threshold = this.config.get('MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS')?.[currency];
    if (
      threshold !== undefined &&
      effect >= threshold &&
      (principal.factorAgeSeconds === null ||
        principal.factorAgeSeconds >
          this.config.getRequired('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS'))
    )
      throw new HttpException({ code: 'RECENT_AUTH_REQUIRED' }, 403);
  }

  private async assertWriteRate(principal: ClerkPrincipal, operation: string): Promise<void> {
    if (await this.security.consumeRateLimit(principal, 'ledger.write', 60, 60, null)) return;
    recordPlatformMetric(LEDGER_METRICS.rateLimitDenied, 1, { operation });
    throw new HttpException({ code: 'RATE_LIMITED' }, 429);
  }
}
