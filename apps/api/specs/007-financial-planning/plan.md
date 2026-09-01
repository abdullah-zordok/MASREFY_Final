# Implementation Plan: Financial Planning

**Phase / Spec**: Phase 07 / SPEC-BE-007
**Branch**: `main`
**Base Revision**: `2eeb00bdc6687602c2fb807b88eeb1f71bfc5807`
**Date**: 2026-08-31
**Spec**: [spec.md](./spec.md)
**Input**: Backend specification, Constitution 2.0.0, Backend Master Plan, and executable Mobile planning contracts

## Summary

Add one focused NestJS planning module and the eleven Phase 07-owned normalized
tables. Reuse Phase 05 ledger commands/projections, Phase 06 durable idempotency,
the existing PostgreSQL outbox/worker/fencing patterns, request identity,
authorization, observability, and migration tooling. Implement salary cycles,
independent budgets, deterministic obligation schedules, explicit atomic payment
allocation, advisory match decisions, ledger-backed savings movements, and one
bounded Mobile aggregate. Add no new dependency, balance store, queue, cache
service, recurrence engine, or production client cutover.

## Technical Context

**Language / Runtime**: TypeScript 5.9, Node.js 24, PostgreSQL from the pinned Supabase CLI
**Framework**: NestJS 11 with Express 5 HTTP adapter; separate API and worker entry points
**Primary Dependencies**: existing NestJS, `pg`, class-validator/transformer, OpenTelemetry, Node standard library; no new package
**Storage**: eleven Phase 07 public tables, three security-invoker views, existing Phase 05 ledger/outbox/audit resources, existing Phase 06 idempotency/sync resources
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP, Supabase CLI, SQL/k6 performance, Mobile Jest contract/migration checks
**Target Platform**: current non-root immutable API/worker image and supported Supabase/PostgreSQL deployment
**Project Type**: NestJS modular monolith
**Performance Goals**: summary P95/P99 <=400/800 ms and <=250 KiB; list/detail <=300/600 ms; payment/movement <=500/900 ms
**Constraints**: exact minor-unit money; no direct ledger writes; durable idempotency; optimistic versions; deterministic locks; forced RLS; bounded periods/horizons/pages/allocations; no sensitive telemetry; no push
**Scale / Scope**: 100k ledger rows, 12 overlapping budgets, 100 obligations x 24 schedule items, 50 goals, 100 allocation rows per command, 18-month generation horizon

No technology clarification remains. Current installed versions and repository
patterns are authoritative; the plan does not assume a newer Supabase/Postgres
feature than the pinned local stack proves.

## Constitution Check

_GATE: passed before design and rechecked after contracts._

- [x] Checkout is local `main`; Phase 06 is the completed dependency; the active
  diff is Phase 07 plus the untouched user-owned `.agents/plugins/` tree.
- [x] `spec.md` and its quality checklist define one owned Phase 07 boundary.
- [x] All tables, views, functions, APIs, jobs, events, cache behavior, mappings,
  and operational contracts are documented and owned or explicitly consumed.
- [x] Current ledger/sync code, migrations, workers, tests, Mobile SQLite/domain/
  service contracts, and Admin read boundary were reviewed.
- [x] Global API, database, container, performance, observability, migration,
  backup/recovery, rollback, and test rules have executable tasks/evidence.
- [x] Ledger truth, exact money, idempotency, expected versions, deterministic
  locking, atomicity, audit/outbox, reversal, and no-LWW policies are explicit.
- [x] Deny-by-default API authorization, forced RLS, minimum grants, secret
  isolation, OWASP traceability, abuse limits, and release blockers are explicit.
- [x] No AI work or provider authority is introduced.
- [x] Client work is contract parity/dormant adapter only; Phase 14 retains live
  cutover; Admin remains permission-gated read-only.
- [x] Verification, reconciliation, rollback/recovery, thresholds, commands, and
  evidence owners are named.

The Constitution's pushed-main evidence gate cannot execute because the user
explicitly prohibited push. The implementation does not weaken that gate: local
completion records remote CI/image signature/provenance as pending and never as
passing.

## Project Structure

### Feature documentation

```text
apps/api/specs/007-financial-planning/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- internal-contracts.md
|   |-- events-jobs.md
|   `-- mobile-admin-mapping.md
|-- checklists/requirements.md
|-- evidence/
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/planning/
|-- planning.module.ts
|-- planning.controller.ts
|-- planning.dto.ts
|-- planning.service.ts
|-- planning.repository.ts
|-- planning.events.ts
|-- planning.observability.ts
`-- planning.worker.ts
apps/api/src/app.module.ts
apps/api/src/worker.module.ts
apps/api/src/sync/sync.handlers.ts
apps/api/test/{unit,contract,integration,e2e,security}/planning/
apps/api/test/performance/{planning.sql,planning.k6.js,run-planning.ts}
supabase/migrations/<timestamp>_phase07_planning_{tables,functions,access}.sql
supabase/tests/029_planning_structure.test.sql
supabase/tests/030_planning_rls_grants.test.sql
supabase/tests/031_planning_commands_views.test.sql
supabase/tests/032_planning_jobs_reconciliation.test.sql
apps/mobile/src/services/live/financial-planning-api-mapping.ts       # dormant parity mapping only if required
apps/mobile/src/services/contracts/financial-planning-api-parity.test.ts
docs/runbooks/financial-planning-operations.md
```

**Structure decision**: one planning module owns HTTP/service/repository/worker
behavior and uses existing platform modules. SQL owns constraints, RLS, atomic
commands, views, and set-based reconciliation. TypeScript owns allowlisted HTTP
normalization, principal checks, orchestration, safe error mapping, and response
shape. Derived financial formulas stay in SQL views/functions so API, later
reports, and reconciliation do not diverge.

## Ownership And Boundaries

**Owned resources**: eleven public tables, three views, Phase 07 private
commands/guards, planning routes, five jobs, planning events, summary cache
behavior, parity mapping, metrics/alerts/runbook/evidence.

**Consumed contracts**: profiles/request context (002); Admin permission/audit
(003); currencies/accounts/categories (004); transactions/postings/balances and
ledger commands/reconciliation (005); durable idempotency, sync handlers,
tombstones, mutation conflicts, and worker fences (006); platform pool/outbox/
health/migrations/image (001).

**Explicit exclusions**: Phase 08 import/parser ingestion; Phase 10 report
generation; Phase 11 reminder delivery; AI/voice execution; billing/providers;
Admin mutation; live Mobile/Admin provider selection; Redis/materialized views/
microservices/new dependencies.

**Master Plan correction**: table ownership and count stay unchanged. The Phase
07 table rows will link to [data-model.md](./data-model.md) for the minimum
current-client fields omitted by the compressed Master Plan inventory.

## Phase 0: Research

[research.md](./research.md) resolves ledger ownership, idempotency reuse, HTTP
money encoding, deterministic schedule identity, explicit payment/prepayment,
advisory matches, signed savings progress, shared view derivation, cache choice,
worker reuse, client cutover, Master Plan field parity, rollback, and
clarification decisions. No `NEEDS CLARIFICATION` remains.

## Phase 1: Design And Contracts

- [data-model.md](./data-model.md): exact columns, types, constraints, indexes,
  states, views, locks, RLS/grants, import mapping, and relationships.
- [contracts/openapi.yaml](./contracts/openapi.yaml): all owner HTTP routes,
  exact-money strings, idempotency/version headers, pagination, responses, and
  stable errors.
- [contracts/internal-contracts.md](./contracts/internal-contracts.md): command
  atomicity, lock order, ledger validation, schedule/movement derivation,
  idempotency, reconciliation, and cache rules.
- [contracts/events-jobs.md](./contracts/events-jobs.md): safe event envelopes
  and five bounded worker contracts.
- [contracts/mobile-admin-mapping.md](./contracts/mobile-admin-mapping.md): every
  executable Mobile service method/field and read-only Admin mapping.
- [quickstart.md](./quickstart.md): runnable local validation and expected
  results without production implementation bodies.

## Implementation Strategy

1. Write failing pgTAP structure/RLS tests, run them against the current reset
   database, then add the minimum ordered table migration.
2. Write failing SQL command/view tests for schedule dates, allocation totals,
   ledger ownership/currency/status, savings signs, outbox, and reconciliation;
   then implement the smallest functions/views and access migration.
3. Write failing DTO and HTTP contract tests for exact allowlists, minor strings,
   pagination, errors, auth, idempotency, and versions; then add one planning
   module/controller/service/repository using existing helpers.
4. Complete vertical slices in priority order: salary, budgets, obligations,
   payments/matches, savings, then aggregate. Each slice runs focused red/green
   unit, contract, live integration, and pgTAP tests before the next.
5. Write worker crash/retry/fence tests, then register five handlers in the
   existing worker process and reuse current outbox/health/telemetry primitives.
6. Add Phase 06 sync handler registrations and a dormant Mobile/API parity
   mapping only after contract tests demonstrate a real gap; do not switch the
   active client provider.
7. Add production-like query-plan/load tests, reconciliation/recovery/migration
   rehearsal, observability/runbook/evidence, review gates, and full repository
   verification before scoped local commits.

