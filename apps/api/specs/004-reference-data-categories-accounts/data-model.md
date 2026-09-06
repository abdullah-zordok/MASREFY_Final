# Data Model: Reference Data, Categories & Accounts

## Shared Rules

- Mutable UUID entities use the existing UUID/timestamps/version trigger pattern.
- Codes are uppercase ASCII natural keys and immutable after creation.
- All tables enable and force RLS; default grants are revoked first.
- Names/labels are trimmed, nonempty, bounded, and reject control/bidi-control text.
- Soft deletion preserves foreign-key history.
- Every user/Admin mutation is version-aware and resource/audit/outbox atomic.

## `public.currencies`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `code` | `char(3)` | PK | `^[A-Z]{3}$`, immutable |
| `name` | `text` | required | 1..100 characters |
| `minor_unit` | `smallint` | required | 0..4 |
| `enabled` | `boolean` | `true` | customer reads only enabled |
| `created_at` | `timestamptz` | `now()` | server-controlled |
| `updated_at` | `timestamptz` | `now()` | version trigger |
| `version` | `bigint` | `1` | positive, server-controlled |

Index: `(enabled, code)`. Referenced codes are disabled, not deleted.

## `public.supported_countries`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `code` | `char(2)` | PK | `^[A-Z]{2}$`, immutable |
| `name` | `text` | required | 1..100 characters |
| `default_currency` | `char(3)` | required FK currencies | enabled at seed/command time |
| `enabled` | `boolean` | `true` | customer reads only enabled |
| `created_at`, `updated_at`, `version` | shared | required | version trigger |

Index: `(enabled, code)`.

## `public.categories`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK/generated | immutable |
| `user_id` | `text` | nullable FK profiles | null means system; immutable |
| `parent_id` | `uuid` | nullable self FK | compatible owner/kind; acyclic |
| `merged_into_id` | `uuid` | nullable self FK | user row only; compatible owner/kind; acyclic |
| `kind` | `text` | required | `income|expense|transfer` |
| `label_ar` | `text` | required | 1..100 characters |
| `label_en` | `text` | required | 1..100 characters |
| `icon` | `text` | nullable | <=64 safe key |
| `color` | `text` | nullable | <=32 safe key/value |
| `system_key` | `text` | nullable | required only for system rows; lowercase key |
| `sort_order` | `integer` | `0` | -100000..100000 |
| `active` | `boolean` | `true` | false when deleted/merged |
| `deleted_at` | `timestamptz` | nullable | set for archive/merge source |
| `created_at`, `updated_at`, `version` | shared | required | version trigger |

Indexes/uniqueness:

- unique `system_key` where `user_id is null`;
- unique `(user_id, lower(label_ar), kind)` where active and not deleted;
- unique `(user_id, lower(label_en), kind)` where active and not deleted;
- `(user_id, kind, active, sort_order, id)`;
- `parent_id` and `merged_into_id`.

State transitions:

```text
active -> archived -> active
active|archived -> merged (terminal as a source)
system -> enabled|disabled only through Admin shared-reference command
```

## `public.accounts`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK/generated | immutable |
| `user_id` | `text` | required FK profiles | immutable owner |
| `name` | `text` | required | 1..100 characters |
| `type` | `text` | required | current seven-value Mobile allowlist |
| `currency_code` | `char(3)` | required FK currencies | enabled on create; all Phase 04 updates locked |
| `institution_name` | `text` | nullable | <=100 characters |
| `last_four` | `char(4)` | nullable | exactly ASCII digits; never full identifier |
| `credit_limit_minor` | `bigint` | nullable | >=0 and credit-card only; JS-safe at API |
| `is_default` | `boolean` | `false` | one active default per user |
| `icon_key` | `text` | nullable | <=64 safe key |
| `color_key` | `text` | nullable | <=32 safe key |
| `notes` | `text` | nullable | <=500 private characters |
| `status` | `text` | `active` | `active|archived|closed` |
| `sort_order` | `integer` | `0` | bounded |
| `include_in_totals` | `boolean` | `true` | projection input only |
| `opened_at` | `date` | nullable | <= closed date |
| `closed_at` | `date` | nullable | required for closed |
| `deleted_at` | `timestamptz` | nullable | archive timestamp |
| `created_at`, `updated_at`, `version` | shared | required | version trigger |

Indexes/uniqueness:

- unique `(user_id)` where `is_default and status='active' and deleted_at is null`;
  zero active defaults is valid;
- `(user_id, status, sort_order, id)`;
- `(user_id, currency_code)`;
- active partial `(user_id, sort_order, id)`.

State transitions:

```text
active -> archived -> active
active|archived -> closed
closed -> terminal in Phase 04
```

There is no `balance` or `opening_balance` column.

## `public.exchange_rates`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK/generated | immutable |
| `base_currency` | `char(3)` | required FK currencies | different from quote |
| `quote_currency` | `char(3)` | required FK currencies | different from base |
| `rate` | `numeric(24,12)` | required | >0 and not `NaN` |
| `effective_at` | `timestamptz` | required | bounded Admin/provider input |
| `provider` | `text` | required | 1..64 safe key |
| `provider_ref` | `text` | nullable | <=200 safe reference |
| `created_at` | `timestamptz` | `now()` | immutable row |

