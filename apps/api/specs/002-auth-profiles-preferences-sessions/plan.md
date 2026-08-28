# Implementation Plan: Authentication, Profiles, Preferences & Sessions

**Phase / Spec**: Phase 02 / SPEC-BE-002
**Branch**: `main`
**Base Revision**: `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`
**Date**: 2026-08-28
**Status**: Implementation in progress on `main`; baseline gate cleared
**Spec**: [spec.md](spec.md)
**Input**: SPEC-BE-002 specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Implement one Clerk trust boundary for the NestJS API, keep Clerk as the sole
identity/session authority, and store only Masarifi-owned profile, preference,
onboarding, device, protected push-token, and webhook synchronization state in
Supabase PostgreSQL. Protected API requests use the official Clerk backend SDK,
then establish transaction-local verified claims for forced RLS on direct `pg`
queries. Clerk webhooks are verified from raw bytes, inserted once into a private
inbox, and reconciled asynchronously against current Clerk state. All state events
reuse SPEC-BE-001's outbox.

The implementation adds one identity module and one official provider dependency.
It reuses Node `crypto`, the current PostgreSQL pool, shared configuration/error/
OpenAPI/observability boundaries, API/worker entry points, database roles, version
trigger, outbox, test projects, container, and CI. It adds no ORM, Supabase client,
Redis, cache, service, session table, auth-user mirror, idempotency table, queue,
view, or client cutover.

## Implementation Gate

Cleared on 2026-08-28. SPEC-BE-001 and the approved SPEC-BE-002 artifacts are on
`main` at `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`; no new worktree was
created and unrelated `.agents/plugins` content remains untracked and untouched.
Source, migration, pgTAP, Docker, CI, role, outbox, and client-contract paths were
rechecked. The repository has templates but no
`check-prerequisites.ps1`, so prerequisite discovery remains a documented manual
fallback and does not alter the implementation contract.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js `>=24 <25`
**Framework**: NestJS 11 with Express adapter and separate API/worker entry points
**Primary Dependencies**: existing NestJS/`pg`/Joi/class-validator/Swagger/OTel;
add current compatible `@clerk/backend` only; Node `crypto` for push protection
**Storage**: Supabase PostgreSQL public owner tables, private Clerk inbox, existing
SPEC-BE-001 roles/version trigger/outbox/PGMQ publication
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP/RLS,
OpenAPI/event drift, k6/performance and recovery procedures
**Target Platform**: existing non-root immutable backend container and Supabase
deployment; runtime secret injection only
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: indexed identity lookup <=50 ms P95 DB; `/me` and
preference/onboarding <=250 ms P95, <=500 ms P99, <=50 KiB compressed; bounded
device pages <=100 with no N+1; bounded webhook backlog/redaction work
**Constraints**: Clerk only; native Supabase Third-Party Auth; no Supabase Auth
identity/JWT Template/password/extra provider; forced RLS; active-profile denial;
no secret/JWT/OTP/PII logging; no direct Admin grants; no client source change;
no durable generic idempotency until SPEC-BE-006
**Scale / Scope**: one profile and preference row per Clerk user, optional onboarding
row, multiple devices/tokens and at-least-once provider deliveries; capacity is
proven with production-like data rather than an invented MAU target

## Constitution Check

*GATE: evaluated before Phase 0. `PASS` permits planning; the independent
implementation hold above remains binding.*

| Gate | Status | Evidence / disposition |
|---|---|---|
| Main-first baseline | PASS | Existing checkout is `main` at `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`; SPEC-BE-001 and SPEC-BE-002 artifacts are present and unrelated files are preserved |
| Required Spec Kit sequence | PASS through tasks | `spec.md`, `plan.md`, and `tasks.md` exist; cross-artifact analysis is the final pre-code gate |
| Exclusive owned resources | PASS | Ownership register matches Phase 02; no Admin/authz/audit/privacy/client/idempotency resource is added |
| Current code and client contracts reviewed | PASS | Merged BE-001 source/tests and current Mobile auth/onboarding plus Admin mock projections were inspected |
| Master Plan architecture represented | PASS | Nest API/worker, direct PostgreSQL, RLS, migrations, outbox, contracts, Docker, evidence, rollback, and operations are explicit |
| Financial/idempotency/conflict rules | PASS | No financial path exists; optimistic versions and natural repeatability are explicit; durable replay remains SPEC-BE-006 |
| Deny-by-default security | PASS | Official Clerk verification, active-profile guard, forced RLS, least grants, raw webhook verification, crypto, safe errors, abuse bounds, and blockers are designed |
| AI boundary | PASS / N/A | No AI work exists |
| Client ownership | PASS | Mobile/Admin source and mocks are mapping-only and remain unchanged; cutover is SPEC-BE-014 |
| Named verification/recovery evidence | PASS | [quickstart.md](quickstart.md) and the Evidence Plan name commands, environments, thresholds, and blocker outcomes |

No Constitution deviation is approved or required. The main-baseline transition
and mandatory pre-code artifact analysis are complete.

## Project Structure

### Feature documentation

```text
apps/api/specs/002-auth-profiles-preferences-sessions/
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   |-- environment.md
|   |-- events.md
|   |-- client-mapping.md              # generated during task execution review
|   |-- openapi.yaml
|   `-- provider-configuration.md
|-- data-model.md
|-- plan.md
|-- quickstart.md
|-- research.md
|-- spec.md
`-- tasks.md                         # generated by speckit-tasks next
```

### Planned source and infrastructure

Exact paths below assume the approved BE-001 paths survive merge. Recheck them at
the implementation gate before editing.

```text
apps/api/
|-- .env.example                                      # names/descriptions only
|-- package.json                                      # @clerk/backend + commands
|-- package-lock.json
|-- src/
|   |-- app.module.ts                                 # import IdentityModule
|   |-- worker.module.ts                              # provide Clerk inbox worker
|   |-- worker.ts                                     # reuse start/abort/stop lifecycle
|   |-- identity/
|   |   |-- identity.module.ts
|   |   |-- clerk-client.service.ts                   # official SDK only
|   |   |-- clerk-auth.guard.ts                       # one verifier + request principal
|   |   |-- identity.dto.ts                           # strict request/response DTOs
|   |   |-- identity.repository.ts                    # pg/RLS transactions + inbox SQL
|   |   |-- identity.service.ts                       # profile/preferences/onboarding/devices
|   |   |-- identity.controller.ts                    # all /api/v1/me routes
|   |   |-- push-token.crypto.ts                      # Node crypto; versioned envelope
|   |   |-- clerk-webhook.controller.ts               # raw verify + durable receipt
|   |   `-- clerk-webhook.worker.ts                   # process/reconcile/redact/revoke retry
|   `-- platform/
|       |-- config/
|       |   |-- environment.schema.ts                 # extend strict validation
|       |   `-- environment.types.ts
|       |-- http/
|       |   |-- http-validation.ts                    # route-scoped raw body first
|       |   |-- openapi.ts                            # compose approved fragments
|       |   `-- safe-exception.filter.ts              # stable identity errors
|       `-- meta/meta-auth.guard.ts                    # existing seam, no second verifier
|-- test/
|   |-- unit/identity/
|   |-- contract/identity/
|   |-- integration/identity/
|   |-- e2e/identity/
|   |-- security/identity/
|   |-- container/                                    # extend secret/startup checks
|   `-- performance/                                  # identity HTTP/SQL/webhook evidence
`-- docs/runbooks/
    |-- clerk-auth-provider-recovery.md
    `-- clerk-webhook-device-recovery.md

supabase/
|-- config.toml                                       # native Clerk TPA domain
|-- migrations/
|   |-- 20260827000500_identity_profiles_functions.sql
|   |-- 20260827000600_identity_profile_rls_grants.sql
|   |-- 20260827000700_identity_preferences.sql
|   |-- 20260827000800_identity_onboarding.sql
|   |-- 20260827000900_identity_devices_push_tokens.sql
|   |-- 20260827001000_identity_devices_push_rls.sql
|   |-- 20260827001100_clerk_webhook_inbox.sql
|   `-- 20260827001200_clerk_webhook_grants.sql
|   `-- 20260827001300_clerk_webhook_claim_index.sql
|-- migration-checksums.sha256
`-- tests/
    |-- 004_identity_profiles_rls.test.sql
    |-- 005_identity_preferences_onboarding.test.sql
    |-- 006_identity_devices_push.test.sql
    |-- 007_clerk_webhook_inbox.test.sql
    `-- 008_identity_admin_denial.test.sql

.github/workflows/backend-foundation.yml              # extend existing gates only
```

**Structure decision**: Keep one cohesive `identity` module, one repository, one
service, and one customer controller instead of creating submodules/interfaces for
each small resource. Separate webhook ingress/worker and push crypto only because
they have different trust boundaries and runtimes. Reuse every platform facility
already owned by BE-001. No speculative abstraction or new infrastructure is
planned.

## Ownership And Boundaries

### Owned resources

- Tables: `profiles`, `user_preferences`, `onboarding_progress`, `user_devices`,
  `push_tokens`, `private.clerk_webhook_events`.
- Functions: `public.current_clerk_user_id()`,
  `private.assert_active_profile(text)`.
- Trigger attachments: BE-001 lifecycle trigger on mutable owned tables.
- APIs: nine customer operations plus one webhook ingress operation in
  [contracts/openapi.yaml](contracts/openapi.yaml).
- Job: `clerk.webhook.process`, including current-Clerk reconciliation, bounded
  seven-day redaction, and linked-session revoke retry.
- Events: the five contracts in [contracts/events.md](contracts/events.md).
- Configuration: one Clerk application/provider/native/redirect/native-Supabase
  contract and the environment names in [contracts/environment.md](contracts/environment.md).

### Consumed contracts

- SPEC-BE-001 API/worker bootstrap, configuration schema, `PoolService`, HTTP
  validation/error/request-ID/OpenAPI handling, `META_TOKEN_VERIFIER`, observability,
  roles/schemas, version trigger, outbox/queue publisher, Docker/CI/test commands.
- Clerk Development application, official Backend SDK, Admin API, signed webhooks,
  Native Applications, Phone OTP and Google configuration.
- Supabase native Clerk Third-Party Auth, `auth.jwt()`, PostgreSQL/RLS/pgTAP.
- Current Mobile Phone/Google `AuthService`, text `userId`, onboarding vocabulary,
  secure-storage/deep-link expectations; current Admin masked projections only.

### Explicit exclusions

- Admin roles/permissions/routes, profile suspension/reactivation, audit/security
  events, privacy export, deletion execution: SPEC-BE-003.
- Currency catalog/FK: SPEC-BE-004.
- Durable generic idempotency/offline sync/conflicts: SPEC-BE-006.
- Mobile/Admin Clerk packages, public environment wiring, adapter implementation,
  mock removal, secure client session storage, live deep-link hook: SPEC-BE-014.
- Password, Apple, Facebook, passkeys, local OTP/MFA/OAuth-token storage, Supabase
  Auth users, legacy JWT Template, Masarifi session table, new queue/cache/view.

### Client contract impact

Documentation/mapping only. The API contract is created now so SPEC-BE-014 can
replace Mobile local/mock adapters later. Admin's user/device/session screens remain
mocked until SPEC-BE-003 supplies authorization/routes and SPEC-BE-014 cuts over.
No file under `apps/mobile` or `apps/admin-web` is edited by this Spec.

## Phase 0: Research

[research.md](research.md) resolves every material unknown:

- official Clerk `authenticateRequest()`/`verifyWebhook()` instead of custom JOSE
  or signature code;
- native token `aud`/`azp` semantics and separation from the OAuth callback;
- native Clerk/Supabase integration and text-subject RLS;
- transaction-local RLS claims for direct PostgreSQL;
- duplicate webhook 2xx behavior and `svix-id` identity;
- current-Clerk reconciliation and row-lock ordering without a new watermark/queue;
- standard-library AES-GCM/HMAC push protection;
- natural mutation repeatability until SPEC-BE-006;
- provider/native application configuration and current SMS-tier blocker;
- no Redis/cache/new service/client cutover.

Research corrected the draft specification where current provider semantics made
the original requirement invalid: default Clerk tokens do not require `aud`, native
requests may omit `azp`, identical webhook retries return `202`, and device DELETE
cannot promise `IDEMPOTENCY_KEY_REUSED` without SPEC-BE-006 storage.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines every column, bound, relationship,
  composite same-owner FK, index, lifecycle, RLS/grant matrix, transaction, crypto
  envelope, processing model, migration order, and rollback rule.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines the complete customer and
  provider HTTP fragment, error behavior, pagination, versions, idempotency header,
  webhook duplicate/unsupported behavior, and safe projections.
- [contracts/events.md](contracts/events.md) registers all five v1 payloads inside
  the existing outbox envelope.
- [contracts/environment.md](contracts/environment.md) classifies required secret/
  safe process configuration and fail-closed startup behavior.
- [contracts/provider-configuration.md](contracts/provider-configuration.md)
  provides the redacted Clerk/Supabase dashboard checklist and test identities.
- `contracts/client-mapping.md` is generated during baseline task execution from
  the then-current Mobile/Admin contracts, without changing client source.
- [quickstart.md](quickstart.md) names implementation, provider, database, contract,
  security, performance, container, and recovery verification procedures.

## Key Design Decisions

### One authentication boundary

`ClerkAuthGuard` delegates token verification to the official backend SDK, then
attaches a minimal immutable principal (`userId`, `sessionId`, role, factor age) to
the request. It validates configured audience only if Masarifi later sets one and
validates present `azp` against trusted web origins. A verified native token may
omit `azp`. The guard supplies BE-001's `META_TOKEN_VERIFIER`; no decoded-but-
unverified claim is consumed.

### Active profile plus RLS

The application guard verifies identity; the repository establishes
transaction-local minimal claims and `SET LOCAL ROLE masarifi_api`, then calls the
private active-profile assertion. Forced RLS independently repeats active owner
checks. Direct `authenticated` Data API access is safe SELECT-only; all writes use
the API so DTO allowlists and `expectedVersion` cannot be bypassed. Admin receives
no direct table grant.

### Webhook inbox and current-state convergence

Ingress verifies exact raw bytes and the Standard Webhooks headers through Clerk,
then performs one unique insert. Processing locks one inbox row and takes a
transaction-scoped PostgreSQL advisory lock derived from the immutable subject,
reads current Clerk state with a bounded timeout, and commits
profile/default/outbox/inbox effects atomically. Concurrent webhook and
reconciliation work for one subject serializes on that lock. New profiles are
inserted directly in their current state; existing inactive profiles never
auto-reactivate. Provider outage rolls back and retries, while confirmed absence
becomes deletion-pending evidence only for an existing profile.

This deliberately holds one database transaction across one read-only provider
lookup. It is the only crash-safe design that fits the Master Plan's fixed inbox
columns without adding a queue/lease/watermark object. Load/connection evidence is
blocking; an observed ceiling requires an approved Master Plan/schema change, not
an unreviewed optimization.

### Device and push security

The raw fingerprint becomes a keyed HMAC before persistence. Push tokens use a
separate keyed HMAC and versioned AES-256-GCM envelope with provider/user/device
AAD. Composite FK prevents cross-owner device/token rows. Revocation commits local
device/push denial and an outbox event before calling Clerk; failed linked-session
revocation remains retryable via nonnull session linkage and cannot restore push.

### No false idempotency claim

Every mutation validates `Idempotency-Key`, but durable response replay/hash
mismatch is not implemented here. Conditional versions, natural device uniqueness,
repeated revoked state, and webhook delivery uniqueness give only the repeatability
explicitly documented. SPEC-BE-006 later adds the sole generic store.

## Implementation Strategy

### 1. Revalidate and extend the foundation

Using the rechecked merged BE-001 source and tests, add
`@clerk/backend`, environment types/schema/examples, route-scoped raw-body parsing,
safe identity errors, composed OpenAPI fragments, and one verifier provider for the
existing meta seam. Fail startup before bind on invalid required secrets/config.

### 2. Apply additive owned migrations

Use Supabase CLI to create descriptive ordered migrations. Build profiles/defaults,
devices/push composite ownership, the private inbox, the two functions, lifecycle
trigger attachments, explicit indexes, forced RLS, and minimum grants. Revoke
defaults first and add positive/negative pgTAP before application writes.

### 3. Establish authentication and RLS request context

Implement the official Clerk client/guard and request principal. In the repository,
wrap each customer operation in a transaction that sets only verified minimal
claims and the API role locally. Prove pooled requests cannot inherit another
subject and that API/worker connections cannot bypass RLS.

### 4. Implement profile, preferences, and onboarding

Add strict DTOs and one controller/service/repository flow. Use conditional UPDATE
with `expectedVersion`, full preference replacement, canonical onboarding steps,
masking, active-profile denial, and same-transaction profile events. Do not read
then decide a concurrent update.

### 5. Implement devices and push protection

Add HMAC fingerprint/token helpers and AES-GCM envelope using Node `crypto`. Add
same-owner atomic register/refresh/reactivation, cursor listing, recent-auth current
device revoke, local push denial, after-commit Clerk session revoke, and retry scan.
Never return or log fingerprint/session/token/hash/ciphertext.

### 6. Implement webhook ingress and worker

Verify raw bytes with `verifyWebhook()`, validate the signed delivery ID and bounded
supported schema, insert once, and handle duplicates/conflicts/unsupported types.
Reuse the BE-001 worker start/abort pattern to claim one row transactionally,
serialize by subject row, fetch current Clerk state, upsert/default without
reactivation, emit events, retry safe failures, reconcile lost events, retry linked
sessions, and redact payloads after seven days.

### 7. Add observability and operational evidence

Extend existing bounded logs/OTel metrics for auth failures, inactive denial,
endpoint/version/device results, webhook inbox/age/attempts, provider latency,
reconciliation drift, session retry, and redaction age. Add two focused runbooks
covering provider/JWKS/native-integration outage/rotation and webhook/device/push
recovery/secret rotation. Labels never contain IDs, claims, or payloads.

### 8. Prove release gates

Run the full named unit/contract/integration/E2E/pgTAP/security/performance/container/
recovery matrix, three protected provider identities, OpenAPI/event/client mapping,
N-1/forward-fix rehearsal, secret/image scan, and provider checklist. Generate
`tasks.md`, run `speckit-analyze`, and resolve every critical/high inconsistency
before any implementation completion claim.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Baseline/dependency | `git branch --show-current`; `git fetch origin main`; `git log --oneline --decorate -10`; dependency ancestry/review | branch exactly `main`; BE-001 present in synchronized baseline; no copied foundation/client/unrelated changes |
| Requirements/contracts | `npm --prefix apps/api run test:contract`; `test:openapi`; event/environment/provider contract tests | zero drift, unknown field, unsafe projection, or undocumented error/event |
| Database/migrations | `db:reset`; `db:lint`; `test:db`; `migration:checksums`; migration E2E | clean ordered apply; all constraints/indexes/checksums; no manual schema drift |
| RLS/authorization | pgTAP matrix plus `security:scope` and identity integration tests | zero owner/non-owner/anon/inactive/Admin cross-access; API/worker no BYPASSRLS |
| Authentication | three controlled test identities; JWT negative/rotation/provider-outage suites | all valid approved sessions accepted; every invalid trust case denied; zero Supabase Auth users |
| Webhook/reconciliation | signed contract/integration/E2E, duplicate/race/crash/outage/loss/redaction tests | 202 after durability, one effect, no regression/loss/plain payload after retention |
| Push/device/session | crypto known-answer/tamper tests, concurrency, cross-owner, recent-auth, outage/retry | zero plaintext/cipher exposure; local revoke always effective; no cross-owner token |
| Security | `security:dependencies`; `security:sast`; secret scan; OWASP/MASVS checklist; image inspection | zero exploitable Critical/High, key/JWT/OTP/PII leak, unsigned/replayed webhook, legacy auth path |
| Performance | production-like k6 plus redacted `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` | DB <=50 ms P95; API <=250/500 ms P95/P99; <=50 KiB; bounded/no sequential active scan/N+1 |
| Provider configuration | redacted dashboard checklist and approved account aliases | exact providers/countries/native IDs/callback/TPA/domain; SMS restriction resolved for production |
| Containers/operations | `test:container`; `build`; `verify`; non-root/read-only/SIGTERM/readiness tests | no secret/dev dependency; graceful API/worker behavior and fail-closed readiness |
| Rollback/recovery | N-1 image, failed+forward migration, JWKS/provider outage, lost webhook, key/session retry drills | no identity evidence loss, no fallback auth, reconciliation returns safe zero drift |
| Client boundary | Mobile/Admin mapping contract and Git diff scope check | no Mobile/Admin source change; mocks remain until owning Specs |

