# Implementation Plan: Transactions, Ledger, Transfers & Financial Integrity

**Phase / Spec**: Phase 05 / SPEC-BE-005
**Branch**: `codex/spec-be-005` (user-authorized isolated worktree)
**Base Revision**: `dfed012743ca0c3c5f760e7b2439dbc0dae9c825`
**Date**: 2026-08-30
**Spec**: `apps/api/specs/005-transactions-ledger-integrity/spec.md`
**Input**: Backend feature specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add one concrete NestJS ledger module backed by private PostgreSQL command
functions and four Phase 05 migrations. Immutable postings are the financial
source of truth; account balances are guarded projections. Every mutation uses
one owner-level advisory lock, deterministic row locks, expected versions, a
temporary forward-compatible idempotency claim/completion record, and the
existing audit/outbox transaction pattern. Reads are owner-bounded. Admin raw
ledger access and all remaining SPEC-BE-006 behavior stay absent.

## Technical Context

**Language / Runtime**: TypeScript 5.7 on Node.js 24
**Framework**: NestJS 11, Express 5 HTTP adapter, `pg` 8
**Primary Dependencies**: existing Nest validation/Swagger, PostgreSQL client,
Node `crypto`, existing platform database/outbox/security/telemetry modules; no
new runtime dependency
**Storage**: Supabase PostgreSQL schemas `public`, `private`, and `audit`; Phase
05 tables, security-definer commands, RLS, grants, triggers, indexes, view, and
temporary `private.idempotency_keys` bridge
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP,
Supabase lint/reset, k6/EXPLAIN performance, migration/restore/recovery tests
**Target Platform**: existing non-root multi-stage backend container and hosted
Supabase/PostgreSQL deployment pipeline
**Project Type**: NestJS modular monolith with separate API and worker entry points
**Performance Goals**: P95 list/account detail <=300 ms, create <=350 ms,
transfer <=500 ms, critical database mutation <=150 ms, with specification P99
and payload ceilings; bounded reconciliation <=500 accounts per invocation; no
deadlock, lost update, unbounded query, or N+1 path
**Constraints**: safe integer minor units; same-currency transfers; append-only
postings/revisions; atomic audit/outbox/idempotency; 30-second undo; deny-by-
default RLS; no direct authenticated writes; forward-only migrations; no
automatic reconciliation repair
**Scale / Scope**: per-owner serialization, list pages <=100, reconciliation
batches default 100/max 500, release dataset 100k transactions/200k postings;
throughput beyond measured owner contention is deferred

## Constitution Check

*GATE: Every item MUST pass before Phase 0 and again after Phase 1.*

- [!] Checkout synchronization: base is synchronized released `origin/main`, but
  the user explicitly required an isolated worktree. This is the sole approved
  process deviation and is tracked below; the diff owns one Backend Spec.
- [x] `spec.md` is complete; plan and subsequent tasks use the same owned scope.
- [x] Every owned table, view, API, function, trigger, job, event, rule, and
  temporary idempotency resource is documented.
- [x] Current repository code and relevant Mobile/Admin executable contracts were
  reviewed; the Master Plan now includes verified `title`/`paymentMethod` fields.
- [x] Architecture, API, database, Docker, performance, observability, migration,
  backup/recovery, rollback, and testing rules are represented.
- [x] Posting source-of-truth, idempotency, version, lock order, atomicity, audit,
  outbox, replay, and conflict rules are explicit.
- [x] Authorization is deny-by-default; RLS, minimum grants, secret isolation,
  abuse rate limits, security matrices, and release blockers are explicit.
- [x] No AI behavior is owned; no AI path can mutate financial data.
- [x] Mobile/Admin source changes are absent; only compatibility mappings exist.
- [x] Verification, reconciliation, rollback, recovery, thresholds, and owners are
  named. External-only protected identity/provider/tag evidence remains explicit.

## Project Structure

### Feature documentation

```text
apps/api/specs/005-transactions-ledger-integrity/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/requirements.md
|-- contracts/
|   |-- openapi.yaml
|   |-- internal-contracts.md
|   |-- idempotency.md
|   |-- events.md
|   `-- client-mapping.md
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/ledger/
|-- ledger.module.ts
|-- ledger.controller.ts
|-- ledger.dto.ts
|-- idempotency.ts
|-- ledger.service.ts
|-- ledger.repository.ts
|-- ledger.events.ts
`-- ledger.worker.ts
apps/api/src/reference/reference.repository.ts       # expose existing client-scoped account insert only
apps/api/src/reference/reference.service.ts          # atomic nonzero opening handoff only
apps/api/src/app.module.ts
apps/api/src/worker.module.ts
apps/api/src/platform/http/safe-exception.filter.ts
apps/api/src/platform/observability/platform-metrics.ts
apps/api/src/platform/config/environment.schema.ts
apps/api/src/platform/config/environment.types.ts
apps/api/test/{unit,contract,integration,e2e,security,performance,container}/...
apps/api/docs/runbooks/ledger-reconciliation-recovery.md
supabase/migrations/20260830080000_phase05_idempotency_bridge.sql
supabase/migrations/20260830080100_phase05_ledger_tables.sql
supabase/migrations/20260830080200_phase05_ledger_commands.sql
supabase/migrations/20260830080300_phase05_ledger_access.sql
supabase/tests/019_ledger_idempotency.test.sql
supabase/tests/020_ledger_structure.test.sql
supabase/tests/021_ledger_commands.test.sql
supabase/tests/022_ledger_rls_grants.test.sql
supabase/migration-checksums.sha256
.github/workflows/backend-foundation.yml
docs/Back end/BACKEND_MASTER_PLAN.md
```

