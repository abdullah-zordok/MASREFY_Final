# Implementation Plan: Performance, Caching, Observability & Operations

**Phase / Spec**: Phase 13 / SPEC-BE-013  
**Branch**: `main`  
**Base Revision**: `2e2bf13f409e4a891fc3d8072cf07a26d7685392`  
**Date**: 2026-09-06  
**Spec**: [spec.md](spec.md)  
**Input**: Backend feature specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add the minimum operations control plane to the existing NestJS API/worker and PostgreSQL platform: nine private operational tables, closed database functions for registration/evaluation/claims/mutations, one allowlisted operations module and scheduler, bounded Admin and Mobile projections, and cross-domain performance/recovery evidence. Reuse every existing domain worker, queue/outbox, permission, audit, metric, logging, migration, test, and client repository seam. Add no service, cache server, scheduler dependency, or billing capability.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js 24 (`>=24 <25`)  
**Framework**: NestJS 11 with Express 5; separate API and worker entry points  
**Primary Dependencies**: existing `pg`, NestJS Config/Swagger/Terminus, Clerk backend, OpenTelemetry API/SDK, Joi, class-validator/transformer; no new runtime dependency  
**Storage**: PostgreSQL 17 through local/hosted Supabase; private Phase 13 tables; existing audit, identity, queue/outbox, domain, and Storage metadata consumed  
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP, k6/production-like plans, Admin Vitest/Playwright, Mobile Jest, secret/dependency/container scans  
**Target Platform**: existing pinned multi-stage Node/distroless container and Supabase deployment model  
**Project Type**: NestJS modular monolith with separate API and worker entry points  
**Performance Goals**: bounded operational reads with P95 <= 300 ms and P99 <= 750 ms under the approved local profile; due-job claim P95 <= 100 ms for 10,000 schedules; 100-item pages and 720-point series maximum; safe meta cache <= 30 seconds; RPO <= 15 minutes and RTO <= 2 hours  
**Constraints**: Free-only; private/API-only data; exact permissions/recent MFA/reason/audit; fixed search paths; no arbitrary execution/network; no sensitive data; no Redis; additive checksum-protected migrations; N-1 compatibility; preserve five user-owned paths  
**Scale / Scope**: 50 or fewer registered MVP job keys, 10,000 schedule rows, 1,000,000 retained run rows before retention, 100 concurrent claimers in stress evidence, six provider categories maximum, 100 open incidents, 500 settings/flags, 720 time-series points per response

No unresolved clarification remains.

## Constitution Check

*GATE: Every item MUST pass before Phase 0 and again after Phase 1.*

- [x] The checkout is synchronized `main`; the active Phase 13 diff is isolated from five explicitly preserved user-owned paths.
- [x] `spec.md` is complete; this plan defers executable ordering to `tasks.md`.
- [x] Every owned table, function, trigger, API, job, event, cache, and rule is documented in the Spec and Phase 1 artifacts.
- [x] Current API/worker, health/meta/config, queue/outbox, audit/permission, migrations/tests/ops, Admin repositories, and Mobile capability seams were reviewed.
- [x] Master Plan architecture, API, database, Docker, performance, observability, migration, backup/recovery, rollback, and testing rules are represented.
- [x] Financial truth remains in SPEC-BE-005; Phase 13 adds no financial mutation and reuses idempotency, version, audit, outbox, and reconciliation rules.
- [x] Deny-by-default access, RLS/grants, secret isolation, OWASP controls, bounded abuse controls, and release blockers are explicit.
- [x] Phase 13 adds no AI generation or mutation; existing SPEC-BE-009 OpenRouter behavior is consumed only as a monitored dependency.
- [x] Client changes are limited to the explicitly owned operations/meta contract cutover through existing seams; layouts are unchanged.
- [x] Verification, reconciliation, rollback, recovery, and acceptance evidence names commands, environments, thresholds, and owners.

**Pre-design result**: PASS. No Constitution deviation.

## Project Structure

### Feature documentation

```text
apps/api/specs/013-performance-caching-observability-operations/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/requirements.md
|-- contracts/
|   |-- openapi.yaml
|   |-- internal-contracts.md
|   |-- jobs-events.md
|   `-- mobile-admin-mapping.md
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/operations/
|-- operations.module.ts
|-- operations.controller.ts
|-- operations.service.ts
|-- operations.repository.ts
|-- operations.worker.ts
|-- operations.dto.ts
|-- operations.schemas.ts
|-- job-registry.ts
|-- feature-evaluator.ts
`-- operations.observability.ts
apps/api/src/platform/meta/{meta.dto.ts,meta.service.ts}
apps/api/src/platform/observability/platform-metrics.ts
apps/api/src/{app.module.ts,worker.module.ts,worker.ts}
apps/api/src/security/permission-manifest.ts
apps/api/test/{unit,contract,integration,e2e,security,performance}/operations/
supabase/migrations/20260906*_phase13_*.sql
supabase/tests/054_phase13_*.sql ...
supabase/migration-checksums.sha256
apps/admin-web/src/features/{system-health,governance}/
apps/mobile/src/services/{contracts,live}/platform-operations*
ops/{alerts,observability,runbooks}/operations*
.github/workflows/backend-foundation.yml
docker/{backend.Dockerfile,local/compose.backend.yml,test/compose.backend.yml}
```

**Structure decision**: Add one cohesive `operations` module and touch existing platform/client seams only where needed. Prefer extending current DTO, guard, metrics, migration, and repository patterns over introducing abstractions. The final task ledger may remove planned files when a smaller existing-file implementation is sufficient.

## Ownership And Boundaries

**Owned resources**: nine private operational tables; registration/evaluation/claim/lifecycle functions; exact operations permissions; nine Phase 13 jobs; operations API projections/actions; safe platform meta; operations metrics/alerts/dashboards/runbooks; performance/cache/recovery inventories and evidence.  
**Consumed contracts**: Specs 001-011 job handlers, queues/outbox, audit, Admin guard, Clerk principal, database pool, OpenTelemetry sink, health/meta, migration runner/checksums, Storage bucket metadata, Admin repositories, Mobile capability provider.  
**Explicit exclusions**: all billing/Stripe/paid work and SPEC-BE-012; production cutover and SPEC-BE-014; domain job logic; arbitrary diagnostics/execution; Redis; UI redesign; protected user-owned files.  
**Client contract impact**: Admin operations/governance repositories become live against Phase 13 routes and remove production-facing billing provider/queue/settings assumptions. Mobile gains a separate safe operations/meta adapter; its active assistant/subscription contract is not edited.

## Phase 0: Research

[research.md](research.md) records 15 resolved decisions:

- existing modular monolith and dependencies only;
- database-backed due-job claims using bounded UTC interval schedules;
- closed handler/provider registries and safe history;
- private API-only data and exact operations permissions;
- deterministic bounded feature evaluation and schema-keyed settings;
- process-local safe-meta caching only, with no Redis;
- fixed-cardinality metrics and fixed-destination provider checks;
- local recovery proof plus honest hosted evidence classification;
- PostgreSQL 17/current Supabase change compatibility;
- existing Admin/Mobile seams with no protected-file edit.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) specifies every column, type, constraint, index, relationship, lifecycle, retention rule, grant, and authoritative function.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines bounded Admin and safe client routes, requests, responses, and stable errors.
- [contracts/internal-contracts.md](contracts/internal-contracts.md) defines application/database/dispatcher/cache/provider interfaces and validation limits.
- [contracts/jobs-events.md](contracts/jobs-events.md) defines the full implemented job inventory, ownership, schedules, retry/cancel safety, Phase 13 jobs, and safe event payloads.
- [contracts/mobile-admin-mapping.md](contracts/mobile-admin-mapping.md) maps existing client repositories to live routes and locks the Free-only projection.
- [quickstart.md](quickstart.md) defines executable validation and expected outcomes without embedding implementation.

## Implementation Strategy

1. **Contract-first tests**: add failing unit/contract/pgTAP tests for schemas, tables, ownership, claims, evaluation, lifecycles, permissions, redaction, and Free-only metadata.
2. **Database foundation**: add ordered types/tables/indexes/triggers, then authoritative functions, minimum grants/RLS, permission and safe-default seeds, and checksum entries.
3. **Operations core**: add exact DTO parsing, repository calls, handler/provider allowlists, safe execution recorder, scheduler, process-local safe projection cache, and fixed-cardinality metrics.
4. **Domain scheduling integration**: expose or reuse the narrowest existing per-job methods; replace independent timers only after the central claim/dispatch path has tests; do not copy business logic.
5. **Admin and Mobile contracts**: implement bounded routes, map existing Admin seams, add safe Mobile operations/meta adapter, and remove production assumptions for billing provider/queue/settings from the touched seams.
6. **Performance and recovery**: add plan/load/stress/cache tests, extend backup/restore/DR/N-1/replay/reconciliation checks, and write redacted evidence.
7. **Operations content**: add dashboards, alerts, and actionable runbooks with link/cardinality validation.
8. **Convergence and review**: run analyze/converge, all local gates, Clean Code/test/security/independent reviews, requirements traceability, path-scoped staging, coherent direct-main commits, push, and exact-SHA CI closeout.

Each non-trivial behavior is implemented test-first. When an existing helper satisfies a task, reuse it and delete the planned duplicate.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|------|------------------|--------------------|
| Requirements and contracts | checklist, OpenAPI drift, DTO/adapter tests, traceability ledger | zero missing or contradictory requirement/route |
| Database and RLS | clean reset, db lint, full pgTAP, migration checksums, upgrade/concurrency tests | zero failure; zero unintended grant/direct access |
| Security | unit/contract/security suites, redaction sentinel, secrets/dependency/SAST scan, security diff review | zero secret/PII leak, arbitrary execution, BOLA/BFLA, high/critical issue |
| Performance | production-like EXPLAIN checks, domain + operations load/stress, cache cold/warm/invalidation | every approved P95/P99/query/payload/cardinality bound passes |
| Containers and operations | build, image health, worker shutdown/recovery, Trivy, alert/runbook validation | healthy non-root image; zero high/critical vulnerability; every alert linked |
| Rollback and recovery | backup corruption/restore, RLS/app checks, reconciliation/replay, N-1 image, RPO/RTO evaluation | local proof passes; RPO <=15m; RTO <=2h; hosted-only items explicit |
| Clients | Admin typecheck/lint/build/Vitest/Playwright; Mobile typecheck/lint/quality/full Jest | zero failure; safe Free-only projection only |
| Remote | GitHub Actions at final pushed SHA; `main...origin/main` | required run completed/success and divergence 0/0 |

## Post-Design Constitution Check

| Gate | Result | Design evidence |
|------|--------|-----------------|
| One active Spec on synchronized main | PASS | base revision and protected paths recorded in Spec/quickstart |
| Complete mutually consistent artifacts | PASS | Spec plus linked research/model/contracts/quickstart; tasks deferred to next command |
| Complete owned-resource inventory | PASS | data model, jobs/events, OpenAPI, ownership sections |
| Repository/client review | PASS | research decisions and mapping contract cite existing seams |
| Master Plan coverage | PASS | evidence plan covers architecture through recovery and CI |
| Financial integrity | PASS | no financial mutation; ledger reconciliation consumed and tested |
| Security/privacy | PASS | private objects, exact grants/permissions/MFA/audit, fixed paths, redaction, denylist |
| AI boundary | PASS | no new AI generation; Free-only quota and provider health only |
| Client boundary | PASS | existing layouts/repositories; separate safe Mobile contract; protected file excluded |
| Verifiable release evidence | PASS | quickstart commands, thresholds, evidence plan, external-evidence classification |

**Post-design result**: PASS. Phase 1 introduces no Constitution violation and no complexity exception.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|-----------|--------------|-------------|-----------|
| None | N/A | N/A | N/A |

## Planning Completion Gate

- [x] Technical context has no unresolved clarification.
- [x] Phase 0 research decisions are complete.
- [x] Phase 1 data model, contracts, client mapping, and quickstart are complete.
- [x] Both Constitution checks pass.
- [x] Free-only exclusions are explicit.
- [x] No production implementation was performed during planning.
