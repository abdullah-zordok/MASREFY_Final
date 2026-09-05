# Internal Contracts: Reference Data, Categories & Accounts

## Request Context

Every operation receives the existing verified context:

```ts
interface ReferenceCommandContext {
  actorId: string;
  actorType: 'user' | 'admin' | 'worker';
  requestId: string;
  idempotencyKey?: string;
  permission?: 'reference.read' | 'reference.write';
  recentMfa?: boolean;
}
```

The context is server-derived. DTOs cannot set actor, permission, MFA, owner,
version, audit, event, or provider authority.

## SQL Resolver Contracts

### `private.resolve_category`

```sql
private.resolve_category(
  p_user_id text,
  p_category_id uuid,
  p_kind text
) returns public.categories
```

- Requires nonempty user, UUID, and allowed kind.
- Returns an active, nondeleted compatible system category or the user's active,
  nondeleted compatible category.
- Rejects another user's, inactive, merged, absent, or kind-incompatible row with
  a stable exception mapped to `CATEGORY_INVALID`.
- Fixed `search_path`; no client execute grant.

### `private.resolve_exchange_rate`

```sql
private.resolve_exchange_rate(
  p_base char(3),
  p_quote char(3),
  p_at timestamptz,
  p_max_age interval
) returns table (
  base_currency char(3),
  quote_currency char(3),
  rate numeric(24,12),
  effective_at timestamptz,
  provider text
)
```

- Validates uppercase enabled currency codes, nonfuture `at`, and maximum age
  between one minute and 365 days.
- Same currency returns rate 1 at `p_at`, provider `identity`, without a row.
- Otherwise returns the latest eligible row at/before `p_at` and not older than
  `p_max_age`.
- Absence raises the stable `FX_UNAVAILABLE` exception.
- Fixed `search_path`; authenticated API/server execute only.

## Guarded Mutation Transaction

Every category/account/Admin reference mutation follows one database transaction:

```text
begin
  set local request context
  assert active profile or exact Admin permission/recent authentication
  lock target and any parent/merge/default sibling rows deterministically
  assert owner, expected version, state, uniqueness, graph, and field rules
  mutate exactly one resource state (plus default sibling when required)
  audit.append_event(... before_hash, after_hash, reason, request_id, safe metadata)
  private.enqueue_outbox_event(... safe payload)
commit
```

Any assertion, audit, or outbox failure rolls back all effects. Customer account
names, category labels, notes, last four, Admin reason, and raw rate values never enter
logs, metrics labels, or outbox payloads.

## Category Graph Contract

- Parent and merge target lock order is UUID ascending.
- A recursive CTE begins at the proposed target and follows both `parent_id` or
  `merged_into_id` as appropriate.
- Reaching the source rejects with `CATEGORY_CYCLE`.
- Owner compatibility is `(both system) OR (same nonnull user)`; system rows
  cannot be merge sources.
- Kind must match for parent and merge relationships.
- Merging sets source `active=false`, `deleted_at=now()`, and
  `merged_into_id=target`. Once SPEC-BE-005 is present, it first calls the
  ledger-owned command to reclassify transaction headers and preserve immutable
  postings, revisions, audit, and outbox evidence.

## Account Default and Lifecycle Contract

- Making an active account default locks all active accounts for the owner in ID
  order, clears any prior default, then sets the target default in one transaction.
- Archiving a default account selects no replacement automatically; default
  becomes absent unless an explicit replacement was supplied in the request.
- Restore rechecks the partial unique default constraint.
- Close requires `closedAt`, clears default, and is terminal in Phase 04.
- Every currency change fails `ACCOUNT_CURRENCY_LOCKED` in Phase 04. SPEC-BE-005
  may later replace that fail-closed rule with a ledger-backed zero-posting check.

## Opening Balance Handoff

```text
openingBalanceMinor omitted or 0 -> create account normally
openingBalanceMinor nonzero and ledger command absent -> 409 LEDGER_NOT_AVAILABLE
```

After SPEC-BE-005, the public API shape stays the same and orchestration changes to
one transaction containing the account row plus the ledger-owned opening command.
Phase 04 contains no dynamic detection that could silently switch behavior.

## Pre-SPEC-BE-006 Idempotency Ceiling

- Mutation routes require an ASCII `Idempotency-Key` of 8..128 characters.
- Database constraints and state/version guards make archive/delete/restore/
  close/merge and shared-reference replacement repeatable.
- Category/account create may return a deterministic duplicate/constraint result;
  durable replay of an arbitrary original create response is not claimed.
- No in-process replay map, replay table, replay column, or audit JSON lookup is
  added. SPEC-BE-006 owns request hashing and durable response replay.

## Cache Contract

| Collection | Key | Maximum TTL | Invalidation |
|---|---|---:|---|
| currencies | `reference:currencies:{locale}:{version}` | 24 h | currency Admin event/seed drift |
| countries | `reference:countries:{locale}:{version}` | 24 h | country Admin event/seed drift |
| system categories | `reference:categories:{locale}:{kind}:{version}` | 24 h | system-category Admin event/seed drift |

- Maximum 64 entries per process; oldest entry evicted.
- ETag is derived from the canonical ordered collection payload, not payload
  secrets. Every request performs a bounded database collection-hash/version
  check before serving a process-local cached payload.
- Database failure after cache expiry returns safe unavailable; stale beyond TTL is
  not served.
- Accounts, user categories, permissions, and FX freshness are never shared
  cached.

## Stable Error Mapping

| Database/domain condition | HTTP | Code |
|---|---:|---|
| missing/invalid auth | 401 | `UNAUTHORIZED` |
| inactive profile/Admin | 403 | `PROFILE_INACTIVE` / `ADMIN_INACTIVE` |
| exact permission/recent-auth absent | 403 | `FORBIDDEN` / `RECENT_AUTH_REQUIRED` |
| resource absent/cross-owner | 404 | `NOT_FOUND` |
| invalid DTO/field/code | 400 | `VALIDATION_FAILED` |
| stale expected version | 409 | `VERSION_CONFLICT` |
| duplicate active natural key | 409 | `DUPLICATE_RESOURCE` |
| hierarchy/merge cycle | 409 | `CATEGORY_CYCLE` |
| incompatible category | 409 | `CATEGORY_INVALID` |
| category usage changed after preview | 409 | `CATEGORY_USAGE_CHANGED` |
| account currency locked | 409 | `ACCOUNT_CURRENCY_LOCKED` |
| ledger command unavailable | 409 | `LEDGER_NOT_AVAILABLE` |
| missing/stale rate | 404 | `FX_UNAVAILABLE` |
| required key absent/invalid | 400 | `IDEMPOTENCY_KEY_REQUIRED` |

All use the platform safe envelope with `requestId`.