**Structure decision**: Reuse the existing concrete service/repository/controller,
request-context, security rate-limit, audit/outbox, worker, metrics, migration,
and test patterns. One ledger module owns all Phase 05 commands and reads. The
only cross-module code change is the smallest account-opening transaction hook;
no interface/factory or additional package is introduced.

## Ownership And Boundaries

**Owned resources**: transaction headers, immutable postings, transaction
revisions, account-balance projections and summary view, private ledger command
functions, posting/revision/projection guards, ledger endpoints, reconciliation
job/metrics/runbook, Phase 05 audit/outbox events, tests and release evidence.
**Consumed contracts**: SPEC-BE-001 request context, errors, migrations, worker,
telemetry, audit/outbox and release pipeline; SPEC-BE-002 authenticated active
profile; SPEC-BE-003 authorization/audit append and current Admin aggregate;
SPEC-BE-004 account/category/currency ownership and lifecycle.
**Explicit exclusions**: all sync cursor/client mutation/conflict/tombstone/
cleanup behavior from SPEC-BE-006; cross-currency conversion; budgeting,
obligations, subscriptions, import/capture/AI, new Admin ledger permissions,
client adapter cutover, and later Spec work.
**Client contract impact**: backend response/request mapping only. Existing
Mobile/Admin sources remain unchanged.

## Phase 0: Research

[`research.md`](research.md) resolves dependency readiness, command boundaries,
locking/version rules, immutable delta corrections, opening-entry atomicity,
idempotency compatibility, client drift, owner-bounded search, Admin denial,
rate-limit reuse, reconciliation bounds, migration order, and evidence policy.
There are no unresolved implementation clarifications.

## Phase 1: Design And Contracts

[`data-model.md`](data-model.md) defines storage, invariants, state transitions,
posting effects, and atomic command flows. [`contracts/openapi.yaml`](contracts/openapi.yaml)
is the customer HTTP contract. Internal database/lock, idempotency, event/
observability, and Mobile/Admin compatibility contracts are in `contracts/`.
[`quickstart.md`](quickstart.md) names local and external verification gates and
forbids converting gated skips into pass evidence.

## Implementation Strategy

Install and prove the temporary idempotency bridge first, then the append-only
schema and access controls while financial routes remain unavailable. Build the
ledger DTO/service/repository vertically through red-first tests, using the
private database commands as the single mutation authority. Add owner reads and
the account-opening handoff, then the bounded worker/observability/runbook.
Finally run live database, security, concurrency, performance, migration,
recovery, container, and complete regression gates before release evidence.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|------|------------------|--------------------|
| Requirements and contracts | artifact placeholder/drift checks, OpenAPI parse/drift test, `npm run typecheck`, `npm run lint`, unit/contract suites | zero placeholders/drift/errors/failures |
| Database and RLS | clean `db:reset`, `db:lint`, pgTAP 019-022, live integration/E2E owner/admin matrix, migration checksums | all pass; zero direct financial table writes or cross-owner visibility |
| Financial correctness | golden posting fixtures, replay/version/rollback/refund/reversal/undo tests, concurrent same-account/opposite-transfer tests | exact balances/postings; zero duplicate effects, lost updates, deadlocks, or partial rows |
| Security | security suites, dependency audit, workflow pin and release-gate checks | zero Critical/High finding and all denial cases pass |
| Performance | seeded k6/EXPLAIN ledger gate | P95 budgets met, approved bounded plans, no N+1/unbounded query |
| Containers and operations | API/worker/migration container tests, bounded worker test, alert/runbook review | non-root/read-only image, health/shutdown pass, batch <=500, no auto-repair |
| Rollback and recovery | disposable backup/restore, forward-correction and previous-image compatibility rehearsal | checksum/count match, reconciliation mismatch zero, no destructive down migration |
| Supply chain/release | CI image scan, CycloneDX SBOM, digest, Sigstore signature/attestation/provenance on protected tag | actual tag workflow passes; external/protected gaps remain explicit until produced |

## Post-Design Constitution Check

- PASS — all product, ownership, financial-integrity, database, security,
  operational, verification, and client-boundary gates remain satisfied by the
  design artifacts.
- PASS — the Phase 05 Master Plan now matches verified Mobile fields without
  changing later-Spec ownership.
- PASS — SPEC-BE-002 external-only evidence gaps are named and are not local
  implementation prerequisites; no protected evidence is fabricated.
- APPROVED DEVIATION — work occurs on `codex/spec-be-005` from the synchronized
  released base because the user explicitly ordered isolation. Completion must
  still integrate without history rewrite and pass every release gate.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|-----------|--------------|-------------|-----------|
| Constitution 2.0.0 main-only checkout | Newer explicit task instruction requires `superpowers:using-git-worktrees` when not already isolated; primary main also contains unrelated user work | User, 2026-08-30 task | Finish through the required branch workflow, preserve unrelated main state, integrate without rewriting history, and record the deviation in release evidence |
