import { createHash } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PoolService } from '../platform/database/pool.service';
import { decodePlanningCursor, encodePlanningCursor } from './planning.dto';

interface PlanningMutation {
  operation: string;
  scope: string;
  status: number;
  principal: ClerkPrincipal;
  command: Record<string, unknown>;
  idempotencyKey: string;
  requestId: string;
}

interface Claim extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  lease_token: string | null;
}

interface JsonResult extends QueryResultRow {
  result: Record<string, unknown>;
}
interface SalaryProfileRow extends QueryResultRow {
  id: string;
  name: string;
  amount_minor: string;
  currency_code: string;
  frequency: string;
  expected_day: number | null;
  custom_interval_days: number | null;
  account_id: string | null;
  automatic_detection_enabled: boolean;
  status: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface SalaryReceiptRow extends QueryResultRow {
  id: string;
  salary_profile_id: string;
  transaction_id: string | null;
  expected_at: Date;
  received_at: Date | null;
  amount_minor: string;
  status: string;
  operation_id: string | null;
  replaces_receipt_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface BudgetRow extends QueryResultRow {
  id: string;
  name: string;
  currency_code: string;
  period_start: string;
  period_end: string;
  total_minor: string;
  income_target_minor: string;
  savings_target_minor: string;
  rollover_enabled: boolean;
  rollover_minor: string;
  status: string;
  copied_from_budget_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface BudgetCategoryRow extends QueryResultRow {
  id: string;
  category_id: string;
  limit_minor: string;
  rollover_minor: string;
  alert_thresholds: number[];
  status: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface BudgetUtilizationRow extends QueryResultRow {
  budget_category_id: string;
  category_id: string;
  limit_minor: string;
  spent_minor: string;
  remaining_minor: string;
  utilization_bps: number | null;
  ledger_version: string;
  data_state: string;
  unavailable_reason: string | null;
}
interface ObligationRow extends QueryResultRow {
  id: string;
  name: string;
  direction: string;
  type: string;
  schedule_kind: string;
  currency_code: string;
  principal_minor: string;
  opening_paid_minor: string;
  installment_amount_minor: string | null;
  installment_count: number | null;
  frequency: string;
  expected_day: number | null;
  custom_interval_days: number | null;
  start_date: string;
  end_date: string | null;
  status: string;
  default_account_id: string | null;
  automatic_matching_enabled: boolean;
  provider: string | null;
  provider_keywords: string[];
  reminder_timing: string | null;
  notes: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface ObligationScheduleRow extends QueryResultRow {
  id: string;
  obligation_id: string;
  due_at: Date;
  amount_minor: string;
  paid_minor: string;
  status: string;
  sequence_no: number;
  kind: string;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface ObligationStatusRow extends QueryResultRow {
  direction: string;
  currency_code: string;
  scheduled_minor: string;
  allocated_minor: string;
  paid_minor: string;
  remaining_minor: string;
  overdue_minor: string;
  next_due_at: Date | null;
  completed_installment_count: number;
  status: string;
  ledger_version: string;
}
interface PaymentMatchRow extends QueryResultRow {
  id: string;
  transaction_id: string;
  obligation_id: string;
  schedule_item_id: string | null;
  confidence: string;
  evidence: Record<string, unknown>;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}
interface SavingsGoalRow extends QueryResultRow {
  id: string;
  name: string;
  currency_code: string;
  target_minor: string;
  opening_tracked_minor: string;
  target_date: string | null;
  status: string;
  linked_account_id: string | null;
  icon_key: string | null;
  emergency_fund: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
  progress_minor: string;
}
interface SavingsMovementRow extends QueryResultRow {
  id: string;
  goal_id: string;
  transaction_id: string;
  amount_minor: string;
  occurred_at: Date;
  kind: string;
  operation_id: string | null;
  replaces_movement_id: string | null;
  created_at: Date;
}
interface PlanningSalarySummaryRow extends QueryResultRow {
  id: string;
  name: string;
  currency_code: string;
  expected_minor: string;
  actual_income_minor: string;
  actual_expense_minor: string;
  reserved_obligation_minor: string;
  next_expected_at: Date | null;
}
interface PlanningBudgetSummaryRow extends QueryResultRow {
  id: string;
  name: string;
  currency_code: string;
  total_minor: string;
  spent_minor: string;
  remaining_minor: string;
  ledger_version: string;
  data_state: string;
}
interface PlanningObligationSummaryRow extends ObligationStatusRow {
  id: string;
  name: string;
}
interface PlanningClaimRow extends QueryResultRow {
  id: string;
  resource_id: string;
  attempt_count: number;
  lease_token: string;
}
export interface PlanningClaim {
  id: string;
  resourceId: string;
  attemptCount: number;
  leaseToken: string;
}
export type ClaimedPlanningJob =
  | 'planning.salary-cycle.generate'
  | 'planning.obligation-schedule.generate'
  | 'planning.payment-match.propose'
  | 'planning.overdue.mark'
  | 'planning.reminders.emit';

function stableUuid(seed: string): string {
  const value = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  value[12] = '4';
  value[16] = ((Number.parseInt(value[16] ?? '0', 16) & 3) | 8).toString(16);
  const hex = value.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function domainError(code: string, status: number, currentVersion?: number): HttpException {
  return new HttpException(
    { code, ...(currentVersion === undefined ? {} : { currentVersion }) },
    status,
  );
}

function mapError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const pg = error as { code?: string; message?: string; detail?: string };
  const messageCode = pg.message?.match(/[A-Z][A-Z0-9_]{2,63}/)?.[0] ?? '';
  if (messageCode === 'VERSION_CONFLICT') {
    const version = Number(pg.detail);
    return domainError(
      'PLANNING_VERSION_CONFLICT',
      409,
      Number.isSafeInteger(version) ? version : undefined,
    );
  }
  if (messageCode.startsWith('IDEMPOTENCY_')) return domainError(messageCode, 409);
  if (messageCode.endsWith('_NOT_FOUND')) return domainError('PLANNING_NOT_FOUND', 404);
  if (/(?:REFERENCE|ACCOUNT|TRANSACTION)_INVALID$/.test(messageCode))
    return domainError('PLANNING_LEDGER_STATE_INVALID', 409);
  if (messageCode.endsWith('_USED')) return domainError('PLANNING_TRANSACTION_DUPLICATE', 409);
  if (/ALLOCATION|SCHEDULE_INVALID|CATEGORY_INVALID|COPY_INVALID/.test(messageCode))
    return domainError('PLANNING_ALLOCATION_INVALID', 409);
  if (messageCode === 'PLANNING_PROGRESS_INSUFFICIENT') return domainError(messageCode, 409);
  if (messageCode === 'SAVINGS_TARGET_DECISION_REQUIRED')
    return domainError('PLANNING_REVIEW_REQUIRED', 409);
  if (
    /INELIGIBLE|TRANSITION_INVALID|TERMINAL|SCHEDULE_LOCKED|REPLACEMENT_INVALID/.test(messageCode)
  )
    return domainError('PLANNING_LIFECYCLE_INVALID', 409);
  if (messageCode.endsWith('_REQUEST_INVALID') || messageCode === 'PLANNING_HORIZON_INVALID')
    return domainError('VALIDATION_FAILED', 400);
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(pg.code ?? ''))
    return domainError('VALIDATION_FAILED', 400);
  if (pg.code === '28000') return domainError('AUTH_TOKEN_INVALID', 401);
  if (pg.code === '42501') return domainError('PERMISSION_DENIED', 403);
  if (['40001', '40P01', '55P03', '57014'].includes(pg.code ?? ''))
    return domainError('PLANNING_RATE_LIMITED', 409);
  return domainError('INTERNAL_ERROR', 503);
}

function databaseOperation(operation: string): string {
  const match = (
    [
      ['create', 'create'],
      ['update', 'update'],
      ['archive', 'archive'],
      ['delete', 'delete'],
      ['link', 'link'],
      ['unlink', 'unlink'],
      ['replace', 'replace'],
      ['allocate', 'record'],
      ['reverse', 'reverse'],
      ['decide', 'decide'],
      ['record', 'record'],
    ] as const
  ).find(([prefix]) => operation.startsWith(prefix));
  if (!match) throw new Error('PLANNING_OPERATION_UNSUPPORTED');
  return match[1];
}

function planningCommandSql(operation: string): string {
  if (operation.includes('SalaryProfile'))
    return 'select private.save_salary_profile($1,$2::jsonb) result';
  if (operation.includes('SalaryReceipt'))
    return 'select private.link_salary_receipt($1,$2::jsonb) result';
  if (operation.includes('Obligation'))
    return 'select private.save_obligation($1,$2::jsonb) result';
  if (operation.includes('SavingsGoal'))
    return 'select private.save_savings_goal($1,$2::jsonb) result';
  return 'select private.save_budget($1,$2::jsonb) result';
}

@Injectable()
export class PlanningRepository {
  constructor(private readonly pool: PoolService) {}

  async mutate(input: PlanningMutation): Promise<Record<string, unknown>> {
    try {
      return await this.withApiTransaction(input.principal, (client) =>
        this.mutateWithClient(client, input),
      );
    } catch (error) {
      throw mapError(error);
    }
  }

  private async mutateWithClient(
    client: PoolClient,
    input: PlanningMutation,
  ): Promise<Record<string, unknown>> {
    const keyHash = hashIdempotencyKey(input.idempotencyKey);
    const requestHash = hashNormalizedCommand(input.command);
    const claim = await this.claimMutation(client, input, keyHash, requestHash);
    if (claim.outcome === 'replay') return claim.response_body as Record<string, unknown>;
    const operationId = stableUuid(`${input.principal.userId}:${input.scope}:${keyHash}:operation`);
    const command = this.buildCommand(input, keyHash, operationId);
    const resource = await this.executeMutation(client, input, command, operationId);
    if (!resource || typeof resource.id !== 'string') throw new Error('PLANNING_RESULT_MISSING');
    const response = { operationId, replayed: false, resource };
    await this.completeMutation(client, input, claim, keyHash, requestHash, response, resource.id);
    return response;
  }

  private async claimMutation(
    client: PoolClient,
    input: PlanningMutation,
    keyHash: string,
    requestHash: string,
  ): Promise<Claim> {
    const claim = (
      await client.query<Claim>(
        'select * from private.claim_sync_idempotency_key($1,$2,$3,$4,$5::interval)',
        [input.principal.userId, input.scope, keyHash, requestHash, '2 minutes'],
      )
    ).rows[0];
    if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
    if (claim.outcome === 'hash_mismatch') throw new Error('IDEMPOTENCY_KEY_REUSED');
    if (claim.outcome === 'in_progress') throw new Error('IDEMPOTENCY_IN_PROGRESS');
    if (claim.outcome === 'replay') {
      if (!claim.response_body || claim.response_status !== input.status)
        throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
      return claim;
    }
    if (!claim.lease_token) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
    return claim;
  }

  private buildCommand(
    input: PlanningMutation,
    keyHash: string,
    operationId: string,
  ): Record<string, unknown> {
    const command: Record<string, unknown> = {
      ...input.command,
      operation: databaseOperation(input.operation),
      operationId,
      requestId: input.requestId,
    };
    const resourceFields: Record<string, string> = {
      createSalaryProfile: 'profileId',
      createBudget: 'budgetId',
      createObligation: 'obligationId',
      allocateObligationPayment: 'paymentId',
      createSavingsGoal: 'goalId',
      recordSavingsMovement: 'movementId',
    };
    const resourceField = resourceFields[input.operation];
    const resourceId = stableUuid(`${input.principal.userId}:${input.scope}:${keyHash}:resource`);
    if (resourceField) command[resourceField] = resourceId;
    if (input.operation === 'decidePaymentMatch' && command.decision === 'accepted')
      command.allocation = {
        ...(command.allocation as Record<string, unknown>),
        paymentId: resourceId,
      };
    return command;
  }

  private async executeMutation(
    client: PoolClient,
    input: PlanningMutation,
    command: Record<string, unknown>,
    operationId: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (input.operation === 'replaceBudgetCategories')
      return this.queryJson(
        client,
        'select private.replace_budget_categories($1,$2::uuid,$3::bigint,$4::jsonb) result',
        [
          input.principal.userId,
          command.budgetId,
          command.expectedVersion,
          JSON.stringify({
            allocations: command.allocations,
            operationId,
            requestId: input.requestId,
          }),
        ],
      );
    if (['allocateObligationPayment', 'reverseObligationPayment'].includes(input.operation))
      return this.queryJson(
        client,
        'select private.allocate_obligation_payment($1,$2::jsonb) result',
        [input.principal.userId, JSON.stringify(command)],
      );
    if (input.operation === 'decidePaymentMatch')
      return this.queryJson(client, 'select private.decide_payment_match($1,$2::jsonb) result', [
        input.principal.userId,
        JSON.stringify(command),
      ]);
    if (input.operation === 'recordSavingsMovement')
      return this.queryJson(client, 'select private.record_savings_movement($1,$2::jsonb) result', [
        input.principal.userId,
        JSON.stringify(command),
      ]);
    if (input.operation !== 'reverseSavingsMovement')
      return this.queryJson(client, planningCommandSql(input.operation), [
        input.principal.userId,
        JSON.stringify(command),
      ]);
    const resource = await this.queryJson(
      client,
      'select private.reverse_savings_movement($1,$2::uuid,$3::bigint,$4::uuid) result',
      [input.principal.userId, command.movementId, command.expectedVersion, operationId],
    );
    if (resource?.goalId !== command.goalId) throw new Error('SAVINGS_GOAL_NOT_FOUND');
    return resource;
  }

  private async queryJson(
    client: PoolClient,
    sql: string,
    values: unknown[],
  ): Promise<Record<string, unknown> | undefined> {
    return (await client.query<JsonResult>(sql, values)).rows[0]?.result;
  }

  private async completeMutation(
    client: PoolClient,
    input: PlanningMutation,
    claim: Claim,
    keyHash: string,
    requestHash: string,
    response: Record<string, unknown>,
    resourceId: string,
  ): Promise<void> {
    await client.query(
      'select private.complete_sync_idempotency_key($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
      [
        input.principal.userId,
        input.scope,
        keyHash,
        requestHash,
        claim.lease_token,
        input.status,
        JSON.stringify(response),
        resourceId,
      ],
    );
  }

  async listSalaryProfiles(
    principal: ClerkPrincipal,
    query: { cursor: string | null; limit: number },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<SalaryProfileRow>(
      principal,
      `select * from public.salary_profiles
       where user_id=$1 and ($2::timestamptz is null or (created_at,id)<($2,$3::uuid))
       order by created_at desc,id desc limit $4`,
      [principal.userId, cursor?.at ?? null, cursor?.id ?? null, query.limit + 1],
    );
    const items = rows.slice(0, query.limit).map((row) => this.salaryProfile(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async getSalaryProfile(
    principal: ClerkPrincipal,
    profileId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const row = (
      await this.queryOwner<SalaryProfileRow>(
        principal,
        'select * from public.salary_profiles where id=$1 and user_id=$2',
        [profileId, principal.userId],
      )
    )[0];
    if (!row) throw domainError('NOT_FOUND', 404);
    return { ...this.salaryProfile(row), requestId };
  }

  async listSalaryReceipts(
    principal: ClerkPrincipal,
    profileId: string,
    query: { cursor: string | null; limit: number; transactionId: string | null },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<SalaryReceiptRow>(
      principal,
      `select * from public.salary_receipts where user_id=$1 and salary_profile_id=$2
       and ($3::uuid is null or transaction_id=$3)
       and ($4::timestamptz is null or (created_at,id)<($4,$5::uuid))
       order by created_at desc,id desc limit $6`,
      [
        principal.userId,
        profileId,
        query.transactionId,
        cursor?.at ?? null,
        cursor?.id ?? null,
        query.limit + 1,
      ],
    );
    const items = rows.slice(0, query.limit).map((row) => this.salaryReceipt(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async listBudgets(
    principal: ClerkPrincipal,
    query: { cursor: string | null; limit: number; period: { start: string; end: string } | null },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<BudgetRow>(
      principal,
      `select * from public.budgets where user_id=$1
       and ($2::date is null or (period_start<=$3::date and period_end>=$2::date))
       and ($4::timestamptz is null or (created_at,id)<($4,$5::uuid))
       order by created_at desc,id desc limit $6`,
      [
        principal.userId,
        query.period?.start ?? null,
        query.period?.end ?? null,
        cursor?.at ?? null,
        cursor?.id ?? null,
        query.limit + 1,
      ],
    );
    const items = rows.slice(0, query.limit).map((row) => this.budget(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async getBudget(
    principal: ClerkPrincipal,
    budgetId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.queryOwner<BudgetRow>(
      principal,
      'select * from public.budgets where id=$1 and user_id=$2',
      [budgetId, principal.userId],
    );
    const row = rows[0];
    if (!row) throw domainError('NOT_FOUND', 404);
    const categories = await this.queryOwner<BudgetCategoryRow>(
      principal,
      'select * from public.budget_categories where budget_id=$1 and user_id=$2 order by category_id,id',
      [budgetId, principal.userId],
    );
    return {
      ...this.budget(row),
      categories: categories.map((category) => this.budgetCategory(category)),
      requestId,
    };
  }

  async getBudgetSummary(
    principal: ClerkPrincipal,
    budgetId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const budgetRows = await this.queryOwner<BudgetRow>(
      principal,
      'select * from public.budgets where id=$1 and user_id=$2',
      [budgetId, principal.userId],
    );
    const budget = budgetRows[0];
    if (!budget) throw domainError('NOT_FOUND', 404);
    const rows = await this.queryOwner<BudgetUtilizationRow>(
      principal,
      'select * from public.v_budget_utilization where budget_id=$1 and user_id=$2 order by category_id,budget_category_id',
      [budgetId, principal.userId],
    );
    const spent = rows.reduce((total, row) => total + BigInt(row.spent_minor), 0n);
    const partial = rows.some((row) => row.data_state === 'partial');
    return {
      budgetId,
      currencyCode: budget.currency_code.trim(),
      periodStart: budget.period_start,
      periodEnd: budget.period_end,
      totalMinor: budget.total_minor,
      spentMinor: spent.toString(),
      remainingMinor: (BigInt(budget.total_minor) - spent).toString(),
      dataState: partial ? 'partial' : 'complete',
      unavailableReason: partial ? 'missing_rate' : null,
      ledgerVersion: Math.max(0, ...rows.map((row) => Number(row.ledger_version))),
      items: rows.map((row) => ({
        budgetCategoryId: row.budget_category_id,
        categoryId: row.category_id,
        limitMinor: row.limit_minor,
        spentMinor: row.spent_minor,
        remainingMinor: row.remaining_minor,
        utilizationBps: row.utilization_bps,
        dataState: row.data_state,
        unavailableReason: row.unavailable_reason,
      })),
      requestId,
    };
  }

  async listObligations(
    principal: ClerkPrincipal,
    query: { cursor: string | null; limit: number; status: string | null },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<ObligationRow>(
      principal,
      `select * from public.obligations where user_id=$1 and ($2::text is null or status=$2)
       and ($3::timestamptz is null or (created_at,id)<($3,$4::uuid))
       order by created_at desc,id desc limit $5`,
      [principal.userId, query.status, cursor?.at ?? null, cursor?.id ?? null, query.limit + 1],
    );
    const items = rows.slice(0, query.limit).map((row) => this.obligation(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async getObligation(
    principal: ClerkPrincipal,
    obligationId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.queryOwner<ObligationRow>(
      principal,
      'select * from public.obligations where id=$1 and user_id=$2',
      [obligationId, principal.userId],
    );
    const row = rows[0];
    if (!row) throw domainError('NOT_FOUND', 404);
    const summary = (
      await this.queryOwner<ObligationStatusRow>(
        principal,
        'select * from public.v_obligation_status where obligation_id=$1 and user_id=$2',
        [obligationId, principal.userId],
      )
    )[0];
    return {
      ...this.obligation(row),
      summary: summary ? this.obligationStatus(summary) : null,
      requestId,
    };
  }

  async listObligationSchedule(
    principal: ClerkPrincipal,
    obligationId: string,
    query: { cursor: string | null; limit: number },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const exists = (
      await this.queryOwner<{ id: string }>(
        principal,
        'select id from public.obligations where id=$1 and user_id=$2',
        [obligationId, principal.userId],
      )
    )[0];
    if (!exists) throw domainError('NOT_FOUND', 404);
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<ObligationScheduleRow>(
      principal,
      `select * from public.obligation_schedule_items where obligation_id=$1 and user_id=$2
       and ($3::timestamptz is null or (created_at,id)<($3,$4::uuid))
       order by created_at desc,id desc limit $5`,
      [obligationId, principal.userId, cursor?.at ?? null, cursor?.id ?? null, query.limit + 1],
    );
    const items = rows.slice(0, query.limit).map((row) => this.obligationSchedule(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async listPaymentMatches(
    principal: ClerkPrincipal,
    query: { cursor: string | null; limit: number; status: string | null },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<PaymentMatchRow>(
      principal,
      `select * from public.payment_matches where user_id=$1 and ($2::text is null or status=$2)
       and ($3::timestamptz is null or (created_at,id)<($3,$4::uuid))
       order by created_at desc,id desc limit $5`,
      [principal.userId, query.status, cursor?.at ?? null, cursor?.id ?? null, query.limit + 1],
    );
    const items = rows.slice(0, query.limit).map((row) => this.paymentMatch(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async getPaymentMatch(
    principal: ClerkPrincipal,
    matchId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const row = (
      await this.queryOwner<PaymentMatchRow>(
        principal,
        'select * from public.payment_matches where id=$1 and user_id=$2',
        [matchId, principal.userId],
      )
    )[0];
    if (!row) throw domainError('NOT_FOUND', 404);
    return { ...this.paymentMatch(row), requestId };
  }

  async listSavingsGoals(
    principal: ClerkPrincipal,
    query: { cursor: string | null; limit: number; status: string | null },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const cursor = query.cursor ? decodePlanningCursor(query.cursor) : null;
    const rows = await this.queryOwner<SavingsGoalRow>(
      principal,
      `select g.*,(g.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint progress_minor
       from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id
       where g.user_id=$1 and ($2::text is null or g.status=$2)
         and ($3::timestamptz is null or (g.created_at,g.id)<($3,$4::uuid))
       group by g.id order by g.created_at desc,g.id desc limit $5`,
      [principal.userId, query.status, cursor?.at ?? null, cursor?.id ?? null, query.limit + 1],
    );
    const items = rows.slice(0, query.limit).map((row) => this.savingsGoal(row));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items,
      nextCursor: last
        ? encodePlanningCursor({ at: last.created_at.toISOString(), id: last.id })
        : null,
      requestId,
    };
  }

  async getSavingsGoal(
    principal: ClerkPrincipal,
    goalId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const row = (
      await this.queryOwner<SavingsGoalRow>(
        principal,
        `select g.*,(g.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint progress_minor
       from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id
       where g.id=$1 and g.user_id=$2 group by g.id`,
        [goalId, principal.userId],
      )
    )[0];
    if (!row) throw domainError('NOT_FOUND', 404);
    const movements = await this.queryOwner<SavingsMovementRow>(
      principal,
      'select * from public.savings_goal_movements where goal_id=$1 and user_id=$2 order by occurred_at desc,id desc limit 100',
      [goalId, principal.userId],
    );
    return {
      ...this.savingsGoal(row),
      movements: movements.map((movement) => this.savingsMovement(movement)),
      requestId,
    };
  }

  async getPlanningSummary(
    principal: ClerkPrincipal,
    period: { key: string; start: string; end: string },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.withApiTransaction(principal, async (client) => {
      const salary =
        (
          await client.query<PlanningSalarySummaryRow>(
            `select p.id,p.name,p.currency_code,p.amount_minor expected_minor,
          coalesce(sum(t.amount_minor) filter(where t.kind='income'),0)::bigint actual_income_minor,
          coalesce(sum(case when t.kind='expense' then t.amount_minor when t.kind='refund' then -t.amount_minor else 0 end),0)::bigint actual_expense_minor,
          coalesce((select sum(greatest(i.amount_minor-i.paid_minor,0)) from public.obligation_schedule_items i
            join public.obligations o on o.id=i.obligation_id where i.user_id=p.user_id
            and o.currency_code=p.currency_code and i.due_at>=$2::date and i.due_at<($3::date+1)),0)::bigint reserved_obligation_minor,
          (select min(r.expected_at) from public.salary_receipts r where r.salary_profile_id=p.id
            and r.status in ('expected','received','corrected') and r.expected_at>=$2::date) next_expected_at
         from public.salary_profiles p left join public.transactions t on t.user_id=p.user_id
          and t.currency_code=p.currency_code and t.status='confirmed'
          and t.kind in ('income','expense','refund') and t.occurred_at>=$2::date and t.occurred_at<($3::date+1)
         where p.user_id=$1 and p.status='active' group by p.id order by p.updated_at desc,p.id limit 1`,
            [principal.userId, period.start, period.end],
          )
        ).rows[0] ?? null;
      const budgets = (
        await client.query<PlanningBudgetSummaryRow>(
          `select b.id,b.name,b.currency_code,b.total_minor,coalesce(sum(u.spent_minor),0)::bigint spent_minor,
          (b.total_minor-coalesce(sum(u.spent_minor),0))::bigint remaining_minor,
          coalesce(max(u.ledger_version),0)::bigint ledger_version,
          case when bool_or(u.data_state='partial') then 'partial' else 'complete' end data_state
         from public.budgets b left join public.v_budget_utilization u on u.budget_id=b.id
         where b.user_id=$1 and b.status<>'deleted' and b.period_end>=$2::date and b.period_start<=$3::date
         group by b.id order by b.period_start desc,b.id limit 100`,
          [principal.userId, period.start, period.end],
        )
      ).rows;
      const obligations = (
        await client.query<PlanningObligationSummaryRow>(
          `select o.id,o.name,s.direction,s.currency_code,s.scheduled_minor,s.allocated_minor,s.paid_minor,
          s.remaining_minor,s.overdue_minor,s.next_due_at,s.completed_installment_count,s.status,s.ledger_version
         from public.obligations o join public.v_obligation_status s on s.obligation_id=o.id
         where o.user_id=$1 order by s.next_due_at nulls last,o.id limit 100`,
          [principal.userId],
        )
      ).rows;
      const savings = (
        await client.query<SavingsGoalRow>(
          `select g.*,(g.opening_tracked_minor+coalesce(sum(m.amount_minor),0))::bigint progress_minor
         from public.savings_goals g left join public.savings_goal_movements m on m.goal_id=g.id
         where g.user_id=$1 and g.status<>'deleted' group by g.id order by g.target_date nulls last,g.id limit 100`,
          [principal.userId],
        )
      ).rows;
      const ledgerVersion = Number(
        (
          await client.query<{ version: string }>(
            `select coalesce(max(ab.ledger_version),0)::bigint version from public.account_balances ab
         join public.accounts a on a.id=ab.account_id where a.user_id=$1`,
            [principal.userId],
          )
        ).rows[0]?.version ?? 0,
      );
      const partial = budgets.some((budget) => budget.data_state === 'partial');
      const empty =
        !salary && budgets.length === 0 && obligations.length === 0 && savings.length === 0;
      const obligation = (row: PlanningObligationSummaryRow) => ({
        id: row.id,
        name: row.name,
        ...this.obligationStatus(row),
      });
      return {
        period: period.key,
        dataState: partial ? 'partial' : empty ? 'empty' : 'ready',
        ledgerVersion,
        salary: salary
          ? {
              id: salary.id,
              name: salary.name,
              currencyCode: salary.currency_code.trim(),
              expectedMinor: salary.expected_minor,
              actualIncomeMinor: salary.actual_income_minor,
              actualExpenseMinor: salary.actual_expense_minor,
              reservedObligationMinor: salary.reserved_obligation_minor,
              nextExpectedAt: salary.next_expected_at?.toISOString() ?? null,
            }
          : null,
        budgets: budgets.map((budget) => ({
          id: budget.id,
          name: budget.name,
          currencyCode: budget.currency_code.trim(),
          totalMinor: budget.total_minor,
          spentMinor: budget.spent_minor,
          remainingMinor: budget.remaining_minor,
          ledgerVersion: Number(budget.ledger_version),
          dataState: budget.data_state,
        })),
        obligations: {
          payables: obligations.filter((row) => row.direction === 'payable').map(obligation),
          receivables: obligations.filter((row) => row.direction === 'receivable').map(obligation),
        },
        savings: savings.map((goal) => this.savingsGoal(goal)),
        requestId,
      };
    });
  }

  async getAdminPlanningSummary(
    principal: ClerkPrincipal,
    userId: string,
    period: { key: string; start: string; end: string },
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.withApiTransaction(
      principal,
      async (client) =>
        (
          await client.query<JsonResult>(
            'select private.read_admin_planning_summary($1,$2,$3::date,$4::date) result',
            [principal.userId, userId, period.start, period.end],
          )
        ).rows[0]?.result,
    );
    if (!result) throw domainError('NOT_FOUND', 404);
    return { ...result, period: period.key, requestId };
  }

  async claimPlanning(
    job: ClaimedPlanningJob,
    limit = 100,
    leaseSeconds = 60,
  ): Promise<PlanningClaim[]> {
    const functionName = {
      'planning.salary-cycle.generate': 'claim_planning_salary_cycles',
      'planning.obligation-schedule.generate': 'claim_planning_obligation_schedules',
      'planning.payment-match.propose': 'claim_planning_match_candidates',
      'planning.overdue.mark': 'claim_planning_overdue',
      'planning.reminders.emit': 'claim_planning_reminders',
    }[job];
    return this.withWorkerTransaction(async (client) =>
      (
        await client.query<PlanningClaimRow>(
          `select id,resource_id,attempt_count,lease_token from private.${functionName}($1::uuid,$2,$3)`,
          [null, limit, leaseSeconds],
        )
      ).rows.map((row) => ({
        id: row.id,
        resourceId: row.resource_id,
        attemptCount: row.attempt_count,
        leaseToken: row.lease_token,
      })),
    );
  }

  async executePlanningClaim(job: ClaimedPlanningJob, claim: PlanningClaim): Promise<void> {
    await this.withWorkerTransaction(async (client) => {
      const result = (
        await client.query<JsonResult>(
          'select private.execute_planning_claim($1::uuid,$2::uuid,$3,$4::uuid) result',
          [claim.id, claim.leaseToken, job, claim.resourceId],
        )
      ).rows[0]?.result;
      if (!result) throw new Error('PLANNING_RESULT_MISSING');
      await client.query('select private.complete_planning_claim($1::uuid,$2::uuid,$3,$4::jsonb)', [
        claim.id,
        claim.leaseToken,
        'completed',
        JSON.stringify(result),
      ]);
    });
  }

  completePlanningClaim(
    claimId: string,
    leaseToken: string,
    outcome: 'completed' | 'retry' | 'exhausted',
    result: Record<string, unknown>,
  ): Promise<void> {
    return this.withWorkerTransaction(async (client) => {
      await client.query('select private.complete_planning_claim($1::uuid,$2::uuid,$3,$4::jsonb)', [
        claimId,
        leaseToken,
        outcome,
        JSON.stringify(result),
      ]);
    });
  }

  reconcilePlanning(repair: boolean, limit = 100): Promise<Array<Record<string, unknown>>> {
    return this.withWorkerTransaction(
      async (client) =>
        (
          await client.query<Record<string, unknown> & QueryResultRow>(
            'select * from private.reconcile_planning($1::uuid,$2,$3)',
            [null, repair, limit],
          )
        ).rows,
    );
  }

  withApiTransaction<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction('masarifi_api', principal, action);
  }

  withWorkerTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction('masarifi_worker', null, action);
  }

  async queryOwner<T extends QueryResultRow>(
    principal: ClerkPrincipal,
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.withApiTransaction(
      principal,
      async (client) => (await client.query<T>(sql, [...values])).rows,
    );
  }

  private async transaction<T>(
    role: 'masarifi_api' | 'masarifi_worker',
    principal: ClerkPrincipal | null,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        if (principal)
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: principal.userId,
              sid: principal.sessionId,
            }),
          ]);
        await client.query(
          role === 'masarifi_api'
            ? 'set local role masarifi_api'
            : 'set local role masarifi_worker',
        );
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  private salaryProfile(row: SalaryProfileRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      amountMinor: row.amount_minor,
      currencyCode: row.currency_code.trim(),
      frequency: row.frequency,
      expectedDay: row.expected_day,
      customIntervalDays: row.custom_interval_days,
      accountId: row.account_id,
      automaticDetectionEnabled: row.automatic_detection_enabled,
      status: row.status,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private salaryReceipt(row: SalaryReceiptRow): Record<string, unknown> {
    return {
      id: row.id,
      salaryProfileId: row.salary_profile_id,
      transactionId: row.transaction_id,
      expectedAt: row.expected_at.toISOString(),
      receivedAt: row.received_at?.toISOString() ?? null,
      amountMinor: row.amount_minor,
      status: row.status,
      operationId: row.operation_id,
      replacesReceiptId: row.replaces_receipt_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private budget(row: BudgetRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      currencyCode: row.currency_code.trim(),
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalMinor: row.total_minor,
      incomeTargetMinor: row.income_target_minor,
      savingsTargetMinor: row.savings_target_minor,
      rolloverEnabled: row.rollover_enabled,
      rolloverMinor: row.rollover_minor,
      status: row.status,
      copiedFromBudgetId: row.copied_from_budget_id,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private budgetCategory(row: BudgetCategoryRow): Record<string, unknown> {
    return {
      id: row.id,
      categoryId: row.category_id,
      limitMinor: row.limit_minor,
      rolloverMinor: row.rollover_minor,
      alertThresholds: row.alert_thresholds,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private obligation(row: ObligationRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      direction: row.direction,
      type: row.type,
      scheduleKind: row.schedule_kind,
      currencyCode: row.currency_code.trim(),
      principalMinor: row.principal_minor,
      openingPaidMinor: row.opening_paid_minor,
      installmentAmountMinor: row.installment_amount_minor,
      installmentCount: row.installment_count,
      frequency: row.frequency,
      expectedDay: row.expected_day,
      customIntervalDays: row.custom_interval_days,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      defaultAccountId: row.default_account_id,
      automaticMatchingEnabled: row.automatic_matching_enabled,
      provider: row.provider,
      providerKeywords: row.provider_keywords,
      reminderTiming: row.reminder_timing,
      notes: row.notes,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private obligationSchedule(row: ObligationScheduleRow): Record<string, unknown> {
    return {
      id: row.id,
      obligationId: row.obligation_id,
      dueAt: row.due_at.toISOString(),
      amountMinor: row.amount_minor,
      paidMinor: row.paid_minor,
      status: row.status,
      sequenceNo: row.sequence_no,
      kind: row.kind,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private obligationStatus(row: ObligationStatusRow): Record<string, unknown> {
    return {
      direction: row.direction,
      currencyCode: row.currency_code.trim(),
      scheduledMinor: row.scheduled_minor,
      allocatedMinor: row.allocated_minor,
      paidMinor: row.paid_minor,
      remainingMinor: row.remaining_minor,
      overdueMinor: row.overdue_minor,
      nextDueAt: row.next_due_at?.toISOString() ?? null,
      completedInstallmentCount: row.completed_installment_count,
      status: row.status,
      ledgerVersion: Number(row.ledger_version),
    };
  }

  private paymentMatch(row: PaymentMatchRow): Record<string, unknown> {
    const reasonCodes: string[] = [];
    if (row.evidence.amountMatch === true) reasonCodes.push('amount_match');
    if (row.evidence.keywordMatch === true) reasonCodes.push('keyword_match');
    return {
      id: row.id,
      transactionId: row.transaction_id,
      obligationId: row.obligation_id,
      scheduleItemId: row.schedule_item_id,
      advisoryConfidence: row.confidence,
      reasonCodes,
      status: row.status,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private savingsGoal(row: SavingsGoalRow): Record<string, unknown> {
    const progress = BigInt(row.progress_minor);
    return {
      id: row.id,
      name: row.name,
      currencyCode: row.currency_code.trim(),
      targetMinor: row.target_minor,
      openingTrackedMinor: row.opening_tracked_minor,
      progressMinor: row.progress_minor,
      remainingMinor: (BigInt(row.target_minor) - progress).toString(),
      progressBps: Number((progress * 10000n) / BigInt(row.target_minor)),
      targetDate: row.target_date,
      status: row.status,
      linkedAccountId: row.linked_account_id,
      iconKey: row.icon_key,
      emergencyFund: row.emergency_fund,
      deletedAt: row.deleted_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  }

  private savingsMovement(row: SavingsMovementRow): Record<string, unknown> {
    return {
      id: row.id,
      goalId: row.goal_id,
      transactionId: row.transaction_id,
      amountMinor: row.amount_minor,
      occurredAt: row.occurred_at.toISOString(),
      kind: row.kind,
      operationId: row.operation_id,
      replacesMovementId: row.replaces_movement_id,
      createdAt: row.created_at.toISOString(),
    };
  }
}
