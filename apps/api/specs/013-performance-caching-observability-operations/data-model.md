# Data Model: Performance, Caching, Observability & Operations

**Spec**: SPEC-BE-013
**Schema**: `private` only
**Persistence clock**: UTC (`timestamptz`)
**Identifiers**: UUID primary keys unless a stable text key is the business identity

## Common Rules

- Every mutable row uses `version bigint not null default 1 check (version > 0)` and `updated_at timestamptz not null default clock_timestamp()`.
- Every JSON value is non-null, the expected JSON type, at most 20 top-level members, at most two levels deep, and at most 4 KiB unless a tighter table rule applies.
- Safe text is NFC-normalized by the application, trimmed, bounded, and rejects C0/C1 controls and bidi overrides.
- Keys and safe codes match `^[a-z][a-z0-9_.-]{2,127}$` unless a narrower rule is specified.
- No owned column stores a secret, token, credential, provider response, stack trace, SQL, URL, personal datum, financial amount/detail, arbitrary payload, or backup content.
- All tables are owned by `masarifi_migration`, have RLS enabled and forced, and revoke all default/client grants. Access is through explicit functions only.

## Enums

Database check constraints are preferred over standalone enum types so additive forward corrections remain simple.

- Job run status: `queued`, `running`, `succeeded`, `failed`, `retrying`, `dead_lettered`, `canceled`.
- Attempt status: `running`, `succeeded`, `failed`.
- Provider status: `up`, `degraded`, `down`, `unknown`.
- Incident severity: `info`, `warning`, `critical`.
- Incident status: `open`, `investigating`, `monitoring`, `resolved`.
- Setting sensitivity: `public`, `internal`, `restricted`.
- Flag status: `draft`, `active`, `retired`.
- Maintenance status: `scheduled`, `active`, `completed`, `canceled`.

## `private.scheduled_jobs`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | immutable identity |
| `job_key` | `text` | unique, not null | stable key, max 128 |
| `owner_spec` | `smallint` | not null | one of 1..11 or 13; 12 forbidden |
| `job_type` | `text` | not null | fixed registered handler type, max 80 |
| `schedule` | `jsonb` | nullable | exact interval schedule contract |
| `enabled` | `boolean` | default true | disabled rows are never claimed |
| `timeout_seconds` | `integer` | not null | 1..600 |
| `max_attempts` | `smallint` | not null | 1..10 |
| `configuration` | `jsonb` | default `{}` | flat allowlisted safe values, <=2 KiB |
| `retry_safe` | `boolean` | default false | handler declaration, cannot silently broaden |
| `cancel_safe` | `boolean` | default false | handler declaration, cannot silently broaden |
| `next_run_at` | `timestamptz` | nullable | required when enabled schedule exists |
| `last_registered_at` | `timestamptz` | not null | registration evidence |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | mutation time |
| `version` | `bigint` | default 1 | optimistic version |

Schedule contract:

```json
{ "kind": "interval", "everySeconds": 60, "timezone": "UTC" }
```

`kind`, `everySeconds`, and `timezone` are the only keys. `everySeconds` is 10..2,678,400. `timezone` is exactly `UTC`. A null schedule means the job is inventory/manual/internal-event driven and has no `next_run_at`.

Indexes:

- unique `scheduled_jobs_job_key_uq(job_key)`;
- `scheduled_jobs_owner_idx(owner_spec, job_key)`;
- partial due index `scheduled_jobs_due_idx(next_run_at, job_key) where enabled and schedule is not null`;
- `scheduled_jobs_type_idx(job_type, enabled, job_key)`.

## `private.job_runs`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | run identity |
| `scheduled_job_id` | `uuid` | nullable FK | `scheduled_jobs(id)`; retain history on job disable |
| `job_key` | `text` | not null | immutable snapshot |
| `job_type` | `text` | not null | immutable snapshot |
| `owner_spec` | `smallint` | not null | 1..11 or 13 |
| `status` | `text` | default `queued` | run status constraint |
| `queued_at` | `timestamptz` | not null | due/queue time |
| `started_at` | `timestamptz` | nullable | required when running/final |
| `completed_at` | `timestamptz` | nullable | required only for final status |
| `correlation_id` | `text` | not null | 1..128 safe opaque value |
| `result_summary` | `jsonb` | default `{}` | flat allowlisted safe metadata <=2 KiB |
| `cancel_requested_at` | `timestamptz` | nullable | set only for cancel-safe active work |
| `retry_of_run_id` | `uuid` | nullable FK self | explicit Admin/system retry lineage |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | lifecycle time |
| `version` | `bigint` | default 1 | optimistic version |