## TDD Boundaries

- Each production branch/function starts with one behavior-focused failing test
  whose failure is caused by missing Phase 07 behavior, not a typo or framework.
- Database behavior uses real migrated PostgreSQL/pgTAP; repositories are not
  mocked when SQL is the subject.
- Unit tests use real DTO/domain values and mock only the database/clock boundary
  when persistence/time is not the subject.
- Variants use table-driven cases; no snapshot/source-text/framework guarantee
  tests; every test names the production break it detects.
- Regression fixes discovered during implementation receive a failing
  reproduction before the fix.

## Migration Sequence

1. `phase07_planning_tables`: roots, dependents, constraints, indexes, ownership
   consistency guards, forced RLS, trigger attachment, and revoked defaults.
2. `phase07_planning_functions`: deterministic schedule/payment/savings/root
   commands, security-invoker views, reconciliation, audit/outbox integration.
3. `phase07_planning_access`: minimum grants, policies, permission seed/update,
   worker job registration, sync metadata, and safe lifecycle hooks.
4. Any repair is a new forward migration. Existing files/checksums never change
   after acceptance.

## API And Service Flow

```text
Clerk principal + request ID + Idempotency-Key
  -> PlanningController allowlisted DTO normalization
  -> PlanningService active-profile / permission / command selection
  -> Phase 06 idempotency reserve-or-replay
  -> PlanningRepository SQL transaction / owned private function
  -> root + dependents + audit + outbox atomically
  -> durable response receipt
  -> safe exact-money response / stable error envelope
```

Reads authenticate first, validate bounded cursor/period, set the request
principal in the PostgreSQL session, query owner-scoped views, and serialize
`int8` as canonical strings. Admin reads take a separate permission-checked
path; no owner route trusts caller-selected `userId`.

## Worker And Recovery Flow

Workers claim bounded work with existing leases/fences, derive a deterministic
natural key, invoke an idempotent function, record safe counts/error codes, and
complete with the same fence. Crash recovery reclaims expired leases; poison
items exhaust to visible terminal state/alert. Reconciliation compares ledger
and planning derivations and repairs only reconstructable projections.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Requirements/contracts | checklist, OpenAPI drift, Mobile/Admin parity, FR/AC/SC matrix | zero drift, placeholder, or unmapped buildable requirement |
| Database/RLS | reset, lint, 029-032 pgTAP, live integration/E2E | zero Phase 07 failure/skip; all negative access denied |
| Financial safety | exact money, idempotency, version, concurrency, failure injection, reversal, reconciliation | zero duplicate/partial/implicit financial effect |
| Security/privacy | ownership/property tests, grants/function inventory, SAST/dependencies/secrets, OWASP traceability | zero exploitable Critical/High, bypass, or sensitive leak |
| Performance | representative SQL plans and k6 runner | all P95/P99/payload/page/horizon thresholds; required indexes used |
| Workers/operations | retry/fence/crash/poison/shutdown/health/metric/alert tests | no duplicate/lost/invisible work or high-cardinality data |
| Migration/recovery | apply/checksum/N-1/failed-forward-fix/import/quarantine/backup/restore/rollback | no lost ledger/planning row or unexplained drift |
| Clients | Mobile service/type/method mapping and representative SQLite export import; Admin permission/read mapping | all current fields mapped; active provider unchanged |
| Full repository | API verify, DB, security, Mobile serial tests/type/lint, format, container/image, diff/scope audit | all locally executable gates pass |

Remote workflow, registry, tag, SBOM publication, signature, and provenance
results remain explicit pending because push is prohibited.

## Post-Design Constitution Check

| Gate | Result | Design evidence |
|---|---|---|
| Local main and one active Spec | PASS | baseline, feature pointer, scoped paths |
| Complete consistent artifacts | PASS | spec/research/model/contracts/quickstart/tasks workflow |
| Exclusive ownership | PASS | eleven owned tables; ledger/sync/report/notification boundaries retained |
| Current contracts reviewed | PASS | research sources and parity contract |
| Global architecture | PASS | technical context, structure, migrations, evidence |
| Financial integrity | PASS | ledger references, exact money, idempotency, locks, atomic commands |
| Security/RLS/secrets/abuse | PASS | model, OpenAPI/internal contracts, negative gates |
| AI policy | PASS (not applicable) | no AI work |
| Client boundary | PASS | dormant parity only; no provider cutover/Admin mutation |
| Verification/recovery | PASS | named thresholds, commands, and evidence owners |
| Remote delivery | PENDING BY USER CONSTRAINT | no push; never claimed passed |

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |
