import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { PoolService } from '../platform/database/pool.service';
import { buildReferenceEvent } from './reference.events';

export interface ReferenceOperation {
  operation: string;
  principal: ClerkPrincipal;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, string>;
  requestId: string;
  idempotencyKey?: string;
  permission?: 'reference.read' | 'reference.write';
}

const hash = (value: unknown): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const cursor = (offset: number, hasMore: boolean): string | null =>
  hasMore ? Buffer.from(String(offset)).toString('base64url') : null;
interface ReferenceRow extends QueryResultRow {
  id: string;
  user_id: string | null;
  kind: string;
  label_ar: string;
  label_en: string;
  icon: string | null;
  color: string | null;
  system_key: string | null;
  parent_id: string | null;
  merged_into_id: string | null;
  sort_order: number;
  active: boolean;
  version: string | number;
  created_at: Date;
  updated_at: Date;
  name: string;
  type: string;
  currency_code: string;
  institution_name: string | null;
  last_four: string | null;
  credit_limit_minor: string | null;
  is_default: boolean;
  icon_key: string | null;
  color_key: string | null;
  notes: string | null;
  status: string;
  include_in_totals: boolean;
  automatic_tracking_enabled: boolean;
  statement_day: number | null;
  payment_due_day: number | null;
  monthly_interest_rate_basis_points: number | null;
  minimum_payment_minor: string | null;
  opened_at: Date | null;
  closed_at: Date | null;
  base_currency: string;
  quote_currency: string;
  rate: string;
  effective_at: Date;
  provider: string;
  code: string;
  minor_unit: number;
  default_currency: string;
  enabled: boolean;
}
type PageRow = QueryResultRow & Record<string, unknown>;
interface AuditRecord {
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  event: string;
  payload: Record<string, unknown>;
  reason?: string;
}
interface AdminReferenceTarget {
  table: 'currencies' | 'supported_countries';
  key: 'code';
  id: string;
}

@Injectable()
export class ReferenceRepository {
  constructor(private readonly pool: PoolService) {}

  async createAccountOnClient(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    if (input.operation !== 'createAccount') throw new Error('REFERENCE_OPERATION_INVALID');
    await client.query('select private.assert_active_profile($1)', [input.principal.userId]);
    return this.executeInTransaction(client, input);
  }

