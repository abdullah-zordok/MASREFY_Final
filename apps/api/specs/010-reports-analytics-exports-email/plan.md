# Implementation Plan: Reports, Analytics, Exports & Email Delivery

**Phase / Spec**: Phase 10 / SPEC-BE-010
**Branch**: `main`
**Base Revision**: `8d94126aef02550b56495522ab153de3834a3b66`
**Date**: 2026-09-03
**Spec**: [spec.md](spec.md)
**Input**: Backend feature specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add one `reports` NestJS module and worker that read the existing ledger and
planning projections, capture a repeatable-read immutable report snapshot, and
render it as JSON, injection-safe CSV, or Arabic/English PDF in the existing
private `report-exports` bucket. The same module owns schedule CRUD, bounded
Admin analytics/exports, short-lived download links, and TLS-only SMTP delivery
using existing identity, recent-auth, Admin/support, audit, idempotency, outbox,
Storage, configuration, observability, and worker patterns.

The shortest complete architecture uses two owned tables and two owned views,
adds no generic infrastructure, and keeps `analytics.refresh` absent because no
measurement currently justifies a materialized view. Client work adds live
adapters and parity tests but preserves explicit mock/demo provider selection for
the final SPEC-BE-014 cutover.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js 24
**Framework**: NestJS 11 with Express 5
**Primary Dependencies**: existing `pg`, NestJS, Clerk, OpenTelemetry, native
streams/crypto; add pinned `nodemailer@9.1.1` and `pdfkit@0.20.2` with their pinned
types because standards-compliant SMTP/TLS and Unicode PDF/font embedding are not
small safe stdlib utilities
**Storage**: Supabase Postgres 17, existing `report-exports` private bucket,
existing Storage REST pattern; owned `report_schedules`,
`report_output_attempts`, `v_monthly_financial_summary`, and
`v_category_spending_summary`
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP,
Supabase reset/lint, k6/query-plan performance, Mobile Jest, Admin Vitest/
Playwright/accessibility, deterministic local TLS SMTP server
**Target Platform**: existing non-root distroless API/worker image and local
Supabase CLI stack
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: Home P95/P99 <=400/800 ms and <=250 KB; cached summary
<=800/1500 ms and <=300 KB; async acceptance <=300 ms and <=50 KB; indexed OLTP
queries <=50 ms P95; bounded worker rows/bytes/memory/concurrency
**Constraints**: direct synchronized `main`; no worktree/branch; immutable
checksummed migrations; forced RLS/least grants; exact integer money; no raw
financial/provider/recipient/URL logging; repeatable-read snapshots; stable SMTP
Message-ID; no fallback transport; no new generic tables/queues/caches; no
SPEC-BE-011+ behavior
**Scale / Scope**: empty, normal, and at least 100k-transaction/large-category
owners; concurrent mutation and scheduler workers; maximum customer 100 rows per
page and Admin 200; bounded report period at one year; configured report bytes,
rows and concurrent workers

## Constitution Check

*GATE: Every item MUST pass before Phase 0 and again after Phase 1.*

- [x] The checkout is on synchronized `main`; the active diff belongs to exactly one Backend Spec.
- [x] `spec.md` is complete; this plan and later `tasks.md` have one Phase 10 boundary.
- [x] Every proposed resource is documented and owned by SPEC-BE-010 or named as a reused earlier-Spec contract.
- [x] Current API modules, migrations/evidence, Mobile `ReportsService`, report repository/mock, and Admin overview contracts were reviewed.
- [x] Master Plan API, database, Docker, performance, observability, migration, backup/recovery, rollback, and testing rules are represented.
- [x] Ledger/planning truth, immutable snapshots, idempotency, expected versions, audit, outbox, and conflict behavior are explicit.
- [x] Deny-by-default authorization, forced RLS, secret isolation, OWASP traceability, abuse limits, and release blockers are explicit.
- [x] This Spec creates no new AI behavior; optional existing AI evidence is advisory and cannot alter report truth.
- [x] Mobile/Admin work is limited to Phase 10 live adapters/contracts; production provider selection remains SPEC-BE-014.
- [x] Verification, reconciliation, rollback, recovery, provider separation, and acceptance evidence name commands and thresholds below.

## Project Structure

### Feature documentation

```text
apps/api/specs/010-reports-analytics-exports-email/
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
apps/api/
|-- src/reports/
|   |-- reports.module.ts             # API/worker composition
|   |-- reports.controller.ts         # owner HTTP surface
|   |-- reports.admin.controller.ts   # bounded Admin surface
|   |-- reports.webhook.controller.ts # optional signed delivery-status ingress
|   |-- reports.dto.ts                # strict DTOs and enums
|   |-- reports.schemas.ts            # snapshot/output validation
|   |-- reports.period.ts             # timezone/period/next-run logic
|   |-- reports.renderer.ts           # JSON/CSV/PDF streaming and safety
|   |-- reports.smtp.ts               # one TLS-only SMTP adapter
|   |-- reports.storage.ts            # report-output Storage keys/sign/delete
|   |-- reports.repository.ts         # owned SQL/functions and reused views
|   |-- reports.service.ts            # auth/idempotency/business orchestration
|   |-- reports.worker.ts             # generation/email/schedule/expiry claims
|   |-- reports.events.ts             # six safe event schemas
|   `-- reports.observability.ts       # fixed-cardinality metrics
|-- src/app.module.ts
|-- src/worker.module.ts
|-- src/platform/config/environment.schema.ts
|-- src/platform/config/environment.types.ts
|-- .env.example
|-- package.json
|-- package-lock.json
`-- nest-cli.json / report font asset wiring

supabase/
|-- migrations/20260904...phase10_reports_*.sql
|-- tests/041_phase10_reports_schema.sql
|-- tests/042_phase10_reports_rls.sql
|-- tests/043_phase10_reports_functions.sql
`-- migration-checksums.sha256

apps/api/test/{unit,contract,integration,e2e,security,performance,container}/reports/
apps/mobile/src/services/live/reports-service.ts
apps/mobile/src/services/contracts/reports-live-contract.test.ts
apps/mobile/src/storage/reports-persistence.test.ts
apps/admin-web/src/features/overview/repository.ts
apps/admin-web/src/features/overview/repository.test.ts
apps/admin-web/src/features/overview/contracts.ts
apps/admin-web/src/features/overview/report-exports.ts
apps/admin-web/tests/e2e/overview-analytics.spec.ts
ops/observability/reports-dashboard.json
ops/alerts/reports-alerts.yml
ops/runbooks/reports-*.md
```

**Structure decision**: follow the existing single-domain module pattern used by
`ai`, `tracking`, and `planning`; keep renderer, SMTP, Storage, period math, and
repository independently testable because each has a different trust/failure
boundary. Reuse shared guards/config/database/outbox/metrics rather than wrapping
them. Exact file creation is finalized in `tasks.md`; existing client paths are
modified only where current Phase 10 contracts already live.

## Ownership And Boundaries

**Owned resources**: two tables, two views, capture/claim/transition helpers,
report/dashboard/schedule/Admin export API, four jobs, six events, two cache
contracts, report output lifecycle, SMTP adapter/config, live client adapters,
Phase 10 observability/runbooks/evidence.
**Consumed contracts**: Phase 01 config/database/outbox/worker/Storage; Phase 02
identity/timezone; Phase 03 exact Admin/recent-auth/support/audit; Phase 04
currency/category/account; Phase 05 postings/balance/ledgerVersion; Phase 06
idempotency; Phase 07 salary/budget/obligation/savings views; Phase 08 tracking
freshness; Phase 09 evidence metadata.
**Explicit exclusions**: notification/support/content, billing, generic operations,
final production client cutover, arbitrary SQL/datasets/users, new queues/caches/
tables, materialized view without measured need, provider secrets/evidence.
**Client contract impact**: add and verify live report/overview/export adapters;
retain explicit mock/demo adapters and do not switch production selection.

## Phase 0: Research

[research.md](research.md) records resolved decisions for snapshot consistency,
schema ownership, schedules/timezones, rendering, SMTP/TLS and Message-ID,
Storage URLs/expiry, Admin authorization, caching, worker recovery, dependency
selection, client boundaries, and provider-independent evidence. No unresolved
clarification remains.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines both owned rows, immutable/operational
  fields, state transitions, views, logical evidence, RLS, indexes, retention,
  and migration order.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines the customer and Admin
  HTTP surface, bounded inputs, safe outputs, errors, pagination and idempotency.
- [contracts/internal-contracts.md](contracts/internal-contracts.md) defines
  snapshot, renderer, Storage, SMTP, cache, idempotency, auth, and recovery seams.
- [contracts/events-jobs.md](contracts/events-jobs.md) defines four jobs, six
  events, leases/fences/retry/dead-letter and sensitive-field exclusions.
- [contracts/mobile-admin-mapping.md](contracts/mobile-admin-mapping.md) maps the
  current client contracts without claiming Phase 14 cutover.
- [quickstart.md](quickstart.md) gives the executable validation order and
  expected evidence.

## Implementation Strategy

1. Record dependency/baseline/client evidence and write failing database tests;
   add views, tables, functions, RLS/grants/indexes and checksums.
2. Write failing unit/contract tests for periods, schemas, DTOs, snapshot
   orchestration and HTTP surface; implement the minimum report module read path.
3. Write failing renderer/Storage tests; add deterministic streamed JSON/CSV/PDF
   output, private keys/signing/expiry, and Arabic/English embedded font support.
4. Write failing SMTP and worker tests; add validated runtime config, TLS-only
   Nodemailer transport, stable Message-ID, schedule/generation/delivery/expiry
   claims, retries, leases/fences, and recovery.
5. Add bounded Admin routes and exact permission/support/audit tests; add Mobile
   and Admin live adapters plus shadow parity without provider selection changes.
6. Add performance/query-plan/stress, observability, runbooks, migration/
   rollback/recovery, security and container gates; run full local verification.
7. Run SpecKit convergence, complete every valid gap, perform clean-code/test/
   security reviews, commit/push narrow changes, monitor/fix remote CI, and record
   final external-only provider/release gates honestly.

Each implementation work package starts with one failing executable check and
ends with focused verification and a narrow commit. No task adds abstraction for
future Specs.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|------|------------------|--------------------|
| Requirements and contracts | SpecKit checklist/analyze, OpenAPI/runtime/internal/event/client drift, `npm run test:contract` | zero missing critical mapping or drift |
| Database and RLS | `npm run db:reset`, `npm run db:lint`, `npm run test:db`, live report integration/security suites | zero migration/lint/pgTAP/RLS/owner failure |
| Correctness/reconciliation | unit + live golden empty/normal/large and concurrent snapshot suites | zero amount/version/evidence mismatch |
| Security | report security suites, Gitleaks, dependency audit, image scan, OWASP matrix | zero exploitable Critical/High, BOLA, injection, URL/secret/log leak, replay acceptance |
| Performance | report k6 runner, `EXPLAIN (ANALYZE, BUFFERS)`, cache/stress/memory runs | all specified P95/P99/payload/202/query/memory bounds |
| Clients | Mobile type/lint/Jest and Admin type/lint/Vitest/build/focused Playwright/a11y | zero Phase 10 failure; no hidden fallback or persisted signed URL |
| Containers and operations | API/worker image tests, config/no-secret checks, metrics/alerts/runbook validation | non-root image; deterministic local SMTP passes; no secret |
| Rollback and recovery | migration failure/forward fix, N-1, worker crash/replay, Storage expiry, backup/restore | zero partial snapshot/file or duplicate accepted email |
| Remote delivery | push direct `main`, Backend Foundation workflow, optional immutable tag | all normal-push jobs pass; tag/provider-only evidence separately named |

## Post-Design Constitution Check

- **PASS — main/scope**: baseline SHA and protected untracked paths are recorded;
  only `apps/api/.specify/feature.json` and Phase 10 artifacts changed during design.
- **PASS — artifacts/ownership**: specification, plan, research, data model,
  contracts and quickstart define exactly the Master Plan Phase 10 ownership.
- **PASS — current contracts**: Mobile report and Admin overview surfaces are
  mapped; provider selection remains Phase 14.
- **PASS — architecture/data**: the existing modular monolith, Postgres/outbox/
  worker/Storage/Clerk boundaries are reused with no parallel infrastructure.
- **PASS — finance/concurrency**: postings and Phase 07 views remain truth;
  repeatable-read version capture and immutable retry reuse are explicit.
- **PASS — security**: forced RLS, least grants, exact permissions/support grants,
  recent auth, injection controls, private outputs, TLS SMTP and replay defenses
  are contractual and tested.
- **PASS — performance/operations**: cache keys/TTLs, exact budgets, query plans,
  bounded workers, metrics/alerts/runbooks/recovery and remote evidence are gated.
- **PASS — exclusions**: no SPEC-BE-011+ object, notification, billing, generic
  operations, or production cutover is designed.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|-----------|--------------|-------------|-----------|
| None | N/A | N/A | N/A |
