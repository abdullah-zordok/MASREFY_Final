# Implementation Plan: Tracking, Imports, Parsers & Deduplication

**Phase / Spec**: Phase 08 / SPEC-BE-008  
**Branch**: `main`  
**Base Revision**: `49f38b72f230a317a6b271dde6612030eeaa7d55`  
**Date**: 2026-09-02  
**Spec**: [spec.md](./spec.md)  
**Input**: Backend specification, Constitution 2.0.0, complete Backend Master
Plan, and executable Mobile/Admin tracking/import/parser contracts

## Summary

Add one tracking module around nineteen Phase 08 tables. Reuse the existing
PostgreSQL database/RLS boundary, private Storage bucket, outbox, worker
dispatcher, Admin guard/audit, SPEC-BE-005 ledger command, and SPEC-BE-006
idempotency/sync primitives. Accept normalized JSON and bounded UTF-8 CSV;
reject rather than speculatively parse archive, executable, XML, PDF, image, and
voice formats. Implement a constrained data-only parser DSL, deterministic
rules/duplicate explanations, review-first acceptance, history/feedback, and
minimal Mobile/Admin live adapters. Add no runtime dependency, direct ledger
write, dynamic parser execution, new queue/cache/store, or SPEC-BE-009 feature.

## Technical Context

**Language / Runtime**: TypeScript 5.9, Node.js 24, PostgreSQL from the pinned
Supabase CLI; SQL/PLpgSQL for constraints and atomic commands  
**Framework**: NestJS 11 with Express 5; separate API, worker, and migration
entry points  
**Primary Dependencies**: existing NestJS, `pg`, class-validator/transformer,
OpenTelemetry, Node `crypto`, streams, URL, and text-decoding APIs; existing
Mobile/Admin dependencies only; no new package  
**Storage**: nineteen Phase 08 tables; existing `private-ingestion`-appropriate
Storage boundary, profiles/reference/ledger/sync/audit/outbox resources  
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP,
Supabase CLI, SQL plans, k6, Mobile Jest, Admin Vitest/Playwright if already
configured, dependency/secret/image scans  
**Target Platform**: current non-root immutable API/worker image and supported
Supabase/PostgreSQL deployment  
**Project Type**: NestJS modular monolith with existing Mobile and Admin clients  
**Performance Goals**: intake P95/P99 <=300/750 ms; reads <=500/1000 ms;
duplicate batch P95 <=250 ms; 10k-row async processing with measured bounded
memory/connections and no critical-path active sequential scan  
**Constraints**: hostile input; UTF-8 CSV/JSON only initially; integer minor
units; review-first default; forced RLS; exact Admin permissions; immutable
parser versions; deterministic rules/scores; bounded content/corpus/pages/jobs;
SPEC-BE-005 command-only acceptance; SPEC-BE-006 replay; no secrets/raw telemetry  
**Scale / Scope**: one UTF-8 CSV file/request up to 6 MiB and 10,000 rows;
normalized JSON up to 100 events and 512 KiB/request; one-million-row history plan
fixture, 100 rows/page, 100 job rows/claim, 12 DSL clauses per section, 2,000-byte
normalized message body, 30-day
default raw retention, 24-hour default duplicate window

No technology clarification remains. Existing versions and patterns are
authoritative. Deployment-owned provider credentials are external activation
evidence, not a design unknown.

## Constitution Check

_GATE: passed before research and rechecked after design._

- [x] Checkout is synchronized `main`; active work is Phase 08 plus the preceding
  scoped Outbox fix and untouched `.agents/plugins/`.
- [x] `spec.md` defines one Phase 08 boundary with no clarification marker.
- [x] All nineteen tables, functions, APIs, jobs, events, rules, retention,
  caches, Storage use, and business invariants are owned or explicitly consumed.
- [x] Existing API/worker/migrations plus Mobile automatic-tracking and Admin
  imports/parsers contracts were reviewed.
- [x] Master Plan architecture, database, API, container, performance,
  observability, migration, recovery, rollback, and test rules are represented.
- [x] Exact money, ledger source of truth, Phase 06 idempotency, versions, locks,
  atomicity, audit/outbox/history, and conflicts are explicit.
- [x] Deny-by-default authorization, forced RLS, service-role limits, secret/raw
  isolation, hostile input, OWASP/MASVS controls, abuse limits, and blockers are
  explicit.
- [x] No AI or voice implementation is introduced; those remain SPEC-BE-009.
- [x] Mobile/Admin changes are limited to the fixture/service replacement the
  Phase 08 Master Plan explicitly owns.
- [x] Verification names commands, environments, thresholds, evidence, rollback,
  reconciliation, and genuine external gates.

## Project Structure

### Feature documentation

```text
apps/api/specs/008-tracking-imports-deduplication/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- parser-dsl.md
|   |-- internal-contracts.md
|   |-- events-jobs.md
|   `-- mobile-admin-mapping.md
|-- checklists/
|-- evidence/
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/tracking/
|-- tracking.module.ts
|-- tracking.controller.ts
|-- tracking.admin.controller.ts
|-- tracking.dto.ts
|-- tracking.service.ts
|-- tracking.repository.ts
|-- tracking.parser.ts
|-- tracking.rules.ts
|-- tracking.duplicates.ts
|-- tracking.events.ts
|-- tracking.observability.ts
`-- tracking.worker.ts
apps/api/src/{app.module.ts,worker.module.ts}
apps/api/src/security/permission-manifest.ts
apps/api/src/sync/sync.handlers.ts
apps/api/src/platform/errors/*
apps/api/test/{unit,contract,integration,e2e,security}/tracking/
apps/api/test/performance/{tracking.sql,tracking.k6.js,run-tracking.ts}
supabase/migrations/<timestamp>_phase08_tracking_{reference,tables,functions,access,seeds}.sql
supabase/tests/033_tracking_structure.test.sql
supabase/tests/034_tracking_rls_grants.test.sql
supabase/tests/035_tracking_commands.test.sql
supabase/tests/036_tracking_parser_dedup.test.sql
supabase/tests/037_tracking_workers_recovery.test.sql
apps/mobile/src/services/live/automatic-tracking-api-service.ts
apps/mobile/src/services/contracts/automatic-tracking-service.ts
apps/mobile/src/services/automatic-tracking-service.ts
apps/mobile/src/services/contracts/automatic-tracking-api-parity.test.ts
apps/admin-web/src/features/imports/{contracts.ts,repository.ts}
apps/admin-web/src/tests/imports-live-contract.test.ts
docs/runbooks/tracking-import-operations.md
```

**Structure decision**: one backend module owns Phase 08 HTTP, parser/rules,
repository, observability, and worker behavior. PostgreSQL owns integrity, RLS,
state transitions, duplicate candidate query, and transactionally coupled audit/
outbox/history. TypeScript owns streaming hostile-input validation, constrained
CSV/JSON decoding, DSL interpretation, orchestration, stable errors, and response
redaction. Existing client service contracts stay stable; live adapters translate
backend resources rather than duplicate domain policy.

## Ownership And Boundaries

**Owned resources**: nineteen tables, tracking/import/review/duplicate routes,
Admin import/parser/rule routes, bounded job handlers and allowlisted event types, constrained DSL,
reference seeds, Mobile/Admin adapter replacement, metrics/alerts/runbook/evidence.

**Consumed contracts**: platform database/outbox/queue/Storage/telemetry (001);
verified owner/profile/preferences/devices (002); Admin permissions, recent auth,
purpose, audit/privacy (003); country/currency/category/account (004); ledger
create/undo/update and reconciliation (005); idempotency/sync/fences/conflicts
(006); planning match enrichment only (007).

**Explicit exclusions**: device SMS capture; PDF/image/OCR/archive/XML parsing;
voice/AI; arbitrary code; notification delivery; subscription/report/support;
direct ledger/planning writes; new infrastructure; Phase 14-wide cutover.

**Client contract impact**: Mobile adds `live` to the automatic-tracking
capability, implements the existing methods using Phase 08/06 APIs, and keeps
mock data test/demo-only. Admin's existing `phase4Repository` becomes the live
contract baseline with route/schema normalization; MSW handlers remain tests only.

## Phase 0: Research

[research.md](./research.md) resolves file-format scope, parser DSL, regex
safety, canonical normalization/hashes, duplicate scoring, review/ledger command
flow, idempotency, worker recovery, raw retention, RLS/service-role boundaries,
Admin permission mapping, Mobile method mapping, seeds, performance, and rollback.
No `NEEDS CLARIFICATION` remains.

## Phase 1: Design And Contracts

- [data-model.md](./data-model.md): exact tables, fields, constraints, indexes,
  states, relationships, ownership, locks, retention, and seed identities.
- [contracts/openapi.yaml](./contracts/openapi.yaml): customer and Admin routes,
  strict DTOs, cursors, versions/idempotency, safe responses, and stable errors.
- [contracts/parser-dsl.md](./contracts/parser-dsl.md): bounded JSON grammar,
  operators, captures, normalization, output, safety, and corpus examples.
- [contracts/internal-contracts.md](./contracts/internal-contracts.md): intake,
  normalization, rules, dedup, review, ledger/idempotency, retention, and
  reconciliation invariants.
- [contracts/events-jobs.md](./contracts/events-jobs.md): eight safe event schemas
  and six bounded worker protocols.
- [contracts/mobile-admin-mapping.md](./contracts/mobile-admin-mapping.md): every
  executable client method/resource/permission and fixture/seed boundary.
- [quickstart.md](./quickstart.md): runnable validation and expected outcomes.

## Implementation Strategy

1. Capture dependency and current-client evidence; add failing pgTAP inventory/
   RLS tests, then create reference/table/access migrations in FK order.
2. Add failing SQL tests for transitions, ownership, deterministic rules/scores,
   parser publication, review acceptance, history, purge, and reconciliation;
   implement minimum private functions and reference/draft corpus seeds.
3. Add failing DTO/parser/security tests, then implement bounded normalized JSON
   and streaming UTF-8 CSV intake plus constrained DSL. Unsupported formats take
   one safe path rather than speculative parsers.
4. Complete vertical slices: preferences/rules; intake/status; processing/parser;
   duplicates; reviews/edited acceptance; history/feedback; Admin operations.
   Each slice runs focused red/green unit, contract, pgTAP, live integration, and
   E2E evidence before the next.
5. Register six handlers in the existing worker dispatcher with current lease,
   retry, fence, health, telemetry, audit/outbox, and shutdown primitives.
6. Add the smallest Mobile live adapter and Admin route/schema corrections only
   after parity tests name actual mismatches; keep test/demo mocks isolated.
7. Run corpus/security/property, query-plan/load/stress, migration/rollback/
   recovery/reconciliation, review skills, full local gates, scoped commits,
   direct push, and remote workflow repair until green.

## TDD Boundaries

- Each nontrivial production behavior begins with one failing behavior test;
  database semantics use real PostgreSQL rather than SQL mocks.
- Expected hashes, scores, normalization, state results, and parser outputs are
  hand-derived literals. Tests do not mirror production helpers or grep source.
- Mocks stop at real external boundaries: provider fetch, clock,
  and HTTP transport. Database/audit/outbox/ledger/idempotency side effects remain
  real in integration tests.
- Hostile fixtures are synthetic and contain no secrets or real customer data.
- Any regression found in implementation/CI receives a minimal failing
  reproduction before its forward fix.

## Migration Sequence

1. `phase08_tracking_tables`: all 19 reference/owner/private tables, constraints,
   indexes, ownership links, and triggers in dependency order.
2. `phase08_tracking_functions`: guarded commands, deterministic rule/dedup
   functions, claims/transitions, parser publication, purge, and reconciliation.
3. `phase08_tracking_access_seeds`: forced RLS, revoked defaults, minimum grants,
   stable fictional reference/corpus seeds, and publication only through the same
   passing-corpus invariant used at runtime.
4. Any defect is repaired in a new forward migration; accepted migrations and
   checksums are never edited.

## Intake, Review, And Ledger Flow

```text
Clerk owner + Idempotency-Key + bounded JSON/CSV
  -> DTO/media/magic/encoding/size hostile-input validation
  -> Phase 06 reserve-or-replay
  -> session + opaque raw reference + import.received atomically
  -> import.process lease/fence
  -> institution/parser version -> normalization -> user/global rules
  -> duplicate.detect -> review-required/default policy
  -> owner decision + current ownership/version/duplicate checks
  -> SPEC-BE-005 create command (only financial write)
  -> durable receipt + audit + outbox + history + safe response
```

Marking duplicate links an existing owned transaction and never calls create.
Auto-accept uses the identical final validation/command path and remains disabled
unless the owner explicitly enables a policy that satisfies every guard.

## Parser And Worker Flow

The parser interpreter reads validated JSON DSL only. Match operators are exact,
contains, starts-with, and bounded safe-pattern. Captures use named literal/token
boundaries rather than general regex execution. Normalizers are a fixed enum;
output fields are allowlisted. Each case runs with byte/token/time ceilings.

Workers claim at most 100 rows, write an immutable attempt, process streaming
batches, heartbeat/fence, and complete atomically with safe counts. Expired
leases are reclaimed; poison work reaches terminal state after the shared retry
ceiling. Raw purge and history compaction use cursor batches and record safe
counts. Reconciliation detects drift and only repairs derived counters/links that
can be reconstructed without changing immutable decisions or ledger truth.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Requirements/contracts | quality checklist, YAML parse, unique operations, FR/AC/SC/tasks trace | zero marker, drift, orphan, or out-of-scope path |
| Database/RLS | reset, lint, pgTAP 033-036, live owner/Admin/worker matrices | 19 tables; zero failure/skip/bypass |
| Financial safety | ledger command spy/live rows, idempotency, concurrency, duplicate/review races, reconciliation | zero direct/duplicate/partial financial write |
| Parser/input security | normal/boundary/adversarial corpus, BOLA/BFLA, grant inventory, SAST/dependency/secret scans | zero executable parser, unsafe accepted input, leak, Critical/High |
| Performance/stress | one-million history, 10k CSV, SQL EXPLAIN, k6 intake/read/worker/outage/replay | every P95/P99/payload/memory/connection/index budget passes |
| Clients | Mobile type/lint/Jest/parity/provider test; Admin type/lint/Vitest/build/route contract | production adapters use live contract; mocks test/demo only |
| Migration/recovery | checksum, clean/repeat/N-1/failed-forward, parser rollback, backup/restore, purge/reconcile | no data/trace loss or unowned mutation |
| Containers/operations | API verify, image/container/non-root, metrics/alerts/runbooks/tabletop | all locally executable gates pass |
| Remote | pushed main workflow, image scan, SBOM/signature/provenance where triggered | all required jobs green or proven external-only |

## Post-Design Constitution Check

| Gate | Result | Design evidence |
|---|---|---|
| Main and single Spec | PASS | base revision, feature pointer, scoped structure |
| Complete consistent artifacts | PASS | spec/research/model/contracts/quickstart |
| Exclusive ownership | PASS | nineteen owned tables; prior/later boundaries retained |
| Current clients reviewed | PASS | research and Mobile/Admin mapping |
| Architecture/operations | PASS | context, structure, migrations, evidence plan |
| Financial integrity | PASS | command-only flow, exact money, replay, locks, audit/outbox |
| Security/RLS/secrets/abuse | PASS | hostile-input, parser, model, API and negative gates |
| AI policy | PASS (not applicable) | voice/AI formats explicitly unsupported/deferred |
| Client boundary | PASS | only Phase 08-owned adapter/fixture replacement |
| Verification/recovery | PASS | thresholds, commands, rollback and evidence owners named |
| Direct delivery | PASS (pending execution) | direct main push authorized; no PR/worktree planned |

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |
