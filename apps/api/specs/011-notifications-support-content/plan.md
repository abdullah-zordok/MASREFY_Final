# Implementation Plan: Notifications, Support & Content

**Phase / Spec**: Phase 11 / SPEC-BE-011  
**Branch**: `main`  
**Base Revision**: `1bafdcb17ce50b76adb1c229bc5175eece55ca7b`  
**Date**: 2026-09-05  
**Spec**: [spec.md](spec.md)  
**Input**: Backend feature specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

Add one `engagement` NestJS module with notification, campaign, support,
attachment, feedback/abuse, and content services behind the existing auth,
database, outbox, idempotency, RBAC/audit, Storage, observability, and worker
boundaries. The module consumes registered domain events asynchronously, renders
safe versioned templates, stores private in-app events, and dispatches push/email
through narrow provider adapters without ever holding a domain transaction open.

The smallest complete design creates only the 14 Phase 11 tables from the Master
Plan and no new queue, bucket, auth, audit, permission, cache infrastructure, or
dependency. Node standard APIs cover timezone/DST, hashing, HTTP/2, JWT signing,
and ClamAV streaming; the installed Nodemailer transport covers email. Live-capable
Mobile/Admin adapters are added at existing seams while final production provider
selection remains SPEC-BE-014.

## Technical Context

**Language / Runtime**: TypeScript 5.9 on Node.js 24  
**Framework**: NestJS 11 with Express 5  
**Primary Dependencies**: existing `pg`, NestJS, Clerk guard/RBAC, OpenTelemetry,
Nodemailer, native `Intl`, `crypto`, `http2`, `net`, and `fetch`; no new package  
**Storage**: Supabase Postgres 17; existing private `support-attachments` bucket;
14 owned Phase 11 tables; existing outbox/queue/idempotency/audit/push-token rows  
**Testing**: Jest unit/contract/integration/E2E/security/performance/container,
pgTAP, Supabase reset/lint, Mobile Jest, Admin Vitest/Playwright, deterministic
local push/email/scanner providers  
**Target Platform**: existing non-root API/worker image and local Supabase CLI stack  
**Project Type**: NestJS modular monolith with separate API and worker entry points  
**Performance Goals**: notification/ticket lists <=400/800 ms P95/P99 and <=200
KiB; indexed list/claim queries <=50 ms P95; Admin pages <=500/1000 ms; async
acceptance <=300/600 ms; bounded campaign/scan/provider memory and concurrency  
**Constraints**: synchronized direct `main`; immutable checksummed migrations;
forced RLS/least grants; exact Admin permission and recent MFA; internal-note and
draft-content isolation; safe lock-screen payloads; database dedupe; provider
outage isolation; no new infrastructure; no SPEC-BE-012+ implementation  
**Scale / Scope**: production-like 100k notifications, 25k tickets/messages,
100k-user campaign audience, 10k attachment metadata rows, concurrent worker
claims/replays, Arabic/English content, customer <=100/Admin <=200 page limits

## Constitution Check

*GATE: Every item passed before Phase 0 and is rechecked after Phase 1.*

- [x] Checkout is synchronized `main`; the active tracked diff is Phase 11 only.
- [x] `spec.md` is complete and defines one Phase 11 boundary.
- [x] Every table/function/API/job/event/cache/Storage/provider rule is owned by
      Phase 11 or explicitly named as a consumed prior-Spec contract.
- [x] Current API modules/migrations/evidence and Mobile/Admin communication
      contracts/mocks/provider seams were reviewed.
- [x] Master Plan architecture, API, database, Docker, performance, operations,
      migration, recovery, rollback, and testing requirements are represented.
- [x] Phase 11 creates no financial mutation; idempotency, versions, atomic audit/
      outbox, delivery dedupe, and provider isolation are explicit.
- [x] Deny-by-default auth, forced RLS, secret/token isolation, OWASP traceability,
      file/template abuse controls, and release blockers are explicit.
- [x] No AI behavior is added and no AI output can reach a privileged path.
- [x] Client work is limited to owned live-capable adapters/parity; final production
      provider selection and broad mock deletion remain SPEC-BE-014.
- [x] Verification, reconciliation, rollback, recovery, provider separation, and
      acceptance evidence name commands, environments, and thresholds.

## Project Structure

### Feature documentation

```text
apps/api/specs/011-notifications-support-content/
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
|-- checklists/
|-- evidence/
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/engagement/
|-- engagement.module.ts
|-- engagement.dto.ts
|-- engagement.schemas.ts
|-- engagement.repository.ts
|-- notification.service.ts
|-- notification.controller.ts
|-- notification.admin.controller.ts
|-- notification.providers.ts
|-- notification.renderer.ts
|-- notification.policy.ts
|-- campaign.service.ts
|-- support.service.ts
|-- support.controller.ts
|-- support.admin.controller.ts
|-- support.storage.ts
|-- support.scanner.ts
|-- feedback.controller.ts
|-- feedback.admin.controller.ts
|-- content.service.ts
|-- content.controller.ts
|-- content.admin.controller.ts
|-- engagement.worker.ts
|-- engagement.events.ts
`-- engagement.observability.ts

apps/api/src/{app.module.ts,worker.module.ts}
apps/api/src/platform/config/{environment.schema.ts,environment.types.ts}
apps/api/package.json
apps/api/test/{unit,contract,integration,e2e,security,performance}/engagement/

supabase/migrations/20260905...phase11_*.sql
supabase/tests/044_phase11_notifications.sql
supabase/tests/045_phase11_support.sql
supabase/tests/046_phase11_content_feedback.sql
supabase/migration-checksums.sha256

apps/mobile/src/services/live/engagement-service.ts
apps/mobile/src/services/contracts/assistant-notifications-service.ts
apps/mobile/src/features/{notifications,support}/
apps/mobile/src/domain/{notifications,support}.ts
apps/admin-web/src/features/communications/{contracts.ts,repository.ts,hooks.ts}
apps/admin-web/tests/e2e/support-content-notifications.spec.ts

ops/observability/engagement-dashboard.json
ops/alerts/engagement-alerts.yml
ops/runbooks/engagement-*.md
```

**Structure decision**: one domain module prevents six thin module shells while
services/controllers retain separate trust boundaries. Existing generic helpers
are injected directly rather than wrapped. Split a source file only when it owns a
different external boundary (push/email, Storage, scanner) or grows beyond one
cohesive responsibility. Exact additions are fixed by `tasks.md` after analysis.

## Ownership And Boundaries

**Owned resources**: 14 Master Plan tables; guarded Phase 11 functions/triggers;
customer/Admin APIs; five jobs; ten events; content cache; support object lifecycle;
notification rendering/delivery providers; Phase 11 client adapters, observability,
runbooks, and evidence.  
**Consumed contracts**: Phase 01 database/outbox/queue/worker/Storage/HTTP/metrics;
Phase 02 profile/device/encrypted push token; Phase 03 exact RBAC/recent MFA/audit/
support grants/privacy; Phase 06 idempotency; Phase 10 SMTP transport conventions;
current domain event envelopes from 005-010. The registry has a public extension
seam, but Phase 11 does not register or implement later-Spec events.  
**Explicit exclusions**: new domain/billing events, billing/entitlements, generic
operations tables, final production cutover, recurring campaigns, arbitrary SQL,
rich content, new bucket/queue/cache/auth/audit/idempotency system.  
**Client contract impact**: implement/verify live-capable notification, support,
content, and Admin communication adapters; preserve explicit test/demo providers
and do not flip production selection.

## Phase 0: Research

[research.md](research.md) resolves event ownership, quiet hours/DST, template
safety, provider adapters, ambiguous delivery, campaign bounds, ticket state,
internal-note isolation, attachment quarantine/scanning, content lifecycle/cache,
permissions, client seams, configuration, and provider-independent evidence. No
`NEEDS CLARIFICATION` remains.

## Phase 1: Design And Contracts

- [data-model.md](data-model.md) defines all 14 tables, relationships, constraints,
  indexes, RLS/grants, state machines, retention, and migration order.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines every customer/Admin
  operation, strict safe schema, errors, cursors, idempotency, and versions.
- [contracts/internal-contracts.md](contracts/internal-contracts.md) defines event
  consumption, renderer/policy, provider, Storage/scanner, auth/audit/idempotency,
  cache, Realtime, and recovery seams.
- [contracts/events-jobs.md](contracts/events-jobs.md) defines five jobs, ten owned
  events, leases/fences/retry/dead-letter, and sensitive-field exclusions.
- [contracts/mobile-admin-mapping.md](contracts/mobile-admin-mapping.md) maps the
  executable clients without claiming final Phase 14 cutover.
- [quickstart.md](quickstart.md) gives the executable validation/evidence order.

## Implementation Strategy

1. Capture baseline/dependency/client evidence; write failing pgTAP tests; add the
   notification/template/preference/delivery migrations, guarded functions, RLS,
   permissions, indexes, seeds, and checksums.
2. Add failing renderer/policy/provider/DTO/contract tests; implement safe locale,
   variable, quiet-hour/DST, payload, event/read/action, provider, retry, and expiry
   paths with injected deterministic adapters.
3. Add failing campaign tests; implement bounded audience grammar, preview,
   creator/approver separation, schedule, batch expansion, rate limits, pause/
   resume/cancel, dedupe, observability, and recovery.
4. Add failing support/attachment pgTAP and service tests; migrate roots/dependents,
   implement ticket transitions, messages, private notes, signed upload/finalize,
   scanner/quarantine/rejection/deletion, and exhaustive leak negatives.
5. Add failing feedback/abuse/content tests; implement owner-safe workflows,
   duplicate-active reporting, exact Admin actions, immediate content publish/
   retire, locale/search, cache/invalidation, and draft isolation.
6. Generate runtime OpenAPI and client drift tests; add Mobile/Admin adapters at
   current seams, replace owned no-op behavior, and keep provider selection explicit.
7. Add performance/query-plan/stress, migration/rollback/recovery, metrics/alerts/
   runbooks, container/security gates, then run full local verification.
8. Run SpecKit convergence, finish every valid gap, run clean-code/test/security/
   final verification reviews, commit/push narrow changes, monitor/fix remote CI,
   and record only genuine external provider/device/release gates.

Each package starts with one failing executable check and ends with focused
verification. No abstraction or dependency is added for a future Spec.

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|---|---|---|
| Requirements/contracts | checklist/analyze, OpenAPI/runtime/internal/event/client drift tests | zero critical gap or drift |
| Database/RLS | `npm run db:reset`, `db:lint`, `test:db`, live integration/security suites | zero migration, pgTAP, grant, RLS, note/draft/file isolation failure |
| Notification/provider | deterministic Expo/APNs/FCM/email adapters, payload snapshots, outage/replay/retry | zero unsafe payload/token leak/duplicate logical delivery/source blocking |
| Support/files/content | ticket/attachment/feedback/abuse/content E2E and privacy matrix | zero cross-user, note/draft, unscanned-file, reporter/resource disclosure |
| Security | engagement security suites, Gitleaks, dependency audit, image scan, OWASP matrix | zero exploitable Critical/High or release blocker |
| Performance | engagement runner, `EXPLAIN ANALYZE BUFFERS`, 100k campaign/stress/recovery | all P95/P99/payload/query/memory/batch bounds |
| Clients | Mobile type/lint/Jest and Admin type/lint/Vitest/build/Playwright/a11y | zero Phase 11 failure; no hidden production fallback |
| Operations | API/worker image/config checks, metrics/alerts/runbook validation | non-root; no secret/high-cardinality label; all alerts linked |
| Rollback/recovery | rollback/reapply, N-1, worker crash/replay, provider/storage/scanner failure, restore | no lost private state, leaked file/note/draft, or duplicate logical effect |
| Remote delivery | direct `main` push and resulting Backend Foundation workflows | all locally actionable jobs pass; external-only proof separately named |

## Post-Design Constitution Check

- **PASS — main/scope**: baseline SHA and four protected untracked paths are
  recorded; design changes are Phase 11 artifacts plus feature pointer only.
- **PASS — artifacts/ownership**: spec, plan, research, data model, contracts, and
  quickstart define only Master Plan Phase 11 resources and consumed contracts.
- **PASS — current contracts**: Mobile/Admin schemas, repositories, mocks, pages,
  permissions, and scheduling support were inspected and mapped.
- **PASS — architecture/data**: existing modular monolith, Postgres, outbox,
  worker, Storage, Clerk, RBAC/audit, crypto, and SMTP are reused; no new package.
- **PASS — consistency/concurrency**: database uniqueness, optimistic versions,
  idempotency, leases/fences, and atomic audit/outbox are explicit.
- **PASS — security/privacy**: forced RLS, least grants, exact permissions/MFA,
  token isolation, safe templates/payloads/files, note/draft privacy, BOLA/BFLA,
  and release-blocking tests are contractual.
- **PASS — performance/operations**: exact budgets, query plans, bounded workers,
  cache, metrics/alerts/runbooks, rollback/recovery, and external gates are planned.
- **PASS — exclusions**: no content scheduling, SPEC-BE-012 event, generic operation,
  or final production cutover is designed.

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
|---|---|---|---|
| None | N/A | N/A | N/A |