State rules:

- `queued -> running | canceled`;
- `running -> succeeded | failed | retrying | dead_lettered`;
- `retrying -> running | dead_lettered | canceled`;
- all final states are terminal;
- completion is not before start; start is not before queue;
- retry lineage must use the same job key and owner.

Indexes:

- `job_runs_status_time_idx(status, queued_at, id)`;
- `job_runs_job_time_idx(job_key, queued_at desc, id desc)`;
- `job_runs_correlation_idx(correlation_id, queued_at desc)`;
- `job_runs_scheduled_idx(scheduled_job_id, queued_at desc)`;
- partial `job_runs_active_uq(scheduled_job_id) where status in ('queued','running','retrying')` to prevent duplicate active schedule execution.

## `private.job_attempts`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | attempt identity |
| `run_id` | `uuid` | not null FK | `job_runs(id)` on delete restrict |
| `attempt_no` | `smallint` | not null | positive, <=10 |
| `worker_id` | `text` | not null | safe 1..128, never a metric label |
| `status` | `text` | default `running` | attempt status constraint |
| `started_at` | `timestamptz` | not null | start time |
| `completed_at` | `timestamptz` | nullable | required for final attempt |
| `safe_error_code` | `text` | nullable | uppercase safe code <=80 |
| `next_attempt_at` | `timestamptz` | nullable | present only after retryable failure |
| `created_at` | `timestamptz` | not null | immutable |

Constraints/indexes:

- unique `job_attempts_run_number_uq(run_id, attempt_no)`;
- `job_attempts_retry_idx(next_attempt_at, run_id) where status='failed' and next_attempt_at is not null`;
- `job_attempts_running_idx(started_at, run_id) where status='running'`;
- completion and error/timing consistency checks.

Attempts are append-only apart from the single transition from running to succeeded/failed. A trigger rejects changes to identity, run, number, worker, or start time and rejects updates after finalization.

## `private.provider_health_checks`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | check identity |
| `provider_key` | `text` | not null | one of `database`, `storage`, `identity`, `ai`, `email`, `push` |
| `check_type` | `text` | not null | fixed shallow check key <=80 |
| `status` | `text` | not null | provider status constraint |
| `latency_ms` | `integer` | not null | 0..60,000 |
| `checked_at` | `timestamptz` | not null | observation time |
| `safe_error_code` | `text` | nullable | uppercase safe code <=80 |

Indexes:

- `provider_checks_key_time_idx(provider_key, checked_at desc, id desc)`;
- `provider_checks_status_time_idx(status, checked_at desc, id desc)`.

Rows are append-only. Retention keeps the minimum needed for the longest supported 30-day bounded series plus an operational margin.

## `private.system_incidents`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | incident identity |
| `title` | `text` | not null | safe 5..160 |
| `severity` | `text` | not null | info/warning/critical |
| `status` | `text` | default `open` | incident lifecycle |
| `started_at` | `timestamptz` | not null | start time |
| `resolved_at` | `timestamptz` | nullable | only resolved; >= start |
| `public_summary` | `text` | nullable | safe <=500, no internal error |
| `assigned_admin_id` | `text` | nullable FK | active Admin profile identifier |
| `created_by_admin_id` | `text` | not null FK | immutable creator |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | lifecycle time |
| `version` | `bigint` | default 1 | optimistic version |

State rules: `open -> investigating -> monitoring -> resolved`; `open -> resolved` is permitted for immediately corrected false alarms; resolved is terminal. Reopening creates a new incident.

Indexes:

- `system_incidents_status_time_idx(status, started_at desc, id desc)`;
- `system_incidents_severity_time_idx(severity, started_at desc, id desc)`;
- partial `system_incidents_open_idx(started_at desc, id desc) where status <> 'resolved'`.

## `private.system_settings`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `setting_key` | `text` | PK | stable allowlisted key <=128 |
| `value` | `jsonb` | not null | per-key schema; <=4 KiB |
| `sensitivity` | `text` | not null | public/internal/restricted |
| `updated_by_admin_id` | `text` | nullable FK | null only for system seed |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | mutation time |
| `version` | `bigint` | default 1 | optimistic version |

Initial keys:

- `operations.ai.allowance`: public integer exactly 5 for this release;
- `operations.history.retention_days`: internal integer 30..365, default 90;
- `operations.provider.timeout_ms`: internal integer 100..10,000, default 2,000;
- `operations.performance.series_limit`: internal integer 24..720, default 720;
- `operations.backup.status`: restricted metadata object updated only by the backup verification job;
- `operations.restore.status`: restricted metadata object updated only by restore/DR jobs.

No key contains `secret`, `token`, `password`, `credential`, `privateKey`, `connection`, `url`, `sql`, `command`, or equivalent normalized variants. Audit stores hashes and safe metadata, never restricted values.

Indexes: sensitivity/key index is optional because the PK and small cardinality cover reads; no speculative index is added.

## `private.feature_flags`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | flag identity |
| `flag_key` | `text` | unique, not null | `^[a-z][a-z0-9.-]{2,79}$` |
| `description` | `text` | not null | safe 10..240 |
| `default_enabled` | `boolean` | default false | fail-safe default |
| `status` | `text` | default `draft` | draft/active/retired |
| `created_by_admin_id` | `text` | not null FK | creator |
| `updated_by_admin_id` | `text` | not null FK | updater |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | lifecycle time |
| `version` | `bigint` | default 1 | evaluation version |

Security-invariant denylist covers normalized keys containing auth, permission, role, rls, audit, idempotency, ledger-integrity, webhook-validation, encryption, release-gate, billing, payment, subscription, entitlement, checkout, promotion, or stripe concepts.

Indexes:

- unique `feature_flags_key_uq(flag_key)`;
- `feature_flags_status_key_idx(status, flag_key)`.

## `private.feature_flag_rules`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | rule identity |
| `feature_flag_id` | `uuid` | not null FK | cascade only when draft flag is deleted |
| `priority` | `smallint` | not null | 1..1000, lower wins |
| `audience` | `jsonb` | not null | exact bounded predicate object <=1 KiB |
| `enabled` | `boolean` | default true | inactive rules ignored |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | mutation time |
| `version` | `bigint` | default 1 | optimistic version |

Audience fields are optional exact values/arrays for `platform` (`ios`, `android`, `admin`), `locale` (`ar`, `en`), `appVersion` (safe semantic version prefix), and `cohort` (one of an allowlisted server-derived cohort keys). At least one predicate is required; unknown/nested/identifier/role/plan/entitlement fields are rejected.

Indexes/constraints:

- unique `feature_flag_rules_priority_uq(feature_flag_id, priority)`;
- `feature_flag_rules_eval_idx(feature_flag_id, enabled, priority)`.

## `private.maintenance_windows`

| Column | Type | Null/default | Rules |
|---|---|---|---|
| `id` | `uuid` | PK, generated | window identity |
| `starts_at` | `timestamptz` | not null | start |
| `ends_at` | `timestamptz` | not null | > start, maximum 24 hours |
| `scope` | `text[]` | not null | 1..10 unique allowlisted scopes |
| `public_message` | `jsonb` | not null | exact `{ar,en}`, each 1..240 safe chars |
| `status` | `text` | default `scheduled` | lifecycle |
| `created_by_admin_id` | `text` | not null FK | creator |
| `updated_by_admin_id` | `text` | not null FK | updater |
| `created_at` | `timestamptz` | not null | immutable |
| `updated_at` | `timestamptz` | not null | lifecycle time |
| `version` | `bigint` | default 1 | optimistic version |

Allowed scopes: `api`, `database`, `storage`, `identity`, `ai`, `email`, `push`, `imports`, `reports`, `notifications`. `billing` and any paid scope are forbidden.

State rules:

- `scheduled -> active | canceled`;
- `active -> completed`;
- completed/canceled are terminal;
- global overlap is not applicable because there is no `global` scope; overlapping same scopes are rejected to keep the public projection deterministic.

Indexes:

- `maintenance_status_time_idx(status, starts_at, ends_at, id)`;
- GIN on `scope` only if the production-like plan test shows the status/time index plus bounded rows is insufficient; otherwise skipped.

## Authoritative Functions

### `private.register_job(...)`

Inputs: key, owner spec, type, schedule, enabled, timeout, maximum attempts, configuration, retry/cancel safety. Validates all fields and owner allowlist. Inserts on first registration. On conflict, locks the row and permits only same-owner compatible re-registration. Ownership and job type never change; safety can be narrowed without a separate audited Admin operation but not broadened silently. Returns ID, key, owner, version, and created/updated outcome.

### `private.claim_due_jobs(worker_id, limit, now)`

Worker-only. Validates worker and limit (1..100), selects due enabled schedules in stable order with `FOR UPDATE SKIP LOCKED`, advances `next_run_at` from the greater of its current due time or supplied clock, creates one queued/running run and attempt, and returns dispatch metadata. Unique active constraints close race gaps.

### `private.complete_job_attempt(...)`

Worker-only. Locks attempt/run, validates worker and active state, finalizes success or safe failure, calculates bounded exponential retry from stored attempts, creates the next attempt only when due through the claim path, and transitions exhausted work to dead letter. Result metadata is flat and allowlisted.

### `private.request_job_action(...)`

API-only. Accepts run, action `retry|cancel`, expected version, actor, reason, request ID, and idempotency hash. Validates declared safety and lifecycle, uses the existing idempotency bridge, mutates atomically, and appends an immutable audit event. It never accepts a payload or job type.

### `private.evaluate_feature_flag(key, user_context)`

API/worker. Validates the exact closed context schema, locks nothing, loads the active flag and enabled rules in ascending priority, returns the first match or default. Unknown/retired/invalid context returns a disabled fail-safe result. Output: key, enabled, version, source (`rule|default|missing|retired|invalid_context`) without rule contents.

### Operational mutations

Functions create/update/transition incidents, settings, flags/rules, and maintenance with exact field allowlists, expected version, actor, reason, request ID, and audit hashes. Restricted setting reads return metadata plus `redacted=true` and no value.

## Audit Model

All Admin mutations append to existing `audit.audit_events` with:

- actor: Admin identifier;
- action: fixed Phase 13 event name;
- resource type and identifier;
- before/after SHA-256 hashes where a value changed;
- bounded reason and request ID;
- flat safe metadata: status, version, job key, setting key, or flag key only.

No audit metadata stores values, audience definitions, provider errors, or backup details.

## Retention

- Job runs and attempts: 90 days by default, configurable 30..365; dead letters and audit-linked records retain at least 90 days.
- Provider health checks: 35 days.
- Incidents, settings, flags, maintenance, and audit: retained; lifecycle rows are retired/resolved/completed rather than deleted.
- Retention operates in batches of at most 1,000 rows and records only deleted counts and cutoff time.

## Projection Rules

- Admin projections are bounded and permission filtered. They include safe identifiers needed for actions but no payload/value forbidden by sensitivity.
- Mobile projection is synthesized from active maintenance plus evaluated safe flags and fixed Free-only capabilities; it never reads operational tables directly.
- Performance/recovery projections aggregate safe metadata and never return raw query text, cache keys, evidence paths containing secrets, or backup contents.

## Migration Order

1. Types-as-checks, tables, constraints, indexes, append-only/version triggers.
2. Registration, claims, completion, evaluation, and mutation/read functions.
3. RLS/grants, exact operations permissions, role mappings, and negative-access policies.
4. Safe initial settings/flags and job registrations for Specs 001-011 and 013.
5. Checksum manifest update and migration upgrade/forward-correction evidence.

No prior migration is edited.
