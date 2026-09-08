# Implementation Plan: Client Cutover, Mock Migration & Free-Only MVP Production Readiness

**Phase / Spec**: Phase 14 / SPEC-BE-014
**Branch**: `main`
**Base Revision**: `65bc5fd2f8875c72c9885787e5c021e4c2576d09`
**Date**: 2026-09-08
**Spec**: [spec.md](spec.md)
**Input**: Backend feature specification, `docs/Back end/BACKEND_MASTER_PLAN.md`, and the approved Phase 14 brief

## Summary

Cut over the existing Mobile service boundaries and Admin repositories to accepted live contracts in nine ordered waves. Reuse the existing API, SQLite repositories, client contracts, Zod validation, mock fixtures, and domain tests; add only explicit production configuration, strict adapters, redacted comparison, rollback controls, and evidence. Repair concrete contract defects in their owning Specs before accepting the affected wave. Do not add Phase 14 database or backend domain resources.

## Technical Context

**Language / Runtime**: TypeScript 5.9; Node.js 24; React Native 0.83 with Expo 55; React 19.2; current repository-resolved Next.js App Router
**Framework**: NestJS 11 with Express 5; Expo Router; Next.js App Router
**Primary Dependencies**: Existing `zod`, `expo-secure-store`, `expo-sqlite`, `expo-crypto`, React Query, MSW, Jest, Vitest, Playwright, and Node crypto; add the official Clerk Expo and Next.js SDKs only because no installed dependency can issue/refresh Clerk session tokens
**Storage**: Consume existing Supabase/PostgreSQL resources from Specs 001-011/013 and existing Mobile SQLite; correct owner isolation and SQLCipher configuration in the Mobile-owned boundary without adding a Phase 14 backend schema, Supabase migration, policy, or persistent cutover store
**Testing**: Existing API Jest projects, Supabase reset/lint/pgTAP, Mobile Jest/typecheck/lint/boundary checks, Admin Vitest/build/Playwright, contract-instance tests, static scans, provider failure tests, performance/stress/recovery, and independent review
**Target Platform**: Existing non-root API/worker/migration container targets, Expo Android/iOS clients, and Next.js Admin deployment
**Project Type**: Existing modular monolith backend with separate API/worker and two client applications
**Performance Goals**: Preserve every owning Spec's P95/P99, payload, pagination, query, cache, sync, queue, report, and AI budgets; financial shadow comparison has zero tolerance
**Constraints**: Direct synchronized `main`; nine sequential wave commits and remote gates; production live-only; strict unknown-state failure; owner corrections stay with existing Specs; preserved dirty files excluded by path/hunk staging; no billing or post-MVP work
**Scale / Scope**: Every active Mobile service call and non-billing Admin repository operation, all current routes/viewports, full RLS/grant matrix, existing release workflows, and explicit external gates

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1.*

- [x] The checkout is synchronized on `main`; Phase 14-authored changes are path-scoped, and pre-existing user changes are recorded and excluded.
- [x] `spec.md` is complete; this plan and the forthcoming `tasks.md` use the same nine-wave order and exclusions.
- [x] Owned resources are exhaustively stated: client adapters/configuration/evidence only; every consumed backend object retains its existing Spec owner.
- [x] Current API artifacts, Mobile/Admin contracts, repositories, mock boundaries, storage/sync boundaries, workflows, operations evidence, and recent history were reviewed or assigned to independent full-read review before implementation.
- [x] Master Plan rules for API/database/Docker/performance/observability/migration/recovery/rollback/testing are represented without adding new Phase 14 infrastructure.
- [x] Integer money, postings source-of-truth, idempotency, expected versions, atomicity, audit/outbox, exact reconciliation, and no financial Last Write Wins are explicit.
- [x] Deny-by-default authorization, RLS, secret isolation, OWASP traceability, abuse controls, strict decoding, and zero exploitable Critical/High findings are release gates.
- [x] AI remains server-routed through OpenRouter, advisory, privacy-gated, quota-bounded, and unable to mutate finance without validated confirmation.
- [x] Mobile/Admin changes are explicitly owned cutover work; backend corrections are limited to root causes in the prior owning Spec.
- [x] Every wave and final closeout names local commands, thresholds, independent review, rollback/recovery proof, pushed SHA, remote CI, and honest external gates.
- [x] The Mobile constitution is amended to version 2.0.0 before implementation; production live adapters fail closed and mocks remain explicit demo/test only.

## Project Structure

### Feature documentation

```text
apps/api/specs/014-client-cutover-mock-migration-production-readiness/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- rollback-plan.md
|-- tasks.md
|-- checklists/
|   |-- requirements.md
|   `-- release.md
|-- contracts/
|   `-- client-contract-manifest-v1.md
`-- evidence/
    |-- baseline.md
    |-- wave-01-identity.md ... wave-09-operations.md
    |-- mock-removal-report.md
    |-- external-gates.md
    `-- closeout.md
```

### Planned source and infrastructure

```text
apps/mobile/
|-- package.json, package-lock.json, app.json, .env.example
`-- src/
    |-- config/                         # strict live/demo/test runtime policy
    |-- state/                          # Clerk provider/token wiring and app shell
    |-- services/contracts/             # field-complete client contracts/tests
    |-- services/live/                  # one live adapter per active domain
    |-- services/*.ts                   # explicit provider selectors
    `-- storage/                        # reuse SQLite/sync/draft/encryption paths

apps/admin-web/
|-- package.json, package-lock.json, next.config.ts, .env.example
`-- src/
    |-- app/                            # Clerk provider and production mock gate
    |-- proxy.ts                        # Next.js 16 request/auth boundary
    |-- core/api/                       # authenticated strict API client
    |-- features/*/repository.ts        # live mappings through shared client
    |-- mocks/                          # explicit test/development only
    `-- tests/                          # production selection/route parity

apps/api/src/, apps/api/test/, apps/api/specs/00[2-9]*, apps/api/specs/01[013]*/
                                       # smallest owning-Spec defect repairs only
.github/workflows/, docker/, ops/       # verification/evidence corrections only
```

**Structure decision**: Keep every existing client interface and repository seam. Add one strict runtime policy and one authenticated request seam per client, reuse native cryptography and existing validators, and make domain-specific mapping fixes where the current service already owns them. No generic framework or persistent rollout subsystem is introduced.

## Ownership And Boundaries

**Owned resources**: Mobile/Admin provider selection, live mappings, strict decoders, redacted shadow comparisons, cohort configuration, rollback switches, production mock isolation, cutover tests/evidence, and release reports.
**Consumed contracts**: All active operations owned by SPEC-BE-001 through SPEC-BE-011 and SPEC-BE-013, catalogued in [client-contract-manifest-v1.md](contracts/client-contract-manifest-v1.md).
**Explicit exclusions**: SPEC-BE-012, Stripe/billing/paid features, new schema/API/worker/event resources, client financial calculations, hidden mock fallback, and later phases.
**Client contract impact**: Existing client behavior remains; mappings become strict and live. Any absent capability becomes an explicit unavailable state or an owning-Spec correction before the wave proceeds.

## Phase 0: Research

[research.md](research.md) records decisions for runtime modes, Clerk integration, strict validation, shadow evidence, cohort rollout, rollback, offline preservation, owner-side defect repair, free-only capability reporting, and external evidence.

Material owner-side blockers already proven by source/runtime review are recorded as prerequisite tasks for their waves:

- BE003 lacks safe self-context for least-privilege Admin roles and fabricates session/action/effective-permission projections.
- BE005 has an unsatisfiable linked-mutation response schema.
- BE006 OpenAPI and sync documentation drift from paged signed-v2 runtime behavior; a cursor error is filtered incorrectly.
- BE007 planning summary completeness and lifecycle filtering are overstated.
- BE008 maps `report_wrong` into a transaction-accepting decision and has incomplete response schemas.
- BE009 strips quota/error metadata and contains unsatisfiable request/response schema composition.
- BE010 partial-month summaries overcount and the Mobile report model exceeds the current live contract.
- BE011 notification preferences routing is shadowed by a dynamic route and several page/detail schemas drift from runtime.
- BE013 operations incident schemas and rollout evidence do not match runtime; percentage cohort derivation is absent.
- Mobile local storage is global and unencrypted; sync persistence can overwrite newer/conflicting state; planning can delete draft-only data and retain ledger-orphan effects.
- Admin live transport/cache state is not actor-scoped, simulated roles can drive client gates, and several repository mappings fabricate IDs, settings, rollout, maintenance, pagination, error, or health facts.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines configuration/evidence records only and explicitly owns no persistent entity.
- [client-contract-manifest-v1.md](contracts/client-contract-manifest-v1.md) inventories every active client operation with shared, explicit mapping policies and wave-specific endpoints.
- [rollback-plan.md](rollback-plan.md) defines accepted-version capture, cohort progression, stop conditions, rollback, and post-rollback reconciliation.
- [quickstart.md](quickstart.md) names safe, runnable validation and the disposable-environment boundary.

## Implementation Strategy

1. Finish the prerequisite owner corrections needed by Wave 1, add Clerk token wiring, strict production configuration, identity mappings, shadow/rollback controls, and Admin live authorization context. Verify, review, commit, push, and wait for green remote CI.
2. Repeat the same test-first gate for Wave 2 reference/accounts, preserving every card, version, tracking, and category-use field.
3. Cut over the ledger and sync only after instance-valid contracts pass; reuse SQLite queues/state and prove exact retry/conflict/tombstone behavior before the wave push.
4. Replace the planning selector's local mock-as-live behavior with the smallest strict live adapter, retaining local drafts and resumable multi-step budget writes.
5. Correct tracking decision safety and response schemas, then cut over tracking/import clients with explicit consent/account/source gates.
6. Correct AI error/schema transport, wire Clerk-authenticated voice/assistant/Admin operations, and preserve advisory confirmation and the shared five-request rolling quota.
7. Correct report date-range reconciliation, expose only supported report behavior, and cut over report/Admin analytics with exact aggregate shadowing.
8. Correct engagement route/schema defects and strict Mobile mappings, then cut over notification/support/content/Admin communication flows.
9. Correct operations contract/rollout defects, cut over operations/governance clients, prove free-only metadata, then execute final full verification and closeout.

Every step begins with the smallest failing contract or regression test, changes the shared root cause, reruns focused checks, reviews the path-scoped diff, updates the manifest/evidence, and runs broader gates before commit.

Fixture-driven shadow/internal/bounded/full runs are local harness rehearsals. Deployed rollout evidence requires the real environment, stable server-derived cohort, observation interval, and exercised rollback; otherwise that stage remains open in the external ledger.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Requirements and contracts | Checklist, manifest completeness verifier, OpenAPI instance tests, client contract tests, schema drift | Zero missing operation, unknown mapping, invalid instance, or unresolved material analysis finding |
| Database and RLS | Disposable clean reset, lint, pgTAP, checksums, owner/non-owner/Admin/worker/anonymous matrix | Zero unexpected skip/failure; no Phase 14 migration/object |
| Financial integrity | Golden ledger fixture, postings/report reconciliation, retry/conflict/offline tests | Exact integer equality; zero tolerance, duplicate, rounding, field loss, or Last Write Wins |
| Client selection and data | Production mode build/start tests, mock import scan, SQLite upgrade/sync/draft/encryption tests | Zero production mock route; zero lost local record/pending operation/protected state |
| Security | OWASP traceability, auth/authz E2E, bundle/secret/URL/provider scans, dependency/image scans, security diff review | Zero exploitable Critical/High, cross-user access, secret, direct provider/service-role access, unsafe mock/debug mode |
| Performance | Existing per-domain P95/P99, payload, query-plan, cache, sync, queue, report, AI, stress checks | All owning thresholds met on the designated production-like disposable environment |
| Containers and operations | Reproducible non-root images, health/shutdown, alerts/dashboards/runbooks, safe cardinality, worker/provider failure | Zero required local failure; hosted-only proof remains named external gate |
| Rollback and recovery | Per-wave N-1 adapter/image rehearsal, migration forward correction, replay, backup/restore, storage and DR procedures | No data loss/duplicate effect; RPO/RTO met where locally provable; provider DR remains explicit external gate |
| Delivery | Independent review, clean/test/security guards, path-scoped commit, pushed SHA, required workflow status | Each wave's `main` SHA remotely green before next wave |

## Post-Design Constitution Check

- **PASS — Main-first ownership**: all files and commits remain attributable to SPEC-BE-014 or an explicitly named prior owning-Spec correction; no branch/worktree is planned.
- **PASS — Artifact-first**: spec, plan, research, data model, manifest, quickstart, rollback plan, checklists, and analysis precede production edits.
- **PASS — Architecture authority**: clients consume existing `/api/v1` and `/api/v1/admin` contracts; owner defects are repaired at source.
- **PASS — Database discipline**: no Phase 14 persistent object exists; full current migrations/RLS remain verification targets.
- **PASS — Mobile constitution**: version 2.0.0 authorizes approved live adapters, requires fail-closed production selection, and preserves owner-scoped local/offline state.
- **PASS — Financial integrity**: exact integer reconciliation, idempotency, versions, conflicts, and ledger-only writes block every financial wave.
- **PASS — Security/privacy**: Clerk tokens, server permissions, strict validation, secret isolation, redaction, and complete security gates are explicit.
- **PASS — AI boundary**: server-only approved OpenRouter paths, consent, evidence, quota, and confirmation remain mandatory.
- **PASS — Evidence/operations**: every local claim requires fresh command output; unavailable provider/device/hosted evidence remains open with exact follow-up.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |
