# Implementation Plan: Offline Sync, Idempotency & Conflict Resolution

**Phase / Spec**: Phase 06 / SPEC-BE-006
**Branch**: `main`
**Base Revision**: `3e685e0a19cfa6854c15728b47854ce74be7391e`
**Date**: 2026-08-31
**Spec**: [spec.md](./spec.md)
**Input**: Backend specification, Constitution 2.0.0, and Backend Master Plan

## Summary

Extend the Phase 05 idempotency bridge with fenced leases and bounded cleanup;
add the three remaining Phase 06 server tables; derive immutable, per-user/domain
cursor changes from the existing private outbox; expose bounded bootstrap/delta/
mutation/ack/conflict APIs; run four leased workers; and add an additive Mobile
SQLite sync layer. Existing reference and ledger commands remain the sole domain
writers. No fifth sync table, Redis, new queue system, or Admin sync client is
introduced.

## Technical Context

**Language / Runtime**: TypeScript 5.9, Node.js 24; PostgreSQL supplied by the pinned local Supabase CLI stack
**Framework**: NestJS 11 with Express 5 HTTP adapter
**Primary Dependencies**: existing NestJS, `pg`, class-validator/transformer, OpenTelemetry, Node `crypto`; no new package
**Storage**: Supabase Postgres `private.idempotency_keys`, `public.client_mutations`, `public.client_sync_state`, `public.transaction_conflicts`, existing outbox/audit/domain tables; Expo SQLite schema v10
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP, Supabase CLI migration tests, k6/SQL performance, Mobile Jest SQLite tests
**Target Platform**: existing non-root immutable API/worker image plus official Supabase deployment
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: delta P95 <=500 ms/500 changes/512 KB compressed; mutation batch P95 <=800 ms; critical indexed DB queries P95 <=50 ms
**Constraints**: no duplicate financial effect; no financial LWW; FORCE RLS and direct-write revocation; 30-day minimum replay/tombstone window; additive checksum migrations; no secrets or raw payload telemetry; no push
**Scale / Scope**: 100,000 resources per test user, 500-change pages, 100-operation batches, concurrent devices/workers; Phase 04/05 handler registrations only

Supabase changelog review on 2026-08-31 found no Phase 06-breaking RLS/function
change. Relevant current changes are explicit Data API exposure for new tables,
Postgres 17 as the self-hosted default, and historical `pgmq` delay-version risk.
This plan uses explicit grants, does not expose write operations through the Data
API, and uses the repository-pinned CLI/runtime rather than assuming a version.

## Constitution Check

_GATE: Every item passed before Phase 0 and is rechecked after Phase 1._

- [x] Checkout is synchronized `main`; the active diff is only SPEC-BE-006 plus the existing user-owned `.agents/plugins/` tree.
- [x] `spec.md` is complete; this plan and later tasks use the same owned scope.
- [x] Every proposed table, function, trigger/index, API, job, event, Mobile adapter, and business rule is documented and Phase 06-owned or explicitly consumed.
- [x] Current API code, migrations, Phase 05 bridge, ledger flow, Mobile SQLite v9, service contracts, and prior completion evidence were reviewed.
- [x] Master Plan API/database/performance/observability/migration/recovery/testing rules are represented.
- [x] Ledger source-of-truth, idempotency, versions, atomicity, audit/outbox, tombstones, and conflict rules are explicit.
- [x] Deny-by-default authorization, FORCE RLS, secret isolation, OWASP/MASVS traceability, abuse controls, and release blockers are explicit.
- [x] No AI work exists.
- [x] Mobile changes are strictly required Phase 06 adapters; Admin changes are absent.
- [x] Verification, reconciliation, rollback/recovery, thresholds, commands, and evidence owners are named.

No Constitution deviation is approved or required. The user's explicit no-push
instruction creates an external-evidence gap, not an implementation exception.

## Project Structure

### Feature documentation

```text
apps/api/specs/006-offline-sync-idempotency/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- internal-contracts.md
|   |-- events-jobs.md
|   `-- mobile-sync.md
|-- checklists/requirements.md
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/sync/
|-- sync.module.ts
|-- sync.controller.ts
|-- conflicts.controller.ts
|-- sync.service.ts
|-- sync.repository.ts
|-- sync.dto.ts
|-- sync.contracts.ts
|-- sync.events.ts
|-- sync.observability.ts
`-- sync.worker.ts
apps/api/src/ledger/idempotency.ts              # reuse canonical hashing
apps/api/src/platform/http/safe-exception.filter.ts
apps/api/src/app.module.ts
apps/api/src/worker.module.ts
apps/api/test/{unit,contract,integration,e2e,security,performance}/sync/
supabase/migrations/<generated>_phase06_*.sql
supabase/tests/023_phase06_idempotency.test.sql
supabase/tests/024_phase06_sync_structure.test.sql
supabase/tests/025_phase06_sync_rls.test.sql
supabase/tests/026_phase06_sync_functions.test.sql
apps/mobile/src/storage/database.ts              # additive migration 10
apps/mobile/src/storage/sync-repository.ts
apps/mobile/src/services/contracts/sync-service.ts
apps/mobile/src/services/live/sync-service.ts
apps/mobile/src/domain/sync.ts
apps/mobile/src/**/sync*.test.ts
docs/Back end/runbooks/spec-be-006-*.md
```

**Structure decision**: Add one focused NestJS sync module and one Mobile sync
repository/contract. Reuse the existing pool, request context, auth/device,
idempotency hashing, audit/outbox, worker loop, telemetry, errors, and domain
commands. SQL remains in ordered root migrations/tests. No generic framework or
new dependency is justified.

## Ownership And Boundaries

**Owned resources**: the four Master Plan tables, Phase 06 functions/guards and
outbox enrichment/index objects, seven endpoints, four jobs, five event types,
Mobile sync metadata/adapters, telemetry/runbooks/evidence.

**Consumed contracts**: profile/device ownership and revocation (002), audit/RLS
request context (003), account/category commands and events (004), all ledger
commands/versions/idempotency behavior (005), outbox/worker/migration/health
primitives (001).

**Explicit exclusions**: later domains/handlers, full Mobile cutover, all Admin
sync behavior, alternative idempotency/change storage, Realtime sync, Redis,
cross-currency or new financial commands.

**Client contract impact**: additive Mobile sync adapter only. Existing demo/mock
providers remain. Production-wide provider selection and mock removal stay 014.

## Phase 0: Research

[research.md](./research.md) records resolved decisions for idempotency fencing,
outbox-backed cursor allocation, deterministic snapshots/tombstones, partial
batches, conflict policy, worker leasing, Mobile migration, retention, security,
performance, and current Supabase changes. No `NEEDS CLARIFICATION` remains.

## Phase 1: Design And Contracts

- [data-model.md](./data-model.md): exact server and Mobile entities, keys,
  constraints, indexes, states, retention, and relationships.
- [contracts/openapi.yaml](./contracts/openapi.yaml): seven HTTP contracts,
  pagination/cursors, DTO limits, responses, and stable errors.
- [contracts/internal-contracts.md](./contracts/internal-contracts.md): fencing,
  cursor/outbox capture, handler registry, atomicity, and conflict rules.
- [contracts/events-jobs.md](./contracts/events-jobs.md): event schemas and four
  worker lease/retry/dead-letter contracts.
- [contracts/mobile-sync.md](./contracts/mobile-sync.md): SQLite migration and
  adapter transaction boundaries.
- [quickstart.md](./quickstart.md): runnable validation sequence and expected
  evidence without implementation code.

## Implementation Strategy

1. Write failing pgTAP/unit tests for bridge compatibility, lease fencing,
   cleanup, exact schemas, RLS/grants, cursors, and outbox capture.
2. Generate migrations using `supabase migration new`; evolve idempotency, then
   create mutation/state/conflict resources and security in dependency order.
3. Write failing API/service/repository tests, then add the smallest sync module
   that calls current domain commands and stores/replays each operation.
4. Write worker failure/redelivery tests, then register four job handlers using
   existing worker lifecycle and `FOR UPDATE SKIP LOCKED` bounded claims.
5. Write Mobile v9-upgrade/power-loss tests, then add migration 10, queue/cursor/
   ID-map persistence, and live adapter without selecting it in production.
6. Add query-plan/load, recovery, observability, runbook, contract, and evidence
   artifacts; run focused gates after each slice and full gates at completion.

## Evidence Plan

| Gate                   | Planned evidence                                                               | Blocking threshold                                     |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Requirements/contracts | checklist, OpenAPI drift, contract tests, FR/AC/SC matrix                      | zero drift or unmapped requirement                     |
| Database/RLS           | `npm run db:reset`, `npm run db:lint`, `npm run test:db`, live integration/E2E | zero failure/skip in Phase 06; all negative cases deny |
| Financial safety       | idempotency/concurrency/redelivery/failure-injection/reconciliation tests      | zero duplicate or partial financial effect             |
| Security               | scope/ownership tests, SAST, dependency/secret scans, OWASP traceability       | zero exploitable Critical/High or authorization bypass |
| Performance            | sync SQL `EXPLAIN (ANALYZE, BUFFERS)` and k6/load runner                       | delta/batch/payload/DB budgets; no unbounded/N+1       |
| Mobile                 | populated v9 upgrade plus queue/cursor/tombstone/conflict/restart tests        | zero lost row/pending operation; no silent rounding    |
| Workers/operations     | lease/retry/dead-letter/shutdown/log/metric/alert tests                        | no lost/stuck invisible work or sensitive telemetry    |
| Rollback/recovery      | migration/checksum/backup, N-1, failure/forward-fix and local-only rehearsal   | all durable server/Mobile state retained               |
| Full repository        | `npm run verify`, database, security, Mobile quality gates, `git diff --check` | all locally executable gates pass                      |

External provider/tag-only/remote workflow results are recorded separately and
never inferred. No push occurs under this goal.

## Post-Design Constitution Check

| Gate                                  | Result                | Design evidence                                          |
| ------------------------------------- | --------------------- | -------------------------------------------------------- |
| Synchronized main and one active Spec | PASS                  | baseline above; scoped feature pointer/diff              |
| Complete consistent artifacts         | PASS                  | spec, plan, research, model, contracts, quickstart       |
| Exclusive ownership                   | PASS                  | no fifth table; domain/outbox/audit writers remain owned |
| Current contracts reviewed            | PASS                  | dependency and Mobile baseline sections                  |
| Global architecture represented       | PASS                  | technical context, strategy, evidence plan               |
| Financial integrity                   | PASS                  | existing commands plus fenced replay/conflicts           |
| Security/RLS/secrets/abuse            | PASS                  | data model, contracts, evidence gates                    |
| AI policy                             | PASS (not applicable) | no AI change                                             |
| Client boundaries                     | PASS                  | additive Mobile only; no Admin/cutover                   |
| Verification/recovery                 | PASS                  | named evidence and quickstart                            |

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
| --------- | ------------ | ----------- | --------- |
| None      | N/A          | N/A         | N/A       |

## 2026-09-06 Additive Account Projection

Extend the existing account bootstrap projection and outbox sync metadata
trigger with `automatic_tracking_enabled`. Reuse current cursor, delta,
tombstone, and conflict behavior; add no sync resource or queue.

## 2026-09-06 Credit-Card Terms Projection

Extend the same account bootstrap and upsert-delta snapshots with the four
nullable card-term fields. Older snapshots map omitted fields to null, while
account tombstones remain snapshot-free. No new sync domain, queue, or conflict
subsystem is introduced.
