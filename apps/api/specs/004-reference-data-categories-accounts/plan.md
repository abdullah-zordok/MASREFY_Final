# Implementation Plan: Reference Data, Categories & Accounts

**Phase / Spec**: Phase 04 / SPEC-BE-004
**Branch**: `main`
**Base Revision**: `2cd8432`
**Date**: 2026-08-29
**Status**: Ready for task generation
**Spec**: [spec.md](spec.md)
**Input**: Phase 04 specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add one small reference module and four additive SQL migrations across two safe
release checkpoints to provide five
owned tables, deterministic reference seeds, forced RLS, exact Admin governance,
owner category/account lifecycles, safe FX lookup, audit/outbox effects, and
ETag-backed shared reads. Reuse the existing Clerk, database, Admin guard, audit,
outbox, OpenAPI, observability, migration, container, and test infrastructure.

No new dependency, provider, worker loop, balance field, ledger write, Redis,
Storage object, client edit, or later-Spec object is needed.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js `>=24 <25`
**Framework**: NestJS 11 with Express 5; existing API/worker/migration entry points
**Primary Dependencies**: existing NestJS, `@clerk/backend`, `pg`, Joi,
class-validator, Swagger, RxJS, OpenTelemetry, Node `crypto`
**Storage**: five owned Supabase PostgreSQL tables; consumes profiles,
preferences, Admin RBAC, audit, outbox, version trigger, and database roles
**Testing**: Jest unit/contract/integration/E2E/security, pgTAP/RLS, OpenAPI/client/
event drift, SQL query plans, k6-compatible performance runners, recovery drills
**Target Platform**: existing non-root immutable backend image and Supabase
PostgreSQL; no new runtime secret
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: indexed SQL P95 <=50 ms; complete reference/category/
account data access P95 <=100 ms; account API P95/P99 <=300/600 ms and <=150 KiB;
reference cache hit >=95% after warm-up
**Constraints**: synchronized main; forced RLS/minimum grants; exact Admin
permission/recent MFA; version/audit/outbox atomicity; no mutable balances; additive
checksum migrations; no provider enablement or client edits
**Scale / Scope**: deterministic reference rows, current 19 system categories,
100k accounts/categories in query evidence, customer page <=100, Admin page <=200

## Constitution Check

_GATE: evaluated before Phase 0._

| Gate | Status | Evidence / disposition |
|---|---|---|
| Synchronized main / one owner | PASS | `main...origin/main` is `0 0` at base; active artifacts/diff are Phase 04; unrelated `.agents/plugins/` is preserved |
| Required artifact sequence | PASS through plan | Validated `spec.md`; this plan plus research/design/contracts/quickstart are Phase 04; tasks and analysis follow before code |
| Complete ownership | PASS | Five tables, two functions, guarded triggers, routes, seed job, optional-disabled FX refresh, events, cache, permissions, tests, and operations are enumerated |
| Current code/clients reviewed | PASS | Existing platform/identity/security/database/test patterns plus Mobile account/category/FX and Admin governance/provider-health contracts were inspected |
| Master Plan represented | PASS | Phase 04 rows were corrected only where the current executable account contract was factual authority; architecture, performance, migration, recovery, and testing rules remain intact |
| Financial/idempotency/conflict rules | PASS | No ledger write/balance exists; nonzero opening balance fails; versions/audit/outbox are atomic; pre-006 retry ceiling is explicit |
| Deny-default security | PASS | Active Clerk profile, owner/object/property checks, exact Admin permission/MFA/reason, forced RLS, minimum grants, safe errors, abuse bounds, negative tests |
| AI boundary | PASS / N/A | No AI or OpenRouter path exists |
| Client ownership | PASS | Mobile/Admin are mapping and drift-test inputs only; no client source or production cutover is changed |
| Named verification/recovery | PASS | [quickstart.md](quickstart.md) names commands, environments, thresholds, reconciliation, rollback, and external blockers |

No Constitution deviation is requested. SPEC-BE-002's provider/manual release
evidence remains an external production gate; its locally consumed contracts are
present and verified.

## Project Structure

### Feature documentation

```text
apps/api/specs/004-reference-data-categories-accounts/
|-- checklists/
|-- contracts/
|   |-- client-mapping.md
|   |-- events.md
|   |-- internal-contracts.md
|   `-- openapi.yaml
|-- data-model.md
|-- plan.md
|-- quickstart.md
|-- research.md
|-- spec.md
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/
|-- src/
|   |-- app.module.ts
|   |-- reference/
|   |   |-- reference.module.ts
|   |   |-- reference.controller.ts
|   |   |-- reference.dto.ts
|   |   |-- reference.service.ts
|   |   |-- reference.repository.ts
|   |   `-- reference.events.ts
|   `-- security/permission-manifest.ts
|-- test/
|   |-- unit/reference/
|   |-- contract/reference/
|   |-- integration/reference/
|   |-- e2e/reference/
|   |-- security/reference/
|   `-- performance/reference-*.{sql,js,ts}
`-- docs/runbooks/reference-account-recovery.md

supabase/
|-- migrations/
|   |-- 20260829080000_reference_account_tables_functions.sql
|   |-- 20260829080100_reference_seeds_permissions.sql
|   |-- 20260829080200_reference_runtime_access.sql
|   `-- 20260829080300_preference_currency_fk.sql
|-- migration-checksums.sha256
`-- tests/
    |-- 016_reference_structure_seed.test.sql
    |-- 017_reference_rls_grants.test.sql
    `-- 018_category_account_functions.test.sql

docs/Back end/BACKEND_MASTER_PLAN.md  # targeted Phase 04 client-contract correction
```

**Structure decision**: Reuse the flat domain-module and direct-`pg` patterns. One
module owns the cohesive boundary, with the tiny bounded reference cache kept in
the service. No generic repository, base service, new worker module, or new
package is introduced.

## Ownership And Boundaries

**Owned resources**: five tables and dependency FK; two resolver functions;
category/account invariant guards; canonical owner/Admin routes; reference seeds;
two permissions; ten event names; process-local shared-reference cache; Phase 04
tests, metrics, alerts, and runbook.

**Consumed contracts**: SPEC-BE-001 config/HTTP/errors/OpenAPI/database roles/
version trigger/audit/outbox/migrations/observability/container; SPEC-BE-002 Clerk
guard, active profiles, preferences; SPEC-BE-003 Admin guard, permissions, audit;
current client service/data types as mapping inputs.

**Explicit exclusions**: balance/ledger/transaction commands, durable generic
idempotency/sync, planning/import/AI/report/notification/billing/operations data,
provider procurement/health, Redis, Storage, client source/cutover, and later jobs.

**Client contract impact**: contract mapping and backend responses only. No
Mobile/Admin source, mock removal, or production adapter selection changes.

## Phase 0: Research

[research.md](research.md) resolves module shape, SQL invariant placement,
migration split, deterministic seeds/UUIDs, recursive category guards, merge
boundary, account-type correction, opening-balance failure, pre-006 retry ceiling,
Admin permissions, cache/ETags, FX behavior, RLS/grants, and provider absence. No
clarification remains.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines fields, relationships, indexes, lifecycle,
  seeds, authorization, functions, migration order, and rollback.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines canonical owner/shared/
  Admin requests, responses, errors, pagination, ETags, version, and permissions.
- [contracts/internal-contracts.md](contracts/internal-contracts.md) defines SQL
  functions/commands, cache keys, idempotency ceiling, audit/outbox atomicity, and
  future ledger handoff.
- [contracts/events.md](contracts/events.md) defines safe event payloads.
- [contracts/client-mapping.md](contracts/client-mapping.md) maps current Mobile/
  Admin contracts without source edits.
- [quickstart.md](quickstart.md) provides runnable local, database, security,
  performance, recovery, and release evidence procedures.

## Implementation Strategy

1. Add failing manifest, DTO, OpenAPI, event, client-mapping, and scope tests.
2. Release A adds forced-RLS schema/functions, insert-only deterministic seeds and
   backend permissions, then runtime policies/grants; update checksums and deploy
   application currency validation.
3. Release B adds/validates the preference-currency FK only after Release A is the
   supported N-1 image; retain both checkpoint commits/evidence.
4. Implement repository guarded transactions and canonical ETag queries, then
   service DTO/error/idempotency handling and shared-reference cache.
5. Wire routes/module/OpenAPI and exact Admin permission behavior.
6. Add integration/E2E/security tests for owner/system/Admin/worker matrices,
   lifecycle, atomic audit/outbox, unavailable opening balance/FX, and no later
   objects.
7. Add query-plan/performance evidence, metrics/alerts/runbook, migration replay,
   forward-fix/rollback/reconciliation evidence, then run full local gates.
8. Run cross-artifact analysis before implementation and clean-code/test reviews
   before completion.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Requirements/contracts | typecheck, lint, contract/OpenAPI/client/event drift | zero schema/route/field/error/permission/event drift; no unresolved requirement |
| Database/RLS | clean `supabase db reset`, db lint, pgTAP, checksum, integration/E2E | all migrations/seeds/FK/functions/policies/grants pass; zero cross-user/direct-write leak |
| Security | scoped security tests, SAST, dependency/secret/error/log scans, OWASP checklist | zero exploitable Critical/High; zero BOLA/BFLA/mass-assignment/permission/MFA/audit bypass |
| Performance/cache | reference SQL plans and HTTP/load runners with production-like rows | indexed SQL <=50 ms; complete data access <=100 ms; account API <=300/600 ms and 150 KiB; >=95% warm reference hit; no N+1/unbounded scan |
| Operations | metrics/alerts/runbook review, seed-drift and cache-loss drills | bounded labels; alerts have owner/threshold/runbook; no sensitive data or fake FX |
| Rollback/recovery | N-1 build, repeated seed, failed migration+forward fix, route disable, cache/provider outage, reconciliation | zero row/history loss or partial resource without audit/outbox; unavailable dependencies fail closed |
| Scope | path/object inventory and git diff | zero later-Spec/client/unrelated changes |

## Post-Design Constitution Check

| Gate | Status after Phase 1 | Evidence |
|---|---|---|
| Main-first / one owner | PASS | Exact Phase 04 paths and synchronized base are recorded |
| Spec/plan/tasks consistency | PASS pending tasks | Spec and design agree; task generation and cross-artifact analysis remain pre-code gates |
| Complete resource ownership | PASS | Data model and all contracts enumerate owned and consumed resources |
| Repository/client review | PASS | Source patterns and current Mobile/Admin mappings are named |
| Master Plan architecture | PASS | Targeted Phase 04 correction is applied; no ownership/infrastructure deviation |
| Financial/idempotency/atomicity | PASS | Ledger excluded; opening balance fails; retry ceiling and audit/outbox transactions are explicit |
| Security boundary | PASS | Exact auth/permission/MFA, forced RLS/grants, safe inputs/errors, negative tests |
| AI boundary | PASS / N/A | No AI path |
| Client boundary | PASS | Mapping/drift only |
| Verification/recovery | PASS | Commands, thresholds, environment, failure/recovery outcomes are named |

No design introduced a Constitution violation.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |
