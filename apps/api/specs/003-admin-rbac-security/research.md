# Phase 0 Research: Admin RBAC, RLS, Audit & Security Foundation

**Phase / Spec**: Phase 03 / SPEC-BE-003
**Date**: 2026-08-29
**Baseline**: `main` at `ecaa54a7291d8cd06b0e44e871a84790a19f3d4c`

## Decision 1: Extend the Existing Modular Monolith

**Decision**: Add one cohesive `security` module to the existing NestJS API and
worker. Reuse `ClerkAuthGuard`, `PoolService`, the API/worker entry points, safe
HTTP errors, OpenAPI composition, observability, PostgreSQL roles, the version
trigger, and `private.enqueue_outbox_event`.

**Rationale**: These are the established SPEC-BE-001/002 seams. One module keeps
authorization, audit, support, incident, and privacy orchestration together without
creating services or internal network trust boundaries.

**Alternatives rejected**: Separate RBAC/audit/privacy microservices, Prisma,
Supabase Edge Functions, Redis, and a policy-engine dependency add deployment or
authorization paths forbidden by the Constitution and Master Plan.

## Decision 2: Clerk Authenticates; PostgreSQL Authorizes

**Decision**: Continue using the existing official Clerk verifier. An Admin request
first proves an active Clerk session and active SPEC-BE-002 profile, then starts a
database transaction with the verified subject and calls
`private.assert_admin_permission(exact_key)`. Sensitive commands additionally
require `factorAgeSeconds <= MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS`; missing factor
evidence denies.

**Rationale**: The current guard already exposes immutable subject, session, and
factor age. Database rows are the only authoritative source for Admin status,
assignments, roles, and exact permissions.

**Alternatives rejected**: Clerk metadata, client role headers/query values,
Admin mock state, wildcard permissions, and client confirmation tokens are not
authorization evidence.

## Decision 3: Exact SQL Permission Evaluation, No Shared Cache

**Decision**: Implement `private.admin_has_permission(admin_id, permission_key,
at)` as one indexed `EXISTS` query across active profile, active Admin profile,
time-valid assignment, enabled role, role mapping, and exact permission key.
`private.assert_admin_permission` resolves the verified subject from transaction-
local claims and raises one stable denial. Any reuse is confined to one database
transaction/request snapshot.

**Rationale**: A single query is easier to prove fail-closed and can meet the 25 ms
P95 target with the specified indexes. Immediate revocation matters more than a
small cache hit.

**Alternatives rejected**: Cross-request caches, permission bitsets in tokens,
role-name authorization, and wildcard matching can remain stale or broaden access.

## Decision 4: Freeze a Server Permission Manifest with Explicit Aliases

**Decision**: Record the 151 client keys found at the base revision in a server
manifest, normalize the ten Phase 03 aliases from the specification to canonical
keys, seed seven system roles deterministically, and fail contract tests if the
client manifest has a missing, duplicate, unmapped, or unexpected key. Runtime code
does not import Admin source.

**Rationale**: The backend needs an immutable release artifact. A test-time parser
can compare the current Admin arrays without turning client code into production
authority.

**Alternatives rejected**: Reading TypeScript client files at runtime, duplicating
two live role systems, silently accepting unknown permissions, or mutable seed
scripts.

## Decision 5: Guarded SQL Commands Own Privileged Atomicity

**Decision**: Service methods use parameterized SQL in one transaction, call the
exact permission assertion, lock affected rows in deterministic order, enforce
versions and invariants, call `audit.append_event`, enqueue the outbox event, and
commit. Audit failure rolls back the state change. Generic table CRUD and dynamic
SQL are absent.

**Rationale**: The database is the shortest shared enforcement point for API and
worker callers and preserves mutation/audit/outbox atomicity.

**Alternatives rejected**: Controller-only authorization, post-commit audit writes,
ORM hooks, and audit-by-log cannot prove atomic or immutable evidence.

## Decision 6: Phase 03 Idempotency Uses Owned Natural Keys Until SPEC-BE-006

**Decision**: Every mutation validates a bounded `Idempotency-Key`. Phase 03 does
not create a second generic replay table: SPEC-BE-006 owns
`private.idempotency_keys`. Before that migration exists, commands obtain natural
repeatability from unique active invitation/assignment/grant/export/deletion/hold
constraints, state/version guards, and identical terminal responses. Privacy
export and deletion creation return the existing active request. A key reused for
a different body during the same in-flight process is rejected; durable arbitrary
response replay becomes available only after SPEC-BE-006.

**Rationale**: This satisfies current safe retry behavior without stealing a later
Spec's exclusive table. No Phase 03 command may claim durable cross-process replay
that it cannot prove.

**Alternatives rejected**: A second idempotency table, hiding keys in audit JSON,
or per-resource replay columns would conflict with SPEC-BE-006 and complicate
schema ownership.

## Decision 7: Invitation Delivery Reuses Clerk and a Local Token Hash

**Decision**: Generate a cryptographically random token with Node `crypto` and pass
a one-use acceptance URL to Clerk's invitation delivery through the existing
backend SDK. After Clerk accepts delivery, reauthorize and persist only the token
hash in the guarded invitation transaction. Add an authenticated acceptance
command that matches the token hash and the Clerk-verified primary email, marks the
invite accepted, creates/activates the Admin profile, and assigns the invited role
in one audited transaction. The raw token exists only in memory long enough to
construct the Clerk redirect and is never returned or logged. If the post-provider
database transaction fails, the emailed link is harmless because no matching hash
exists; a retry sends a fresh token and records a safe orphan-delivery metric.

**Rationale**: Clerk already owns identity and email verification. Local hashing
keeps authorization and role assignment under database control without adding an
email provider or token store.