## Observability and Runbooks

### Metrics

- Auth verification outcomes by bounded reason; unknown key/rotation/provider
  failure; inactive/missing profile denial.
- `/me`, preference, onboarding, and device count/latency/error/version conflict.
- Webhook accepted/duplicate/rejected/conflict, inbox depth/oldest age, attempt/
  terminal failure/provider latency, reconciliation drift/lag, redaction backlog.
- Device register/revoke/current-recent-auth and linked-session retry outcome; push
  protect/register/revoke/validation outcome without token/fingerprint labels.

### Alerts

- sustained Clerk/JWKS/Supabase TPA authentication failure;
- SMS provider allowlist/configuration release failure;
- webhook signature/replay spike, oldest-age/backlog breach, terminal processing
  failure, reconciliation drift, or >7-day payload;
- linked session revoke backlog/provider outage or cross-owner token conflict;
- any secret/PII log finding, RLS negative failure, or performance budget regression.

### Runbooks

`clerk-auth-provider-recovery.md` covers provider/native-TPA validation, wrong
issuer/party, JWKS rotation/refresh delay, outage/readiness, secret rotation, and no
fallback. `clerk-webhook-device-recovery.md` covers raw verification incidents,
duplicate/conflict/out-of-order/lost delivery, reconciliation, redaction breach,
push-key rotation, device/session revoke retry, and closure evidence.

Each runbook names owner, threshold/window, severity, safe diagnostic query,
mitigation, escalation, rollback/reconciliation, and closure evidence.

## Migration, Deployment, and Rollback

- Migrations are additive and generated through Supabase CLI only after BE-001
  merge. Ordered migration/checksum/clean-state tests run before image rollout.
- Deploy migration as the existing one-off job, then API/worker images compatible
  with N-1. Do not run DDL from application startup.
- Provider Dashboard configuration is a reviewed operational procedure; database
  grants/functions/policies remain SQL-migration owned.
- Initial Clerk reconciliation is bounded/resumable and records safe counts/hashes.
- Roll back application images only. Keep all owned rows, revocation evidence,
  webhook hashes/status, and outbox events.
- Repair schema with a new forward migration. Never rewrite/drop historical
  migrations or delete profiles/tokens/inbox to recover.
- On auth/provider/config failure, keep protected traffic non-ready. Never fall back
  to Supabase Auth, shared JWT secret/template, password, mock, or unverified claims.

## Post-Design Constitution Check

*GATE: re-evaluated after Phase 1 artifacts.*

| Gate | Status | Phase 1 evidence |
|---|---|---|
| Main-first baseline / dependency | PASS | Existing checkout is `main` at `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`; BE-001 and the SPEC-BE-002 artifacts are present and no new worktree was created |
| Artifact consistency | PASS | Spec corrections align with research, data model, OpenAPI, events, environment, provider checklist, and quickstart; tasks/analyze still next |
| Ownership completeness | PASS | Every proposed table/function/trigger/API/job/event/config is registered; no new queue/view/session/idempotency/Admin/client resource |
| Repository/client review | PASS | Reuse paths and Mobile onboarding/auth/Admin boundaries are encoded; exact merged paths must be rechecked |
| Architecture/operations | PASS | API/worker, SQL/RLS/outbox, migration, Docker, performance, observability, reconciliation, rollback/recovery all have design/evidence |
| Financial/idempotency/version | PASS | No finance; versions and natural repeatability explicit; false hash-mismatch claim removed |
| Security | PASS | Official verification, native TPA, claims/RLS, active status, least grants, webhook replay/crypto/secrets/OWASP blockers are explicit |
| AI | PASS / N/A | No AI capability |
| Client scope | PASS | Mapping only; zero planned source path under Mobile/Admin |
| Verification thresholds | PASS | Evidence table and quickstart name commands/procedures and release-blocking outcomes |

**Post-design result**: PASS, subject to the mandatory pre-code cross-artifact
analysis. Provider SMS allowlist enforcement remains a separate production release
blocker.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |

The one-row inbox/provider transaction is a documented deliberate ceiling, not a
Constitution deviation or new infrastructure. If measurement shows it fails the
connection/throughput budget, work stops for an approved Master Plan/schema change.
