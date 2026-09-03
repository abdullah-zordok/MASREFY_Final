# Implementation Plan: Voice, OpenRouter AI & Financial Assistant

**Phase / Spec**: Phase 09 / SPEC-BE-009
**Branch**: `main`
**Base Revision**: `bdffc5a39dc4c863827dc750f464ddd844221425`
**Date**: 2026-09-03
**Spec**: [spec.md](./spec.md)
**Input**: Backend specification, Constitution 2.0.0, complete Backend Master
Plan, and executable Mobile/Admin voice and AI contracts

## Summary

Add one AI domain boundary with customer voice and assistant surfaces around the
twenty Phase 09 tables. Reuse the existing database/RLS, private Storage, outbox,
worker, idempotency, Admin authorization/audit, privacy, ledger command, and
planning/reference read contracts. Use Node's native `fetch` for a worker-only
OpenRouter gateway; no new SDK, queue, cache, direct finance write, provider
selection by clients, or later-Spec feature is introduced.

All model output is untrusted advisory data. Strict versioned schemas,
deterministic ownership/business validation, short-lived proposals/previews, and
an explicit confirmation command stand between AI output and any domain mutation.
Before SPEC-BE-012, a server-owned rolling quota permits five accepted AI work
requests per user per 24 hours across voice and assistant workloads.

## Technical Context

**Language / Runtime**: TypeScript 5.9, Node.js 24, SQL/PLpgSQL
**Framework**: NestJS 11 with Express 5; separate API and worker entry points
**Primary Dependencies**: existing NestJS, `pg`, class-validator/transformer,
OpenTelemetry, and Node `fetch`, `AbortController`, `crypto`, streams, and URL APIs;
no new runtime package
**Storage**: twenty Phase 09 tables; `voice-temp` private bucket; existing
profiles, accounts, categories, ledger, planning, idempotency, audit, outbox, and
privacy resources
**Testing**: Jest unit/contract/integration/E2E/security/container, pgTAP,
Supabase CLI, SQL plans, k6, Mobile Jest, Admin Vitest/Playwright, dependency,
secret, and image scans
**Target Platform**: current non-root immutable API/worker image and supported
Supabase/PostgreSQL deployment
**Project Type**: NestJS modular monolith with existing Mobile and Admin clients
**Performance Goals**: synchronous metadata/command endpoints P95/P99 <=300/750
ms; bounded reads <=500/1000 ms; enqueue <=300 ms; AI provider work asynchronous
except bounded assistant streaming; voice <=120 seconds; no connection or heap
growth under the documented load profile
**Constraints**: Arabic/English; private no-store responses; ZDR and no-training
routes; raw content absent from logs/events/usage; strict JSON Schema; five work
requests/user/rolling 24h; 70/85/95 percent budget alerts and hard stop at 100;
AI never directly mutates finance; no SPEC-BE-010+ work
**Scale / Scope**: one voice object/session up to 120 seconds and configured byte
limit; 100 conversations/page cursor, 200 messages/conversation cap for provider
context, 8 KiB message input, 32 evidence references, 100 jobs/claim, and
production-like million-row usage/query-plan fixtures

No technology clarification remains. A live OpenRouter credential, account
privacy settings, compliant endpoint availability, and hosted alert destinations
are external activation gates, not assumptions converted into local passes.

## Constitution Check

_GATE: passed before research and rechecked after design._

- [x] Checkout is synchronized `main`; the active feature diff is Phase 09 and
      protected unrelated untracked paths remain untouched.
- [x] `spec.md` is complete and has no clarification marker.
- [x] All twenty tables, Storage use, routes, functions, jobs, events, quotas,
      safety, retention, and client integration are owned or explicitly consumed.
- [x] Current API/worker/migrations and Mobile/Admin voice/assistant/AI contracts
      were reviewed before choosing paths.
- [x] Master Plan architecture, API, database, container, performance,
      observability, migration, recovery, rollback, and test rules are represented.
- [x] Ledger commands remain the sole financial mutation path; replay, versions,
      locks, audit, outbox, and conflicts are explicit.
- [x] Deny-by-default authorization, forced RLS, worker-only secrets, OWASP/MASVS
      abuse controls, redaction, quota, and release-blocking tests are explicit.
- [x] OpenRouter is the only AI gateway and AI output has no mutation authority.
- [x] Mobile/Admin edits are limited to the Phase 09 live adapters and explicit
      unavailable states; final cross-domain cutover remains Phase 14.
- [x] Verification, evaluation, rollback, recovery, reconciliation, and
      acceptance evidence name commands, environments, thresholds, and owners.

## Project Structure

### Feature documentation

```text
apps/api/specs/009-voice-openrouter-financial-assistant/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   |-- openrouter.md
|   |-- internal-contracts.md
|   |-- events-jobs.md
|   `-- mobile-admin-mapping.md
|-- checklists/
|-- evidence/
`-- tasks.md
```

### Planned source and infrastructure

```text
apps/api/src/ai/
|-- ai.module.ts
|-- ai.dto.ts
|-- ai.repository.ts
|-- ai.gateway.ts
|-- ai.schemas.ts
|-- ai.service.ts
|-- ai.controller.ts
|-- ai.admin.controller.ts
|-- ai.worker.ts
|-- ai.events.ts
|-- ai.observability.ts
`-- ai-privacy.handler.ts
apps/api/src/{app.module.ts,worker.module.ts}
apps/api/src/platform/config/{environment.schema.ts,platform-config.service.ts}
apps/api/src/security/{permission-manifest.ts,security.module.ts,security.worker.ts}
apps/api/test/{unit,contract,integration,e2e,security}/ai/
apps/api/test/performance/{ai.sql,ai.k6.js,run-ai.ts}
supabase/migrations/<timestamp>_phase09_ai_{config,tables,functions,access_seeds}.sql
supabase/tests/037_ai_structure.test.sql
supabase/tests/038_ai_rls_grants.test.sql
supabase/tests/039_ai_commands_routes.test.sql
supabase/tests/040_ai_workers_retention.test.sql
apps/mobile/src/services/live/{voice-api-service.ts,assistant-api-service.ts}
apps/mobile/src/services/{voice-analyzer-service.ts,assistant-service.ts}
apps/mobile/src/services/contracts/*ai*-parity.test.ts
apps/admin-web/src/features/ai/{contracts.ts,repository.ts}
apps/admin-web/src/tests/ai-live-contract.test.ts
docs/runbooks/ai-voice-operations.md
```

**Structure decision**: one backend AI module owns shared OpenRouter routing,
voice, assistant, governance, privacy, observability, and worker behavior. This is
the smallest boundary that prevents duplicated route/quota/safety logic. Database
functions own integrity and locked transitions; TypeScript owns hostile content
validation, provider transport, strict schema decoding, orchestration, and safe
HTTP/stream translation. Existing client interfaces stay stable.

## Ownership And Boundaries

**Owned resources**: all twenty Phase 09 tables, `voice-temp` policy, voice and
assistant routes, Admin AI routes, model/prompt/safety configuration, OpenRouter
gateway, evaluations, quota/cost/circuit behavior, six worker jobs, eight event
families, metrics/alerts/runbook/evidence, and Phase 09 client adapters.

**Consumed contracts**: platform database/outbox/worker/Storage/telemetry (001);
profile/locale/privacy identity (002); Admin permissions/recent MFA/purpose/audit
(003); currency/category/account ownership (004); ledger create/update/undo (005);
idempotency/replay/version/sync (006); planning evidence reads and confirmed
action commands (007); tracking proposal context (008).

**Explicit exclusions**: reports/exports/email, notifications/support/content,
billing/entitlements, Redis or generalized operations platform, arbitrary tools,
provider web search, direct SQL/API execution from model output, device capture
SDKs, final production-wide mock removal, and all SPEC-BE-010+ resources.

**Client contract impact**: Mobile production voice and assistant selectors use
live Phase 09 adapters and surface explicit unavailable states. Admin AI repository
uses live redacted routes. Fixtures stay reachable only from explicit test/demo
construction. Phase 14 retains wholesale cross-domain activation and release
orchestration.

## Phase 0: Research

[research.md](./research.md) resolves provider routing/privacy, model identifiers,
structured output, audio handling, quota/budget semantics, schema trust boundary,
confirmation bridge, storage/retention, streaming/cancellation, circuit behavior,
evaluation/publication, RLS/Admin permission mapping, client cutover boundary,
performance, rollback, and external gates. No `NEEDS CLARIFICATION` remains.

## Phase 1: Design And Contracts

- [data-model.md](./data-model.md): exact tables, fields, constraints, indexes,
  states, relationships, RLS/grants, lock order, retention, and seeds.
- [contracts/openapi.yaml](./contracts/openapi.yaml): every customer and Admin
  route, strict DTOs, cursors, versions/idempotency, streaming, and stable errors.
- [contracts/openrouter.md](./contracts/openrouter.md): worker-only request,
  provider-route validation, structured schemas, response accounting, retry,
  cancellation, and safe failure rules.
- [contracts/internal-contracts.md](./contracts/internal-contracts.md): quota,
  proposal/preview validation, ledger/domain confirmation, consent, privacy,
  evaluation, and circuit invariants.
- [contracts/events-jobs.md](./contracts/events-jobs.md): safe event schemas and
  six bounded worker protocols.
- [contracts/mobile-admin-mapping.md](./contracts/mobile-admin-mapping.md): every
  executable client method/resource/permission and fixture boundary.
- [quickstart.md](./quickstart.md): runnable validation and expected outcomes.

## Implementation Strategy

1. Capture dependency/current-client evidence and add failing pgTAP inventory/RLS
   tests before config, user, function, access, and seed migrations.
2. Add failing unit/contract tests for strict schemas, DTO boundaries, provider
   privacy/route checks, redaction, quota, budget thresholds, circuit states, and
   stable errors; implement the minimum native-fetch gateway and shared service.
3. Complete vertical slices in story order: voice intake/proposal, voice decision,
   assistant consent/conversation/response, preview decision, Admin governance,
   then operational quota/cost/outage behavior. Run focused red/green gates for
   each slice before proceeding.
4. Register six handlers in the existing worker process with current bounded
   claim, lease, retry, fencing, health, telemetry, audit, and shutdown patterns.
5. Add Mobile and Admin live adapters only after parity tests identify the exact
   translation needed; keep demo/test fixtures explicit and make missing provider
   capability visible.
6. Run evaluation/security/property, SQL plan/load/stress, migration/rollback/
   recovery/reconciliation, code/test reviews, full local gates, scoped commits,
   direct push, and remote workflow repair until green.

## TDD Boundaries

- Nontrivial production behavior begins with a failing behavior test; SQL state
  and authorization semantics use real PostgreSQL, not SQL-string mocks.
- Expected schemas, hashes, thresholds, state changes, and redacted payloads are
  hand-derived literals. Tests do not reproduce production algorithms.
- Mocks stop at real external boundaries: OpenRouter HTTP, Storage, clock, and
  client HTTP transport. Database/audit/outbox/ledger/idempotency remain real in
  integration tests.
- Provider/evaluation fixtures are synthetic Arabic/English cases with no secret
  or customer content. Every implementation/CI regression gets a minimal failing
  reproduction before a forward fix.

## Migration Sequence

1. `phase09_ai_config`: provider/model/route/prompt/test/safety configuration
   tables, constraints, validation trigger, indexes, and no approved route yet.
2. `phase09_ai_tables`: user voice/assistant and immutable usage/failure tables,
   relationships, lifecycle constraints, indexes, and update-version triggers.
3. `phase09_ai_functions`: proposal/preview validation and confirmation, quota,
   job claims/transitions, expiry, purge, evaluation publication, and
   reconciliation functions with fixed search paths and revoked defaults.
4. `phase09_ai_access_seeds`: forced RLS, least grants, private `voice-temp`
   bucket, reviewed provider/model candidates, disabled routes, approved prompt
   fixtures/safety defaults, and no secret/customer/operational seed data.
5. Accepted migrations are immutable; defects use forward migrations and update
   the checked-in checksum manifest.

## Voice And Assistant Flows

```text
owner + key -> metadata validation -> quota decision -> signed private upload
  -> process reserve/replay -> voice job -> approved OpenRouter route
  -> strict schema decode -> deterministic ownership/business validation
  -> redacted transcript + proposal/fields + audit/outbox
  -> owner edit/confirm + version/expiry revalidation
  -> SPEC-BE-005 transaction command -> immutable receipt/status
```

```text
active consent + owner message + key -> quota decision -> assistant job/stream
  -> minimized evidence aliases -> approved prompt/model/provider/ZDR route
  -> strict response schema + safety validation -> redacted message/snapshot
  -> optional short-lived action preview -> owner confirm + reauthorization
  -> owned existing domain command -> immutable result/status
```

Reject, expiry, outage, schema failure, quota exhaustion, or missing compliant
route never crosses the mutation bridge. Replay returns the original result and
does not consume quota or provider cost twice.

## Evidence Plan

| Gate                   | Planned evidence                                                                                    | Blocking threshold                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Requirements/contracts | checklist, YAML parse, operation uniqueness, FR/AC/SC/task trace                                    | zero marker, drift, orphan, or out-of-scope path                                           |
| Database/RLS           | reset, lint, pgTAP 037-040, live owner/nonowner/Admin/worker matrix                                 | 20 tables; zero failure, skip, bypass, or public config leak                               |
| Financial safety       | command spy/live rows, edits, replay, expiry, concurrency, injection/tool attempts                  | zero direct, duplicate, partial, or unauthorized mutation                                  |
| Provider/privacy       | request snapshots, secret scan, ZDR/no-training/allowlist/max-price enforcement, schema adversaries | zero client-provider control, raw log/event content, privacy downgrade, Critical/High      |
| Evaluation/operations  | bilingual/noisy corpus, fallback equivalence, quota/budget/circuit/outage, jobs/retention/reconcile | all schemas/rules pass; 70/85/95 once; 100 stops before call                               |
| Performance/stress     | million usage rows, SQL EXPLAIN, k6 API/worker/stream/cancel/outage                                 | every P95/P99/payload/memory/connection/index budget passes                                |
| Clients                | Mobile type/lint/Jest/parity; Admin type/lint/Vitest/build/Playwright contract                      | live adapters selected in production; missing capability explicit; fixtures test/demo only |
| Migration/recovery     | checksums, clean/repeat/N-1/failed-forward, backup/restore, route rollback, media purge             | no financial/content/trace loss or unowned mutation                                        |
| Containers/remote      | API verify, image/container/non-root, scans, SBOM/signature/provenance, pushed workflow             | all locally executable and required remote jobs green                                      |

## Post-Design Constitution Check

| Gate                          | Result                   | Design evidence                                               |
| ----------------------------- | ------------------------ | ------------------------------------------------------------- |
| Main and one Spec             | PASS                     | synchronized base, feature pointer, scoped paths              |
| Complete consistent artifacts | PASS                     | spec/research/model/contracts/quickstart                      |
| Exclusive ownership           | PASS                     | twenty tables and every route/job/event registered            |
| Existing clients reviewed     | PASS                     | research and client mapping                                   |
| Architecture/operations       | PASS                     | structure, migrations, evidence and runbook plan              |
| Financial integrity           | PASS                     | deterministic validation and confirmed command-only bridge    |
| Security/RLS/secrets/abuse    | PASS                     | route, schema, model, RLS, redaction, quota, safety gates     |
| AI policy                     | PASS                     | OpenRouter only; ZDR/no-training; advisory/no direct mutation |
| Client boundary               | PASS                     | Phase 09 adapters only; Phase 14 retained                     |
| Verification/recovery         | PASS                     | named thresholds, rollback/recovery/reconciliation owners     |
| Direct delivery               | PASS (pending execution) | direct `main` push authorized; no branch/worktree             |

## Complexity Tracking

| Violation | Why Required | Approved By | Follow-up |
| --------- | ------------ | ----------- | --------- |
| None      | N/A          | N/A         | N/A       |