**Alternatives rejected**: Returning the token to an inviter, storing plaintext,
trusting email from request input, or waiting for the later communications Spec.

## Decision 8: Support Scope Is a Closed Vocabulary

**Decision**: Store support scope as a JSON array of unique `{resource, actions}`
entries. Both DTO validation and SQL checks restrict current resources to
`profile-contact`, `account-status`, `device-diagnostics`, `session-diagnostics`,
`subscription-summary`, and `import-summary`, with a small action allowlist. An
approval must be a subset and every use calls `private.assert_support_grant` in the
same transaction as the registered masked projection.

**Rationale**: JSON supports later additive domain registration while closed
validation prevents arbitrary table/resource access. The current client duration
is 5–60 minutes; the database retains the absolute 24-hour ceiling.

**Alternatives rejected**: SQL fragments in scope, table names supplied by clients,
generic data browsers, blanket customer access, and financial mutation.

## Decision 9: Privacy Orchestration Uses Versioned In-Process Handlers

**Decision**: Define one typed registry contract for export, deletion, and
retention handlers. Each resource owner registers a unique name and schema version;
the worker sorts handlers by name, requires the expected set, records one evidence
timestamp, and fails closed on missing/duplicate handlers. Phase 03 adds the narrow
SPEC-BE-002 identity handler needed for the currently deployed identity data.

**Rationale**: Later domain Specs need one extension seam, but no registry table or
service is needed in a modular monolith. Deterministic order and per-handler
completion evidence make retries reconcilable.

**Alternatives rejected**: Dynamic SQL over table names, service discovery,
plugin loading, or silently exporting/deleting only the handlers that happen to be
available.

## Decision 10: Stream a ZIP with One Focused Dependency

**Decision**: Add one maintained streaming ZIP dependency (`archiver`) because the
current Admin contract requires `.zip` and `application/zip`, while Node's standard
library supplies compression primitives but not a safe ZIP container writer.
Each handler emits bounded JSON/JSONL entries; the worker streams files plus a
versioned manifest and SHA-256 checksums without buffering the full archive.

**Rationale**: One focused dependency is smaller and safer than implementing ZIP
headers, CRC, ZIP64, and stream error handling locally. Archive size, entry count,
entry paths, and output duration remain bounded; executable/path-traversal entries
are forbidden.

**Alternatives rejected**: Loading all data in memory, inventing ZIP code, shelling
out to an OS binary, or returning an incompatible media type.

## Decision 11: Use Supabase Storage REST with Native `fetch`

**Decision**: Use Node 24 `fetch` for upload, signed-download creation, and deletion
against the existing private `report-exports` bucket. Add only process-scoped
Supabase URL/service-role secret configuration: the worker can upload/delete, the
API can create a short-lived signed URL after owner/recent-auth recheck, and the
migration process receives neither secret.

**Rationale**: The bucket already exists and the required calls are small. Native
`fetch` avoids adding the full Supabase client solely for three Storage requests.

**Alternatives rejected**: Public objects, persistent URLs, browser service keys,
database bytea storage, local disk, or a new object-store abstraction.

## Decision 12: One Bounded Security Worker

**Decision**: Extend the current worker with one `SecurityWorker` that runs bounded
claims for export generation, deletion execution, retention, support-grant expiry,
and security-alert publication. It reuses PostgreSQL `FOR UPDATE SKIP LOCKED`, the
outbox, existing retry policy, safe metrics, and the current graceful-shutdown
lifecycle. Each cycle does a small fixed batch and yields.

**Rationale**: There is one worker runtime and no scheduler/queue product dedicated
to these jobs. Bounded database claims survive multiple worker replicas and
crashes.

**Alternatives rejected**: Five processes, cron-created infrastructure, Redis,
long unbounded scans, or acknowledging work before durable state.

> ponytail: one polling worker serializes the five low-volume Phase 03 queues;
> split schedulers only if production backlog or connection evidence breaches the
> documented latency/age thresholds.

## Decision 13: Security Evidence Is Immutable Data, Not Logs

**Decision**: Store redacted `security_events`, `audit.audit_events`, and incident
timeline rows with no runtime update/delete privilege. Hash raw IP input before
insert with a rotating server-side HMAC key; bound and allowlist metadata; expose
only explicit owner/Admin projections. Logs and metric labels contain safe codes
and opaque IDs, never raw evidence.

**Rationale**: Immutable database evidence supports investigation and survives
alert-delivery failure without leaking sensitive data into telemetry.

**Alternatives rejected**: Audit-only application logs, raw IP/user-agent capture,
mutable history, JSON blobs without allowlists, or provider payload retention.

## Decision 14: Additive Release and Forward-Only Recovery

**Decision**: Create ordered additive migrations after the existing
`20260827001300` migration, update checksums, prove clean apply/restore, bootstrap
the first super-admin through an owner-approved one-off command, and keep Admin
routes disabled until continuity and drift checks pass. Rollback first disables
routes/jobs, then uses an N-1-compatible image and forward corrective SQL; history
is never dropped.

**Rationale**: This follows the current repository's immutable migration and
container release model while protecting last-super-admin and audit continuity.

**Alternatives rejected**: Rewriting applied SQL, destructive rollback, automatic
fixture bootstrap, or enabling routes before verified authorization exists.

## Resolved Unknowns

- No `NEEDS CLARIFICATION` remains in the plan.
- Retention days, legal bases, cooling-off duration, export retention, signed-URL
  duration, and initial super-admin identity remain deployment-approved values;
  production enablement is blocked until their owners approve them.
- Client source remains unchanged. Contract mapping and drift tests are evidence
  inputs for SPEC-BE-014, not production authorization.
