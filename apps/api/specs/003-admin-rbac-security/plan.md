# Implementation Plan: Admin RBAC, RLS, Audit & Security Foundation

**Phase / Spec**: Phase 03 / SPEC-BE-003
**Branch**: `main`
**Base Revision**: `ecaa54a7291d8cd06b0e44e871a84790a19f3d4c`
**Date**: 2026-08-29
**Status**: Task generation complete; implementation not started
**Spec**: [spec.md](spec.md)
**Input**: Phase 03 specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add one database-backed Admin authorization system to the existing NestJS modular
monolith. Clerk continues to authenticate; PostgreSQL authorizes exact permissions
from active Admin profiles, roles, and time-bounded assignments. Privileged state,
immutable audit/security evidence, support grants, incidents, privacy export/
deletion orchestration, and retention policy/holds use guarded PostgreSQL commands,
forced RLS, the existing outbox, and the existing API/worker runtimes.

The smallest complete implementation adds one cohesive `security` module, one
bounded security worker, one streaming ZIP dependency, and native `fetch` calls to
the existing private Storage bucket. It adds no ORM, Redis, policy engine,
microservice, Edge Function, generic idempotency table, public Storage object,
client cutover, or second auth/role system.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js `>=24 <25`
**Framework**: NestJS 11 with Express 5; separate API, worker, and migration entry points
**Primary Dependencies**: existing NestJS, `@clerk/backend`, `pg`, Joi,
class-validator, Swagger, RxJS, OpenTelemetry; add `archiver` only for bounded
streaming ZIP generation; Node `crypto` and native `fetch` for token/IP hashing and
Supabase Storage REST
**Storage**: 16 owned PostgreSQL tables across `public`, `private`, and `audit`;
existing roles/version trigger/outbox and private `report-exports` bucket
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP/RLS,
OpenAPI/event/client drift, k6/SQL query-plan/performance, restore/rollback drills
**Target Platform**: existing non-root immutable backend image plus Supabase
PostgreSQL/Storage; runtime secrets only
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: permission DB P95 <=25 ms; Admin list P95 <=500 ms/P99 <=1
s and <=300 KiB compressed; customer reads P95 <=300 ms/P99 <=600 ms and <=200
KiB; async acceptance P95 <=300 ms/P99 <=600 ms and <=50 KiB
**Constraints**: synchronized `main`; exact deny-default authorization; recent
Clerk MFA; forced RLS; immutable audit; no shared permission cache; all mutations
accept bounded idempotency keys, with generic durable replay deferred to owned
SPEC-BE-006 storage; additive checksum-verified migrations; no client edits
**Scale / Scope**: seven system roles, 151 current client keys plus canonical
aliases, role/assignment fan-out, one million-row audit/security plan evidence,
bounded Admin pages <=200/customer pages <=100, and bounded worker batches <=100

## Constitution Check

_GATE: evaluated before Phase 0._

| Gate                                 | Status             | Evidence / disposition                                                                                                                                                                               |
| ------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronized main / one owner        | PASS               | Checkout is `main`; `HEAD...origin/main` is `0 0`; active feature pointer and diff belong to SPEC-BE-003; unrelated `.agents/plugins` content is preserved                                           |
| Required artifact sequence           | PASS through tasks | Approved `spec.md`, plan/research/design/contracts/quickstart, and dependency-ordered `tasks.md` exist; `speckit-analyze` remains the pre-code gate                                                  |
| Complete ownership                   | PASS               | All 16 tables, four named functions, guarded commands, routes, five jobs, ten event names, seeds, Storage behavior, and business rules are registered                                                |
| Current code/clients reviewed        | PASS               | Existing API/worker/identity/outbox/config/migration/test patterns, Admin 151-key role map/governance/security Zod contracts, and Mobile security/privacy contracts were inspected                   |
| Master Plan represented              | PASS               | Modular monolith, direct PostgreSQL, RLS, outbox, Storage, Docker, performance, observability, backup/recovery, forward rollback, and evidence gates are explicit                                    |
| Financial/idempotency/conflict rules | PASS               | No financial mutation exists; versions/locks/audit/outbox are atomic; natural repeatability is explicit and generic durable replay remains exclusively SPEC-BE-006                                   |
| Deny-default security                | PASS               | Official Clerk verification, active profile/Admin, exact DB permission, MFA, owner/object/property checks, support grants, forced RLS, minimum grants, negative tests, and abuse bounds are designed |
| AI boundary                          | PASS / N/A         | No AI work exists                                                                                                                                                                                    |
| Client ownership                     | PASS               | Mobile/Admin are read-only mapping inputs; no client source or mock removal is planned before SPEC-BE-014                                                                                            |
| Named verification/recovery          | PASS               | [quickstart.md](quickstart.md) names commands, environments, thresholds, approval blockers, rollback, restore, and reconciliation                                                                    |

No Constitution deviation is requested.

## Project Structure

### Feature documentation

```text
apps/api/specs/003-admin-rbac-security/
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   |-- client-mapping.md
|   |-- environment.md
|   |-- events.md
|   |-- internal-contracts.md
|   `-- openapi.yaml
|-- data-model.md
|-- plan.md
|-- quickstart.md
|-- research.md
|-- spec.md
`-- tasks.md                         # dependency-ordered implementation ledger
```

### Planned source and infrastructure

```text
apps/api/
|-- .env.example
|-- package.json                     # archiver + focused commands only
|-- package-lock.json
|-- src/
|   |-- app.module.ts                # SecurityModule
|   |-- worker.module.ts             # SecurityWorkerModule
|   |-- worker.ts                    # start/stop SecurityWorker
|   |-- identity/
|   |   |-- clerk-client.service.ts  # invitation/email/session provider calls
|   |   |-- identity.module.ts       # register identity privacy handler
|   |   `-- identity-privacy.handler.ts
|   |-- security/
|   |   |-- security.module.ts
|   |   |-- security.controller.ts   # canonical owner/Admin routes
|   |   |-- security.dto.ts          # strict request/response contracts
|   |   |-- security.service.ts      # command orchestration/masking
|   |   |-- security.repository.ts   # transactions, guarded SQL, claims
|   |   |-- admin-auth.guard.ts      # exact DB permission + recent MFA
|   |   |-- permission-manifest.ts   # immutable server seed/drift input
|   |   |-- security.events.ts       # ten safe event payload builders
|   |   |-- privacy-handlers.ts      # typed deterministic registry
|   |   |-- export-package.ts        # bounded streaming ZIP + manifest
|   |   |-- export-storage.ts        # native fetch to report-exports
|   |   `-- security.worker.ts       # five bounded job loops
|   `-- platform/
|       |-- config/environment.schema.ts
|       |-- config/environment.types.ts
|       |-- http/openapi.ts
|       |-- http/safe-exception.filter.ts
|       `-- observability/platform-metrics.ts
|-- test/
|   |-- unit/security/
|   |-- contract/security/
|   |-- integration/security/
|   |-- e2e/security/
|   |-- security/admin/
|   |-- performance/security-*.{js,sql,ts}
|   `-- container/                   # extend process secret checks
`-- docs/runbooks/
    |-- admin-permission-bootstrap-recovery.md
    |-- support-access-emergency-revoke.md
    |-- audit-security-incident-recovery.md
    `-- privacy-retention-recovery.md

supabase/
|-- migrations/
|   |-- 20260827001400_admin_access_tables.sql
|   |-- 20260827001500_admin_permission_role_seeds.sql
|   |-- 20260827001600_audit_security_events.sql
|   |-- 20260827001700_support_access_incidents.sql
|   |-- 20260827001800_privacy_retention.sql
|   `-- 20260827001900_admin_security_functions_rls_grants.sql
|-- migration-checksums.sha256
`-- tests/
    |-- 009_admin_rbac_structure.test.sql
    |-- 010_admin_permission_rls.test.sql
    |-- 011_audit_security_immutability.test.sql
    |-- 012_support_access.test.sql
    |-- 013_privacy_retention.test.sql
    `-- 014_admin_denial_matrix.test.sql

.github/workflows/backend-foundation.yml  # extend existing gates only
```

**Structure decision**: Reuse the current flat feature-module pattern. One security
controller/service/repository handles the cohesive policy boundary; separate files
exist only for distinct trust/runtime concerns (guard, manifest, event schemas,
privacy registry, ZIP, Storage, worker). No per-table repositories, interfaces with
one implementation, new entry point, or speculative infrastructure is planned.

**Admin self-context correction**: The canonical self route requires the shared
`admin.overview.read` permission. A BE003-owned security-definer projection reads
the current active Admin profile, enabled current assignments, effective
permissions, and BE002 provider-session state without widening table RLS. A second
guarded scalar supplies authoritative distinct active-session counts to Admin list
and detail projections. Neither function accepts client identity or role input.

## Ownership And Boundaries

**Owned resources**: all 16 tables and four functions in [data-model.md](data-model.md);
guarded RBAC/invitation/Admin-session/support/incident/privacy/deletion/retention
commands; all routes in [contracts/openapi.yaml](contracts/openapi.yaml); the five
jobs and ten event names; seven system-role and permission/alias seeds; first-
super-admin procedure, drift gate, alerts/runbooks, ZIP orchestration, and Storage
object lifecycle.

**Consumed contracts**: SPEC-BE-001 config/HTTP/errors/OpenAPI/observability/
database roles/version/outbox/worker/container/CI/Storage bucket; SPEC-BE-002 Clerk
guard/client, active profiles, device/session state, and factor age; current Admin
permission/Zod mappings and Mobile service types as test-only inputs; downstream
versioned privacy handlers as they arrive.

**Explicit exclusions**: domain-specific privileged routes or data, financial
mutation, domain export/delete/retention logic beyond the identity adapter, generic
idempotency/sync tables, email/notification product infrastructure, Admin/Mobile
implementation or mock cutover, Redis/cache/policy engine/ORM/microservice/Edge
Function, and legal-policy invention.

**Client contract impact**: documentation and drift tests only. Current client
state labels, page numbers, IDs, mock confirmation tokens, and permission aliases
map at the later SPEC-BE-014 adapter; none becomes server authority.

## Phase 0: Research

[research.md](research.md) resolves the architecture, exact SQL authorization,
permission manifest/aliases, guarded atomic commands, pre-SPEC-BE-006 idempotency,
Clerk invitation acceptance, closed support scopes, privacy handler registry,
streaming ZIP, native Storage REST, bounded worker, immutable evidence, and
forward-only recovery. No unresolved clarification remains.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines columns, constraints, indexes, seeds,
  authorization/grant matrix, atomicity, migration order, and rollback.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines all canonical owner and
  Admin operations, exact permission/MFA annotations, strict requests, redacted
  responses, bounded pagination, and stable failure classes.
- [contracts/internal-contracts.md](contracts/internal-contracts.md) defines the
  four SQL functions, support scope, privacy-handler registry, ZIP manifest,
  worker claims, and invitation acceptance flow.
- [contracts/events.md](contracts/events.md) defines all safe outbox payloads and
  alert input.
- [contracts/environment.md](contracts/environment.md) defines process-scoped
  configuration and secrets.
- [contracts/client-mapping.md](contracts/client-mapping.md) records current
  Admin/Mobile mapping and drift gates without client edits.
- [quickstart.md](quickstart.md) provides executable implementation and release
  evidence procedures.

## Implementation Strategy

1. Freeze the base manifest/client mapping and add contract/security tests that
   fail before production code.
2. Apply ordered schema/seeds/functions/RLS/grants with pgTAP evidence and checksum
   updates; bootstrap no user automatically.
3. Add exact Admin guard and RBAC/invitation/Admin-session commands, then audit and
   security read/incident commands.
4. Add support-scope requests, distinct approvals, per-use grant assertions, owner
   approval, expiry, and emergency revocation.
5. Add privacy/deletion/retention commands, the identity handler, streaming ZIP,
   Storage lifecycle, and one bounded worker.
6. Wire OpenAPI/errors/config/metrics/runbooks, then run contract, negative,
   performance, container, restore, rollback, reconciliation, and bootstrap gates.
7. Run `speckit-analyze` after `tasks.md` is generated and before implementation.

This sequence establishes authorization/audit before exposing any privileged
mutation and establishes schema/claim safety before external Clerk/Storage effects.

## Evidence Plan

| Gate                       | Planned evidence                                                                                                                                                         | Blocking threshold                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements and contracts | `npm --prefix apps/api run typecheck`, `lint`, `test:contract`, `test:openapi`; YAML parse; permission/client/event drift checks                                         | zero contract/schema/alias/state/route drift; all operations have auth, permission where applicable, bounded input, and safe error                      |
| Database and RLS           | `supabase db reset`, `db lint`, `supabase test db`, migration checksums, integration/E2E matrices                                                                        | all migrations/checksums/pgTAP pass; zero cross-user/direct-client/Admin/worker privilege outside matrix; immutable rows reject update/delete           |
| Security                   | unit/integration/security suites, SAST/dependency/secret/log scans, OWASP checklist and manual authorization review                                                      | zero exploitable Critical/High; zero exact-permission/MFA/self-approval/last-super-admin/audit/support/hold bypass                                      |
| Performance                | k6 plus redacted `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)` on production-like role fan-out, 1M audit/security rows, support and job backlog                                | permission P95 <=25 ms; Admin P95/P99 <=500/1000 ms <=300 KiB; customer <=300/600 ms <=200 KiB; acceptance <=300/600 ms <=50 KiB; no N+1/unbounded scan |
| Containers and operations  | build/image/container tests, API/worker startup, graceful SIGTERM, secret isolation, metrics/alerts/runbook review                                                       | non-root immutable image; process receives minimum secrets; 30 s shutdown; no token/PII/URL/storage key in logs or labels; alerts have owners/runbooks  |
| Rollback and recovery      | clean restore, N-1 image compatibility, failed migration + forward fix, route/job disable, worker crash/retry, Clerk/Storage outage, bootstrap and reconciliation drills | no history/data loss; no partial privileged state without audit; no missing handler reported as success; active super-admin continuity preserved        |

## Post-Design Constitution Check

| Gate                            | Status after Phase 1  | Evidence                                                                                                                        |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Main-first / one owner          | PASS                  | Branch/base metadata and Phase 03-only planned paths are explicit                                                               |
| Spec/plan/tasks consistency     | PASS pending analysis | Spec corrections, design artifacts, and dependency-ordered story tasks agree; cross-artifact analysis remains the pre-code gate |
| Complete resource ownership     | PASS                  | Data model, OpenAPI, internal/event/environment contracts enumerate every owned resource                                        |
| Repository/client review        | PASS                  | Planned paths reuse current modules; client mapping names exact current sources                                                 |
| Master Plan architecture        | PASS                  | No unapproved infrastructure; Storage/outbox/worker/RLS/recovery are represented                                                |
| Financial/idempotency/atomicity | PASS                  | No financial writes; versions, locks, audit/outbox atomicity, natural retry ceiling, and SPEC-BE-006 handoff are explicit       |
| Security boundary               | PASS                  | Exact DB permission, MFA, forced RLS, minimum grants, immutable evidence, abuse bounds, and release blockers are testable       |
| AI boundary                     | PASS / N/A            | No AI path                                                                                                                      |
| Client boundary                 | PASS                  | Mapping/drift only; no client changes                                                                                           |
| Verification/recovery           | PASS                  | Commands, fixtures, thresholds, environment, owner approval blockers, and recovery outcomes are in Evidence Plan/quickstart     |

No design introduced a Constitution violation.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
| --------- | ------------ | ----------- | --------- |
| None      | N/A          | N/A         | N/A       |