  private transaction<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            role: 'authenticated',
            sub: principal.userId,
            sid: principal.sessionId,
          }),
        ]);
        await client.query('set local role masarifi_api');
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async sharedHash(
    principal: ClerkPrincipal,
    resource: 'currencies' | 'countries' | 'categories',
  ): Promise<string> {
    return this.transaction(principal, async (client) => {
      await client.query('select private.assert_active_profile($1)', [principal.userId]);
      const table = resource === 'countries' ? 'supported_countries' : resource;
      const where =
        resource === 'categories'
          ? 'where user_id is null and active and deleted_at is null'
          : 'where enabled';
      const result = await client.query<{ digest: string }>(
        `select encode(digest(coalesce(string_agg(row_to_json(x)::text,'' order by x.key),''),'sha256'),'hex') digest from (select ${resource === 'categories' ? 'id::text key,version,label_ar,label_en,kind,icon,color,sort_order' : 'code::text key,version,name'} from public.${table} ${where}) x`,
      );
      return result.rows[0]?.digest ?? hash([]);
    });
  }

  async execute(input: ReferenceOperation): Promise<unknown> {
    return this.transaction(input.principal, async (client) => {
      if (input.permission)
        await client.query('select private.assert_admin_permission($1)', [input.permission]);
      else await client.query('select private.assert_active_profile($1)', [input.principal.userId]);
      return this.executeInTransaction(client, input);
    });
  }

  private async audit(
    client: PoolClient,
    input: ReferenceOperation,
    record: AuditRecord,
  ): Promise<void> {
    const actorType = input.permission ? 'admin' : 'user';
    await client.query('select audit.append_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
      input.principal.userId,
      actorType,
      record.action,
      record.resourceType,
      record.resourceId,
      record.before === null ? null : hash(record.before),
      record.after === null ? null : hash(record.after),
      record.reason ?? null,
      input.requestId,
      JSON.stringify({ operation: input.operation }),
    ]);
    await client.query('select private.enqueue_outbox_event($1,$2,$3,$4)', [
      record.event,
      record.resourceType,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.resourceId,
      )
        ? record.resourceId
        : null,
      JSON.stringify(buildReferenceEvent(record.event, record.payload)),
    ]);
  }

  private async executeInTransaction(
    client: PoolClient,
    input: ReferenceOperation,
  ): Promise<unknown> {
    const b = input.body,
      q = input.query,
      p = input.params,
      user = input.principal.userId;
    switch (input.operation) {
      case 'listCurrencies':
        return (
          await client.query<ReferenceRow>(
            `select btrim(code) code,name,minor_unit "minorUnit",version::int from public.currencies where enabled order by code`,
          )
        ).rows;
      case 'listCountries':
        return (
          await client.query<ReferenceRow>(
            `select btrim(code) code,name,btrim(default_currency) "defaultCurrency",version::int from public.supported_countries where enabled order by code`,
          )
        ).rows;
      case 'listSystemCategories':
        return (
          await client.query<ReferenceRow>(
            `select id,'system' scope,kind,label_ar "labelAr",label_en "labelEn",icon,color,system_key "systemKey",parent_id "parentId",merged_into_id "mergedIntoId",sort_order "sortOrder",active,case when active then 'active' else 'archived' end status,version::int,created_at "createdAt",updated_at "updatedAt" from public.categories where user_id is null and active and deleted_at is null and ($1::text is null or kind=$1) order by sort_order,id`,
            [q.kind ?? null],
          )
        ).rows;
      case 'listUserCategories': {
        const rows = (
          await client.query(
            `select id,'custom' scope,kind,label_ar "labelAr",label_en "labelEn",icon,color,null::text "systemKey",parent_id "parentId",merged_into_id "mergedIntoId",sort_order "sortOrder",active,case when merged_into_id is not null then 'merged' when active then 'active' else 'archived' end status,version::int,created_at "createdAt",updated_at "updatedAt" from public.categories where user_id=$1 and ($2::text is null or kind=$2) and ($3::boolean or active) and ($4::integer is null or (sort_order,id)>($4,$5::uuid)) order by sort_order,id limit $6`,
            [
              user,
              q.kind ?? null,
              q.includeInactive === true,
              q.afterSort ?? null,
              q.afterId ?? null,
              Number(q.limit) + 1,
            ],
          )
        ).rows;
        return rows;
      }
      case 'getCategoryUsage': {
        const usage = await this.categoryUsage(client, input);
        return {
          linkedTransactionCount: usage.linkedTransactionCount,
          version: usage.version,
        };
      }
      case 'createCategory': {
        const row = (
          await client.query<ReferenceRow>(
            `insert into public.categories(user_id,kind,label_ar,label_en,icon,color,parent_id,sort_order) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
            [
              user,
              b.kind,
              b.labelAr,
              b.labelEn,
              b.icon ?? null,
              b.color ?? null,
              b.parentId ?? null,
              b.sortOrder,
            ],
          )
        ).rows[0];
        if (!row) throw new Error('REFERENCE_UNAVAILABLE');
        await this.audit(client, input, {
          action: 'category.created',
          resourceType: 'category',
          resourceId: row.id,
          before: null,
          after: row,
          event: 'category.created',
          payload: {
            categoryId: row.id,
            userId: user,
            kind: row.kind,
            version: Number(row.version),
            occurredAt: new Date().toISOString(),
          },
        });
        return this.category(row);
      }
      case 'updateCategory':
        return this.updateCategory(client, input);
      case 'archiveCategory':
        return this.archiveCategory(client, input);
      case 'restoreCategory':
        return this.restoreCategory(client, input);
      case 'mergeCategory':
        return this.mergeCategory(client, input);
      case 'listAccounts': {
        const limit = Number(q.limit),
          offset = Number(q.offset);
        const rows = (
          await client.query<ReferenceRow>(
            `select * from public.accounts where user_id=$1 and ($2::text is null or status=$2) order by sort_order,id limit $3 offset $4`,
            [user, q.status ?? null, limit + 1, offset],
          )
        ).rows;
        return {
          items: rows.slice(0, limit).map((row) => this.account(row)),
          nextCursor: cursor(offset + limit, rows.length > limit),
        };
      }
      case 'getAccount': {
        const row = (
          await client.query<ReferenceRow>(
            'select * from public.accounts where id=$1 and user_id=$2',
            [p.accountId, user],
          )
        ).rows[0];
        if (!row) throw new Error('NOT_FOUND');
        return this.account(row);
      }
      case 'createAccount': {
        if (b.isDefault) await this.clearDefault(client, user);
        const row = (
          await client.query<ReferenceRow>(
            `insert into public.accounts(user_id,name,type,currency_code,institution_name,last_four,credit_limit_minor,is_default,icon_key,color_key,notes,sort_order,include_in_totals,opened_at,automatic_tracking_enabled,statement_day,payment_due_day,monthly_interest_rate_basis_points,minimum_payment_minor) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,
            [
              user,
              b.name,
              b.type,
              b.currency,
              b.institutionName ?? null,
              b.lastFour ?? null,
              b.creditLimitMinor ?? null,
              b.isDefault,
              b.iconKey ?? null,
              b.colorKey ?? null,
              b.notes ?? null,
              b.sortOrder,
              b.includeInTotals,
              b.openedAt ?? null,
              b.automaticTrackingEnabled ?? true,
              b.statementDay ?? null,
              b.paymentDueDay ?? null,
              b.monthlyInterestRateBasisPoints ?? null,
              b.minimumPaymentMinor ?? null,
            ],
          )
        ).rows[0];
        if (!row) throw new Error('REFERENCE_UNAVAILABLE');
        await this.audit(client, input, {
          action: 'account.created',
          resourceType: 'account',
          resourceId: row.id,
          before: null,
          after: row,
          event: 'account.created',
          payload: {
            accountId: row.id,
            userId: user,
            version: Number(row.version),
            occurredAt: new Date().toISOString(),
          },
        });
        return { account: this.account(row), openingTransactionId: null };
      }
      case 'updateAccount':
        return this.updateAccount(client, input);
      case 'archiveAccount':
        return this.archiveAccount(client, input);
      case 'restoreAccount':
        return this.restoreAccount(client, input);
      case 'closeAccount':
        return this.closeAccount(client, input);
      case 'getExchangeRate': {
        const row = (
          await client.query<PageRow>(
            `select btrim(base_currency) base,btrim(quote_currency) quote,rate::text,"effective_at" "effectiveAt",provider from private.resolve_exchange_rate($1,$2,$3,make_interval(secs=>$4))`,
            [q.base, q.quote, q.at, q.maxAgeSeconds],
          )
        ).rows[0];
        if (!row) throw new Error('FX_UNAVAILABLE');
        return { ...row, rate: Number(row.rate) };
      }
      case 'listAdminCurrencies':
        return this.page(
          client,
          `select btrim(code) code,name,minor_unit "minorUnit",enabled,version::int from public.currencies order by code`,
          [],
          q,
        );
      case 'listAdminCountries':
        return this.page(
          client,
          `select btrim(code) code,name,btrim(default_currency) "defaultCurrency",enabled,version::int from public.supported_countries order by code`,
          [],
          q,
        );
      case 'listAdminSystemCategories':
        return this.page(
          client,
          `select id,'system' scope,kind,label_ar "labelAr",label_en "labelEn",icon,color,system_key "systemKey",parent_id "parentId",merged_into_id "mergedIntoId",sort_order "sortOrder",active,case when active then 'active' else 'archived' end status,version::int,created_at "createdAt",updated_at "updatedAt" from public.categories where user_id is null order by sort_order,id`,
          [],
          q,
          (row) => this.category(row as ReferenceRow),
        );
      case 'listAdminExchangeRates':
        return this.page(
          client,
          `select id,btrim(base_currency) base,btrim(quote_currency) quote,rate::text,effective_at "effectiveAt",provider from public.exchange_rates order by effective_at desc,id`,
          [],
          q,
          (row) => ({ ...row, rate: Number(row.rate) }),
        );
      case 'updateAdminCurrency':
        return this.updateAdminReference(client, input, {
          table: 'currencies',
          key: 'code',
          id: p.currencyCode as string,
        });
      case 'updateAdminCountry':
        return this.updateAdminReference(client, input, {
          table: 'supported_countries',
          key: 'code',
          id: p.countryCode as string,
        });
      case 'updateAdminSystemCategory':
        return this.updateAdminCategory(client, input);
      case 'createAdminExchangeRate': {
        const row = (
          await client.query<ReferenceRow>(
            `insert into public.exchange_rates(base_currency,quote_currency,rate,effective_at,provider,provider_ref) values($1,$2,$3,$4,'manual-admin',$5) returning *`,
            [b.base, b.quote, b.rate, b.effectiveAt, b.providerRef ?? null],
          )
        ).rows[0];
        if (!row) throw new Error('REFERENCE_UNAVAILABLE');
        await this.audit(client, input, {
          action: 'exchange-rate.refreshed',
          resourceType: 'exchange_rate',
          resourceId: row.id,
          before: null,
          after: row,
          event: 'exchange-rate.refreshed',
          payload: {
            exchangeRateId: row.id,
            baseCurrency: row.base_currency.trim(),
            quoteCurrency: row.quote_currency.trim(),
            provider: 'manual-admin',
            effectiveAt: new Date(row.effective_at).toISOString(),
            occurredAt: new Date().toISOString(),
          },
          reason: b.reason as string,
        });
        return {
          id: row.id,
          base: row.base_currency.trim(),
          quote: row.quote_currency.trim(),
          rate: Number(row.rate),
          effectiveAt: row.effective_at,
          provider: row.provider,
        };
      }
      default:
        throw new Error('REFERENCE_OPERATION_INVALID');
    }
  }

  private async page(
    client: PoolClient,
    sql: string,
    values: unknown[],
    q: Record<string, unknown>,
    project: (row: PageRow) => unknown = (row) => row,
  ): Promise<unknown> {
    const limit = Number(q.limit),
      offset = Number(q.offset);
    const first = String(values.length + 1),
      second = String(values.length + 2);
    const rows = (
      await client.query<PageRow>(`${sql} limit $${first} offset $${second}`, [
        ...values,
        limit + 1,
        offset,
      ])
    ).rows;
    return {
      items: rows.slice(0, limit).map(project),
      nextCursor: cursor(offset + limit, rows.length > limit),
    };
  }
  private async clearDefault(
    client: PoolClient,
    user: string,
    exceptId: string | null = null,
  ): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      `account-default:${user}`,
    ]);
    await client.query(
      `update public.accounts set is_default=false where user_id=$1 and is_default and status='active' and id is distinct from $2::uuid`,
      [user, exceptId],
    );
  }
  private async locked(
    client: PoolClient,
    table: 'categories' | 'accounts',
    id: string | undefined,
    user: string,
  ): Promise<ReferenceRow | undefined> {
    return (
      await client.query<ReferenceRow>(
        `select * from public.${table} where id=$1 and user_id=$2 for update`,
        [id, user],
      )
    ).rows[0];
  }
  private async updateCategory(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'categories',
      input.params.categoryId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    const b = input.body;
    const map: Record<string, string> = {
      kind: 'kind',
      labelAr: 'label_ar',
      labelEn: 'label_en',
      icon: 'icon',
      color: 'color',
      parentId: 'parent_id',
      sortOrder: 'sort_order',
    };
    const { sql, values } = this.patch(map, b, 2);
    const row = (
      await client.query<ReferenceRow>(
        `update public.categories set ${sql} where id=$1 and version=$2 returning *`,
        [before.id, b.expectedVersion, ...values],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'category.updated',
      resourceType: 'category',
      resourceId: row.id,
      before,
      after: row,
      event: 'category.updated',
      payload: {
        categoryId: row.id,
        userId: input.principal.userId,
        kind: row.kind,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: Object.keys(b)
          .filter((k) => k !== 'expectedVersion')
          .sort(),
      },
    });
    return this.category(row);
  }
  private async archiveCategory(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const { category: before, linkedTransactionCount } = await this.categoryUsage(client, input);
    if (!before.active) return null;
    if (linkedTransactionCount !== input.query.expectedLinkedTransactionCount)
      throw new Error('CATEGORY_USAGE_CHANGED');
    const row = (
      await client.query<ReferenceRow>(
        `update public.categories set active=false,deleted_at=clock_timestamp() where id=$1 and version=$2 returning *`,
        [before.id, input.query.expectedVersion],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'category.deleted',
      resourceType: 'category',
      resourceId: row.id,
      before,
      after: row,
      event: 'category.deleted',
      payload: {
        categoryId: row.id,
        userId: input.principal.userId,
        kind: row.kind,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
      },
    });
    return null;
  }
  private async restoreCategory(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'categories',
      input.params.categoryId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    if (before.active) return this.category(before);
    const row = (
      await client.query<ReferenceRow>(
        `update public.categories set active=true,deleted_at=null where id=$1 and merged_into_id is null and version=$2 returning *`,
        [before.id, input.body.expectedVersion],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'category.updated',
      resourceType: 'category',
      resourceId: row.id,
      before,
      after: row,
      event: 'category.updated',
      payload: {
        categoryId: row.id,
        userId: input.principal.userId,
        kind: row.kind,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: ['active'],
      },
    });
    return this.category(row);
  }
  private async mergeCategory(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const { category: before, linkedTransactionCount } = await this.categoryUsage(client, input);
    if (linkedTransactionCount !== input.body.expectedLinkedTransactionCount)
      throw new Error('CATEGORY_USAGE_CHANGED');
    const target = await this.locked(
      client,
      'categories',
      input.body.targetId as string,
      input.principal.userId,
    );
    if (
      !target ||
      !target.active ||
      target.merged_into_id !== null ||
      target.kind !== before.kind ||
      target.id === before.id
    )
      throw new Error('CATEGORY_INVALID');
    await client.query('select * from private.reassign_category_transactions($1,$2,$3,$4)', [
      input.principal.userId,
      before.id,
      target.id,
      input.requestId,
    ]);
    const row = (
      await client.query<ReferenceRow>(
        `update public.categories set active=false,deleted_at=clock_timestamp(),merged_into_id=$3 where id=$1 and version=$2 returning *`,
        [before.id, input.body.expectedVersion, input.body.targetId],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'category.merged',
      resourceType: 'category',
      resourceId: row.id,
      before,
      after: row,
      event: 'category.merged',
      payload: {
        categoryId: row.id,
        userId: input.principal.userId,
        kind: row.kind,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        targetCategoryId: input.body.targetId,
      },
    });
    return { source: this.category(row), targetId: input.body.targetId };
  }
  private async categoryUsage(
    client: PoolClient,
    input: ReferenceOperation,
  ): Promise<{ category: ReferenceRow; linkedTransactionCount: number; version: number }> {
    const usage = (
      await client.query<{
        linkedTransactionCount: string;
        version: string;
        active: boolean;
        merged: boolean;
      }>(
        `select linked_transaction_count::text "linkedTransactionCount",
          version::text,active,merged
         from private.get_category_usage($1,$2)`,
        [input.principal.userId, input.params.categoryId],
      )
    ).rows[0];
    if (!usage) throw new Error('NOT_FOUND');
    const category = await this.locked(
      client,
      'categories',
      input.params.categoryId,
      input.principal.userId,
    );
    if (!category) throw new Error('NOT_FOUND');
    if (usage.merged) throw new Error('CATEGORY_INVALID');
    const linkedTransactionCount = Number(usage.linkedTransactionCount);
    return {
      category,
      linkedTransactionCount,
      version: Number(usage.version),
    };
  }
  private async updateAccount(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'accounts',
      input.params.accountId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    if (input.body.isDefault) await this.clearDefault(client, input.principal.userId, before.id);
    const map: Record<string, string> = {
      name: 'name',
      type: 'type',
      institutionName: 'institution_name',
      lastFour: 'last_four',
      creditLimitMinor: 'credit_limit_minor',
      isDefault: 'is_default',
      iconKey: 'icon_key',
      colorKey: 'color_key',
      notes: 'notes',
      sortOrder: 'sort_order',
      includeInTotals: 'include_in_totals',
      automaticTrackingEnabled: 'automatic_tracking_enabled',
      openedAt: 'opened_at',
      statementDay: 'statement_day',
      paymentDueDay: 'payment_due_day',
      monthlyInterestRateBasisPoints: 'monthly_interest_rate_basis_points',
      minimumPaymentMinor: 'minimum_payment_minor',
    };
    const { sql, values } = this.patch(map, input.body, 2);
    const row = (
      await client.query<ReferenceRow>(
        `update public.accounts set ${sql} where id=$1 and version=$2 returning *`,
        [before.id, input.body.expectedVersion, ...values],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'account.updated',
      resourceType: 'account',
      resourceId: row.id,
      before,
      after: row,
      event: 'account.updated',
      payload: {
        accountId: row.id,
        userId: input.principal.userId,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: Object.keys(input.body)
          .filter((k) => k !== 'expectedVersion')
          .sort(),
      },
    });
    return this.account(row);
  }
  private async archiveAccount(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'accounts',
      input.params.accountId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    if (before.status === 'archived') return null;
    if (before.status === 'closed') throw new Error('ACCOUNT_CLOSED');
    const row = (
      await client.query<ReferenceRow>(
        `update public.accounts set status='archived',deleted_at=clock_timestamp(),is_default=false where id=$1 and version=$2 returning *`,
        [before.id, input.query.expectedVersion],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'account.archived',
      resourceType: 'account',
      resourceId: row.id,
      before,
      after: row,
      event: 'account.archived',
      payload: {
        accountId: row.id,
        userId: input.principal.userId,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
      },
    });
    return null;
  }
  private async restoreAccount(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'accounts',
      input.params.accountId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    if (before.status === 'active') return this.account(before);
    if (before.status === 'closed') throw new Error('ACCOUNT_CLOSED');
    const row = (
      await client.query<ReferenceRow>(
        `update public.accounts set status='active',deleted_at=null where id=$1 and version=$2 returning *`,
        [before.id, input.body.expectedVersion],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'account.updated',
      resourceType: 'account',
      resourceId: row.id,
      before,
      after: row,
      event: 'account.updated',
      payload: {
        accountId: row.id,
        userId: input.principal.userId,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: ['status'],
      },
    });
    return this.account(row);
  }
  private async closeAccount(client: PoolClient, input: ReferenceOperation): Promise<unknown> {
    const before = await this.locked(
      client,
      'accounts',
      input.params.accountId,
      input.principal.userId,
    );
    if (!before) throw new Error('NOT_FOUND');
    if (before.status === 'closed') return this.account(before);
    const row = (
      await client.query<ReferenceRow>(
        `update public.accounts set status='closed',closed_at=$3,deleted_at=null,is_default=false where id=$1 and version=$2 returning *`,
        [before.id, input.body.expectedVersion, input.body.closedAt],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'account.closed',
      resourceType: 'account',
      resourceId: row.id,
      before,
      after: row,
      event: 'account.closed',
      payload: {
        accountId: row.id,
        userId: input.principal.userId,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
      },
    });
    return this.account(row);
  }
  private async updateAdminReference(
    client: PoolClient,
    input: ReferenceOperation,
    target: AdminReferenceTarget,
  ): Promise<unknown> {
    const { table, key, id } = target;
    const before = (
      await client.query<ReferenceRow>(`select * from public.${table} where ${key}=$1 for update`, [
        id,
      ])
    ).rows[0];
    if (!before) throw new Error('NOT_FOUND');
    const map =
      table === 'currencies'
        ? { name: 'name', minorUnit: 'minor_unit', enabled: 'enabled' }
        : { name: 'name', defaultCurrency: 'default_currency', enabled: 'enabled' };
    const { sql, values } = this.patch(map, input.body, 2);
    const row = (
      await client.query<ReferenceRow>(
        `update public.${table} set ${sql} where ${key}=$1 and version=$2 returning *`,
        [id, input.body.expectedVersion, ...values],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'reference.updated',
      resourceType: 'reference',
      resourceId: id,
      before,
      after: row,
      event: 'reference.updated',
      payload: {
        resource: table === 'currencies' ? 'currency' : 'country',
        code: id,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: Object.keys(input.body)
          .filter((k) => !['expectedVersion', 'reason'].includes(k))
          .sort(),
      },
      reason: input.body.reason as string,
    });
    return table === 'currencies'
      ? {
          code: row.code.trim(),
          name: row.name,
          minorUnit: row.minor_unit,
          enabled: row.enabled,
          version: Number(row.version),
        }
      : {
          code: row.code.trim(),
          name: row.name,
          defaultCurrency: row.default_currency.trim(),
          enabled: row.enabled,
          version: Number(row.version),
        };
  }
  private async updateAdminCategory(
    client: PoolClient,
    input: ReferenceOperation,
  ): Promise<unknown> {
    const before = (
      await client.query<ReferenceRow>(
        'select * from public.categories where id=$1 and user_id is null for update',
        [input.params.categoryId],
      )
    ).rows[0];
    if (!before) throw new Error('NOT_FOUND');
    const map = {
      labelAr: 'label_ar',
      labelEn: 'label_en',
      icon: 'icon',
      color: 'color',
      sortOrder: 'sort_order',
      active: 'active',
    };
    const body = {
      ...input.body,
      ...('active' in input.body ? { deletedAt: input.body.active ? null : new Date() } : {}),
    };
    const { sql, values } = this.patch({ ...map, deletedAt: 'deleted_at' }, body, 2);
    const row = (
      await client.query<ReferenceRow>(
        `update public.categories set ${sql} where id=$1 and version=$2 returning *`,
        [before.id, input.body.expectedVersion, ...values],
      )
    ).rows[0];
    if (!row) throw new Error('VERSION_CONFLICT');
    await this.audit(client, input, {
      action: 'category.updated',
      resourceType: 'category',
      resourceId: row.id,
      before,
      after: row,
      event: 'category.updated',
      payload: {
        categoryId: row.id,
        kind: row.kind,
        version: Number(row.version),
        occurredAt: new Date().toISOString(),
        changedFields: Object.keys(input.body)
          .filter((k) => !['expectedVersion', 'reason'].includes(k))
          .sort(),
        systemKey: row.system_key,
      },
      reason: input.body.reason as string,
    });
    return this.category(row);
  }
  private patch(
    map: Record<string, string | undefined>,
    body: Record<string, unknown>,
    start: number,
  ): { sql: string; values: unknown[] } {
    const entries = Object.entries(map).filter(
      ([key, column]) => column !== undefined && key in body,
    ) as [string, string][];
    if (!entries.length) throw new Error('VALIDATION_FAILED');
    return {
      sql: entries.map(([, column], index) => `${column}=$${String(start + index + 1)}`).join(','),
      values: entries.map(([key]) => body[key]),
    };
  }
  private category(row: ReferenceRow): Record<string, unknown> {
    return {
      id: row.id,
      scope: row.user_id ? 'custom' : 'system',
      kind: row.kind,
      labelAr: row.label_ar,
      labelEn: row.label_en,
      icon: row.icon,
      color: row.color,
      systemKey: row.system_key,
      parentId: row.parent_id,
      mergedIntoId: row.merged_into_id,
      sortOrder: row.sort_order,
      active: row.active,
      status: row.merged_into_id ? 'merged' : row.active ? 'active' : 'archived',
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  private account(row: ReferenceRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      currency: row.currency_code.trim(),
      institutionName: row.institution_name,
      lastFour: row.last_four?.trim() ?? null,
      creditLimitMinor: row.credit_limit_minor === null ? null : Number(row.credit_limit_minor),
      isDefault: row.is_default,
      iconKey: row.icon_key,
      colorKey: row.color_key,
      notes: row.notes,
      status: row.status,
      sortOrder: row.sort_order,
      includeInTotals: row.include_in_totals,
      automaticTrackingEnabled: row.automatic_tracking_enabled,
      statementDay: row.statement_day,
      paymentDueDay: row.payment_due_day,
      monthlyInterestRateBasisPoints: row.monthly_interest_rate_basis_points,
      minimumPaymentMinor:
        row.minimum_payment_minor === null ? null : Number(row.minimum_payment_minor),
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