Unique `(base_currency, quote_currency, effective_at, provider)`; lookup index
`(base_currency, quote_currency, effective_at desc, provider, id)` provides a
deterministic tie-breaker. Every persisted row is approved by its guarded
Admin/worker insertion authority; there is no customer write path.

## Preference FK Correction

After reference seed/backfill verification:

```text
user_preferences.default_currency
  -> currencies.code ON UPDATE RESTRICT ON DELETE RESTRICT
```

Deploy the application validation/reference reads before the FK release. Then add
the FK as `NOT VALID`, verify zero invalid rows, and `VALIDATE CONSTRAINT`; this
preserves N-1 compatibility instead of tightening the old regex-only writer during
the same traffic transition.

## Deterministic Seed Manifest

- Currencies: `EGP`, `USD`, `EUR`, `GBP`, `AED`, `SAR`, `OMR`, `KWD`, `QAR`,
  `BHD`, `JOD`, and `JPY`, with the executable Mobile minor units.
- Countries: `EG`, `US`, `GB`, `AE`, `SA`, `OM`, `KW`, `QA`, `BH`, `JO`, and
  `JP`, mapped to enabled default currencies. No non-ISO EUR pseudo-country.
- System categories: the 19 keys in Mobile `defaultCategorySeeds`; kind mapping is
  explicit (`salary`, `other-income` -> income; `transfers` -> transfer; remaining
  keys -> expense).
- System-category UUID is deterministic from `system_key`.
- Permission seed adds backend-only `reference.read` and `reference.write` without
  changing `CLIENT_PERMISSION_KEYS`; Super Admin receives both and Security
  Administrator receives read only.

## Authorization Matrix

| Resource | Anonymous | Authenticated customer | Owner | Admin read | Admin write | Worker |
|---|---|---|---|---|---|---|
| enabled currencies/countries | deny | select | same | exact permission | exact permission+MFA | seed verify |
| system categories | deny | active select | N/A | exact permission | exact permission+MFA | seed verify |
| user categories | deny | own select only | guarded CRUD | denied unless separately owner-safe | no support mutation | deny |
| accounts | deny | own select only | guarded CRUD | denied in Phase 04 | deny | deny |
| exchange rates | deny | select through resolver/API | same | exact permission | insert/disable metadata | narrow insert |

Admin support access does not grant financial account/category mutation.

## Owned Functions and Guards

- `private.resolve_category(text,uuid,text)` returns one compatible active row.
- `private.resolve_exchange_rate(char(3),char(3),timestamptz,interval)` returns one
  immutable row or raises `FX_UNAVAILABLE`.
- Category graph guard uses recursive traversal and owner/kind checks.
- Account guard enforces default uniqueness/lifecycle and rejects every currency
  update until SPEC-BE-005 supplies the posting predicate; no speculative posting
  function is created.
- Existing `audit.append_event`, `private.enqueue_outbox_event`, Admin permission,
  active-profile, and version trigger functions are consumed unchanged.

## Migration and Recovery Invariants

- Migrations are additive, ordered, checksum-verifiable, and replayed from clean
  state in tests.
- Every constraint/policy/function/grant/seed has pgTAP evidence.
- Failure before route enablement is safe. Previous image ignores additive tables.
- Rollback never deletes referenced currency/category/account/rate history; use a
  forward correction and reconcile row/policy/seed counts.

## Category Usage Projection

`private.get_category_usage(text,uuid)` is a security-definer projection, not a
stored counter. It validates the caller/owner, takes the existing owner ledger
lock, locks the custom category row, and counts owner transaction headers at
request time. No denormalized usage column or client-authoritative count exists.

## Account Automatic-Tracking Flag

`public.accounts.automatic_tracking_enabled boolean not null default true` is
owner-controlled through the existing account API. The default preserves old
accounts/clients; effective eligibility is still decided by SPEC-BE-008 using
global consent, ownership, lifecycle, supported type, and this flag together.

## Credit-Card Terms

`public.accounts` adds four nullable card-only columns:

| Column | Type | Rule |
|---|---|---|
| `statement_day` | `smallint` | null or 1..28 |
| `payment_due_day` | `smallint` | null or 1..28 |
| `monthly_interest_rate_basis_points` | `integer` | null or 0..10,000 monthly bps |
| `minimum_payment_minor` | `bigint` | null or 1..9,007,199,254,740,991 minor units |

A table constraint permits non-null values only when `type='credit_card'`. A
before-update trigger clears these values and `credit_limit_minor` when a card
changes to a non-card type, so stale incompatible financial metadata cannot
survive the transition.

The payoff projection is stateless. Each month it computes half-up-rounded
interest as `(balance_minor * monthly_bps + 5000) / 10000`, applies the explicit
payment, and returns either payoff totals or a non-payoff reason. It never uses
floating point and stops after 1,200 months.
