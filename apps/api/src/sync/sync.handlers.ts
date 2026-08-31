import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { LedgerService } from '../ledger/ledger.service';
import { ReferenceService } from '../reference/reference.service';
import type { SyncMutation } from './sync.types';

@Injectable()
export class SyncHandlers {
  constructor(
    private readonly reference: ReferenceService,
    private readonly ledger: LedgerService,
  ) {}

  async dispatch(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    if (mutation.domain === 'transactions') return this.transaction(principal, mutation, requestId);
    return this.referenceMutation(principal, mutation, requestId);
  }

  private transaction(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    const common = {
      principal,
      body: mutation.payload,
      idempotencyKey: mutation.operationId,
      requestId,
    };
    if (mutation.operation === 'create') return this.ledger.createTransaction(common);
    if (!mutation.resourceId || mutation.baseVersion === null)
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    const existing = {
      ...common,
      transactionId: mutation.resourceId,
      body: { ...mutation.payload, expectedVersion: mutation.baseVersion },
    };
    if (mutation.operation === 'update') return this.ledger.reviseTransaction(existing);
    if (mutation.operation === 'delete' || mutation.operation === 'archive')
      return this.ledger.deleteTransaction(existing);
    return this.ledger.restoreTransaction(existing);
  }

  private referenceMutation(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    const resource = mutation.domain === 'accounts' ? 'Account' : 'Category';
    const operation = `${mutation.operation}${resource}`;
    const allowed = new Set([
      'createAccount',
      'updateAccount',
      'archiveAccount',
      'restoreAccount',
      'createCategory',
      'updateCategory',
      'archiveCategory',
      'restoreCategory',
    ]);
    if (!allowed.has(operation) || (mutation.operation !== 'create' && !mutation.resourceId))
      throw new HttpException({ code: 'SYNC_OPERATION_UNSUPPORTED' }, 400);
    const expectedVersion = mutation.baseVersion;
    return this.reference.execute({
      operation,
      principal,
      requestId,
      idempotencyKey: mutation.operationId,
      body:
        mutation.operation === 'create'
          ? mutation.payload
          : { ...mutation.payload, expectedVersion },
      query: mutation.operation === 'archive' ? { expectedVersion: String(expectedVersion) } : {},
      params:
        mutation.domain === 'accounts'
          ? { accountId: mutation.resourceId ?? '' }
          : { categoryId: mutation.resourceId ?? '' },
    });
  }
}
