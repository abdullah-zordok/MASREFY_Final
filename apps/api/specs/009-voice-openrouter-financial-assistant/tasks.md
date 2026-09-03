# Tasks: Voice, OpenRouter AI & Financial Assistant

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), and all Phase 1 design artifacts
**Scope**: Phase 09 / SPEC-BE-009 ownership only
**Tests**: Required before implementation completion

Every task uses the required checklist form. `[P]` means different files and no
incomplete dependency. User-story tests precede the production behavior they
verify. No task may create a SPEC-BE-010+ resource.

## Phase 1: Baseline And Contract Review

- [x] T001 Record synchronized `main`, base SHA, origin SHA, protected untracked paths, Node/Docker/Supabase versions, and absent SpecKit helper scripts in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/baseline.md`; verify `git status --short --branch` still shows only the scoped artifacts plus the three protected paths
- [x] T002 [P] Record the executable SPEC-BE-001..008 database/API/worker/privacy/ledger/idempotency dependencies in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/dependencies.md`; verify every consumed symbol/path exists with `rg`
- [x] T003 [P] Record current Mobile voice/assistant selectors, interfaces, fixtures, release-unavailable behavior, and call sites in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/mobile-baseline.md`; verify every listed path exists
- [x] T004 [P] Record current Admin AI contracts, repository, permissions, pages, MSW handlers, fixtures, and call sites in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/admin-baseline.md`; verify every listed path exists
- [x] T005 Validate `contracts/openapi.yaml` parses, contains 47 unique operation IDs, and has no unresolved local reference in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/artifacts.md`; run the Node/js-yaml artifact check
- [x] T006 Trace all 48 FRs, 21 ACs, 10 SCs, twenty tables, 47 operations, six jobs, and nine events to tasks in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/artifact-analysis.md`; verify no Critical/High inconsistency remains

---

## Phase 2: Blocking Foundations

- [x] T007 Add failing Phase 09 table/column/constraint/index inventory tests in `supabase/tests/037_ai_structure.test.sql`; run `npm --prefix apps/api run test:db` and retain the expected RED failure
- [x] T008 Add failing owner/nonowner/anonymous/worker/Admin RLS and grant tests in `supabase/tests/038_ai_rls_grants.test.sql`; run `npm --prefix apps/api run test:db` and retain the expected RED failure
- [x] T009 Add failing route/prompt/model/privacy/price/fallback/quota/budget/command SQL tests in `supabase/tests/039_ai_commands_routes.test.sql`; run `npm --prefix apps/api run test:db` and retain the expected RED failure
- [x] T010 Add failing claim/fence/expiry/purge/privacy/reconciliation SQL tests in `supabase/tests/040_ai_workers_retention.test.sql`; run `npm --prefix apps/api run test:db` and retain the expected RED failure
- [x] T011 Implement provider/model/route/prompt/case/safety tables and route validation trigger in `supabase/migrations/20260903090000_phase09_ai_config.sql`; run pgTAP 037 and the config subset of 039 GREEN
- [x] T012 Implement voice/assistant/usage/failure/report tables and lifecycle constraints in `supabase/migrations/20260903090100_phase09_ai_tables.sql`; run pgTAP 037 GREEN
- [x] T013 Implement quota/budget, validation/confirmation, prompt publication, job claims/transitions, expiry, purge, and reconciliation functions in `supabase/migrations/20260903090200_phase09_ai_functions.sql`; run pgTAP 039-040 GREEN
- [x] T014 Implement forced RLS, least grants, private `voice-temp` bucket, reviewed disabled models/routes, prompts/corpus, and safety seeds in `supabase/migrations/20260903090300_phase09_ai_access_seeds.sql`; run pgTAP 038 and all Phase 09 pgTAP GREEN
- [x] T015 Update the tracked migration checksum manifest using `npm --prefix apps/api run migration:checksums:update`; verify `npm --prefix apps/api run migration:checksums`
- [x] T016 Add Phase 09 environment validation and safe defaults in `apps/api/src/platform/config/environment.schema.ts` and `apps/api/src/platform/config/platform-config.service.ts`; verify focused config unit tests reject secrets/routes in client-owned values and accept missing key only while routes are disabled
- [x] T017 Add failing strict DTO/schema/redaction/provider-policy tests in `apps/api/test/unit/ai/ai-foundation.spec.ts`; run the focused unit test and retain RED
- [x] T018 Implement closed voice/assistant/Admin DTO parsing and stable error mapping in `apps/api/src/ai/ai.dto.ts`; run the focused foundation test GREEN
- [x] T019 Implement strict voice/assistant JSON schemas, safety validation, evidence aliases, and redaction in `apps/api/src/ai/ai.schemas.ts`; run focused schema/adversarial tests GREEN
- [x] T020 Implement typed database mapping, replay/quota/effective-route/job primitives in `apps/api/src/ai/ai.repository.ts`; run focused repository unit tests GREEN
- [x] T021 Implement the worker-only native-fetch gateway, deadline, cancellation, structured output, accounting, bounded retry/fallback, and circuit in `apps/api/src/ai/ai.gateway.ts`; run focused mock-provider tests GREEN
- [x] T022 Implement canonical safe event builders and label allowlist in `apps/api/src/ai/ai.events.ts` and `apps/api/src/ai/ai.observability.ts`; run focused content-leak/label-cardinality tests GREEN
- [x] T023 Wire API/worker-only providers without exposing gateway/key to controllers in `apps/api/src/ai/ai.module.ts`; run module graph tests GREEN

**Gate**: migrations reset/lint/pgTAP, foundation unit tests, route privacy, quota,
and module composition pass before story implementation.

---

## Phase 3: User Story 1 - Turn Voice Into a Reviewable Proposal (P1)

**Goal**: authenticated owners upload bounded private audio and receive a strict,
redacted, reviewable proposal without a financial mutation.

**Independent test**: focused contract/integration/E2E voice intake and worker
tests return signed upload/202/status/proposal, reject hostile/nonowner input, and
show zero ledger command calls.

### Tests

- [x] T024 [US1] Add failing voice route/schema/status/error contract tests in `apps/api/test/contract/ai/voice.contract-spec.ts`; run focused contract test RED
- [x] T025 [P] [US1] Add failing private upload/object validation and lifecycle integration tests in `apps/api/test/integration/ai/voice-storage.spec.ts`; run focused integration test RED
- [x] T026 [P] [US1] Add failing Arabic/English/noisy/missing-field/schema-retry worker tests in `apps/api/test/integration/ai/voice-worker.spec.ts`; run focused integration test RED
- [x] T027 [P] [US1] Add failing voice BOLA/media abuse/redaction tests in `apps/api/test/security/ai/voice-security.spec.ts`; run focused security test RED

### Implementation

- [x] T028 [US1] Implement signed private session creation, owner status/proposal reads, and media verification orchestration in `apps/api/src/ai/ai.service.ts`; run T024-T025 GREEN
- [x] T029 [US1] Implement Voice HTTP endpoints in `apps/api/src/ai/ai.controller.ts`; run T024 and T027 GREEN
- [x] T030 [US1] Implement `voice.transcribe_extract` claim, provider call, strict decode, deterministic validation, redacted persistence, event, and eager purge in `apps/api/src/ai/ai.worker.ts`; run T026 GREEN
- [x] T031 [US1] Add owner-to-proposal happy/error path E2E tests in `apps/api/test/e2e/ai/voice.e2e-spec.ts`; run focused E2E GREEN and prove no transaction row changed

**Checkpoint**: voice input produces only a validated proposal; provider/raw media
content is absent from responses, logs, events, usage, and database content fields.

---

## Phase 4: User Story 2 - Confirm Or Reject A Voice Proposal (P1)

**Goal**: owner edits are revalidated and confirmation invokes the existing ledger
command exactly once; rejection/expiry never does.

**Independent test**: focused concurrency/live DB E2E shows one transaction for
same-key and concurrent confirmations, safe conflicts otherwise, and none for
reject/expiry/nonowner/stale/invalid edits.

### Tests

- [x] T032 [US2] Add failing confirm/reject/edit/version/expiry/replay contract tests to `apps/api/test/contract/ai/voice.contract-spec.ts`; run focused cases RED
- [x] T033 [P] [US2] Add failing live ledger-command-only and concurrent confirmation tests in `apps/api/test/integration/ai/voice-confirmation.spec.ts`; run focused integration RED
- [x] T034 [P] [US2] Add failing nonowner/injection/ID substitution tests to `apps/api/test/security/ai/voice-security.spec.ts`; run focused cases RED

### Implementation

- [x] T035 [US2] Implement edit/reject/expiry/replay/lock validation and stable ledger mapping in `apps/api/src/ai/ai.service.ts`; run T032-T034 GREEN
- [x] T036 [US2] Expose confirm/reject endpoints and error/status mapping in `apps/api/src/ai/ai.controller.ts`; run T032 GREEN
- [x] T037 [US2] Add end-to-end command/audit/outbox/result evidence in `apps/api/test/e2e/ai/voice-confirmation.e2e-spec.ts`; run focused E2E GREEN

**Checkpoint**: every executed voice proposal has one matching ledger transaction,
audit, and outbox record; AI code has no direct financial SQL path.

---

## Phase 5: User Story 3 - Use A Consented Financial Assistant (P1)

**Goal**: current consent and owner context yield a bounded response with safe
evidence aliases through async or SSE transport.

**Independent test**: focused tests cover consent grant/revoke, owner cursor pages,
context minimization, response persistence, stream/cancel/outage, and no preview
execution.

### Tests

- [x] T038 [US3] Add failing consent/conversation/message/page/SSE/error contracts in `apps/api/test/contract/ai/assistant.contract-spec.ts`; run focused contract RED
- [x] T039 [P] [US3] Add failing evidence authorization/minimization and message persistence tests in `apps/api/test/integration/ai/assistant-response.spec.ts`; run focused integration RED
- [x] T040 [P] [US3] Add failing injection/tool/SQL/URL/bidi/content leakage tests in `apps/api/test/security/ai/assistant-security.spec.ts`; run focused security RED
- [x] T041 [P] [US3] Add failing streaming fragmentation/deadline/disconnect/cancellation tests in `apps/api/test/unit/ai/ai-stream.spec.ts`; run focused unit RED

### Implementation

- [x] T042 [US3] Implement consent, conversation/message pages, evidence assembly, enqueue, persistence, and cancellation orchestration in `apps/api/src/ai/ai.service.ts`; run T038-T041 GREEN
- [x] T043 [US3] Expose assistant consent/conversation/message async and SSE endpoints in `apps/api/src/ai/ai.controller.ts`; run T038 and T041 GREEN
- [x] T044 [US3] Implement `assistant.respond` worker path with consent recheck, minimized evidence, strict decode, snapshot, event, and no-store headers in `apps/api/src/ai/ai.worker.ts`; run T039-T040 GREEN
- [x] T045 [US3] Add end-to-end consent/response/revoke/cancel evidence in `apps/api/test/e2e/ai/assistant.e2e-spec.ts`; run focused E2E GREEN

**Checkpoint**: no assistant response exists without valid enqueue/dispatch consent;
only complete strict responses persist and evidence never confers authority.

---

## Phase 6: User Story 4 - Review And Execute Assistant Action Previews (P1)

**Goal**: allowlisted previews are reviewable and only explicit current-owner
confirmation can invoke a named existing domain command once.

**Independent test**: focused tests cover every allowlisted mapping plus unknown
action, stale/expired/revoked/nonowner/concurrent/replay and injected-tool cases.

### Tests

- [x] T046 [US4] Add failing preview response/confirm/reject contracts to `apps/api/test/contract/ai/assistant.contract-spec.ts`; run focused cases RED
- [x] T047 [P] [US4] Add failing action mapping and domain-command integration tests in `apps/api/test/integration/ai/assistant-actions.spec.ts`; run focused integration RED
- [x] T048 [P] [US4] Add failing preview escalation/ownership/injection tests to `apps/api/test/security/ai/assistant-security.spec.ts`; run focused cases RED

### Implementation

- [x] T049 [US4] Implement preview validation, persistence, reject/expiry, reauthorization, and allowlisted existing-command mappings in `apps/api/src/ai/ai.service.ts`; run T046-T048 GREEN
- [x] T050 [US4] Expose preview confirm/reject, feedback, and response-report endpoints in `apps/api/src/ai/ai.controller.ts`; run contract tests GREEN
- [x] T051 [US4] Add end-to-end preview command/audit/outbox/replay proof in `apps/api/test/e2e/ai/assistant-actions.e2e-spec.ts`; run focused E2E GREEN

**Checkpoint**: preview text/payload cannot select code; executed rows reconcile to
exactly one authorized existing domain command.

---

## Phase 7: User Story 5 - Govern Providers, Models, Routes, Prompts, And Safety (P2)

**Goal**: exact-permission Admin workflows manage only redacted, reviewed,
versioned configuration and corpus-gated publication.

**Independent test**: Admin contract/security/integration tests cover every
permission, recent MFA/reason/version/idempotency, invalid fallback/privacy/price,
corpus failure, publication race, and audit/outbox result.

### Tests

- [x] T052 [US5] Add failing Admin AI OpenAPI/DTO/route response contracts in `apps/api/test/contract/ai/admin-ai.contract-spec.ts`; run focused contract RED
- [x] T053 [P] [US5] Add failing provider/model/route/prompt/corpus/safety mutation integration tests in `apps/api/test/integration/ai/admin-ai.spec.ts`; run focused integration RED
- [x] T054 [P] [US5] Add failing exact-permission/MFA/reason/BFLA/redaction tests in `apps/api/test/security/ai/admin-ai-security.spec.ts`; run focused security RED
- [x] T055 [P] [US5] Add failing prompt evaluation/publication/race tests in `apps/api/test/integration/ai/ai-evaluation.spec.ts`; run focused integration RED

### Implementation

- [x] T056 [US5] Implement bounded Admin queries and governed mutation/publication orchestration in `apps/api/src/ai/ai.service.ts` and `apps/api/src/ai/ai.repository.ts`; run T053-T055 GREEN
- [x] T057 [US5] Implement exact-permission Admin AI routes in `apps/api/src/ai/ai.admin.controller.ts`; run T052 and T054 GREEN
- [x] T058 [US5] Implement `ai.evaluate_route` corpus worker with no action execution and safe summaries in `apps/api/src/ai/ai.worker.ts`; run T055 GREEN
- [x] T059 [US5] Register exact Phase 09 permissions in `apps/api/src/security/permission-manifest.ts`; run permission manifest and Admin security tests GREEN
- [x] T060 [US5] Add end-to-end governed route/prompt/safety/audit/outbox evidence in `apps/api/test/e2e/ai/admin-ai.e2e-spec.ts`; run focused E2E GREEN

**Checkpoint**: only a corpus-passing, approved, privacy-compatible route can be
enabled; no secret or customer/provider content reaches Admin DTOs.

---

## Phase 8: User Story 6 - Operate Within Quota, Cost, And Outage Limits (P2)

**Goal**: requests obey rolling quota, price/token caps, budget thresholds/hard
stop, accounting, bounded fallback, circuit isolation, expiry, purge, and recovery.

**Independent test**: focused clock/concurrency/provider/worker tests prove five
accepted work items, once-only thresholds, no HTTP at 100, equivalent fallback,
bounded attempts, finance health during outage, and idempotent recovery.

### Tests

- [x] T061 [US6] Add failing rolling-window/replay/concurrent quota tests in `apps/api/test/integration/ai/ai-quota.spec.ts`; run focused integration RED
- [x] T062 [P] [US6] Add failing price/token/reservation/70-85-95-100/accounting tests in `apps/api/test/integration/ai/ai-budget.spec.ts`; run focused integration RED
- [x] T063 [P] [US6] Add failing fallback/privacy/circuit/deadline/outage tests in `apps/api/test/unit/ai/ai-gateway.spec.ts`; run focused unit RED
- [x] T064 [P] [US6] Add failing claim/fence/reclaim/shutdown/expiry/purge/reconcile tests in `apps/api/test/integration/ai/ai-worker-recovery.spec.ts`; run focused integration RED

### Implementation

- [x] T065 [US6] Complete quota/budget reservation/accounting/threshold/reconcile paths in `apps/api/src/ai/ai.repository.ts` and `apps/api/src/ai/ai.service.ts`; run T061-T062 GREEN
- [x] T066 [US6] Complete privacy-equivalent fallback and circuit/outage isolation in `apps/api/src/ai/ai.gateway.ts`; run T063 GREEN
- [x] T067 [US6] Implement `ai.usage_rollup`, `ai.proposals.expire`, and `voice-media.purge` handlers plus recovery/shutdown behavior in `apps/api/src/ai/ai.worker.ts`; run T064 GREEN
- [x] T068 [US6] Register API and worker module composition in `apps/api/src/app.module.ts`, `apps/api/src/worker.module.ts`, and privacy handler wiring in `apps/api/src/security/security.module.ts` / `security.worker.ts`; run module, privacy, and full focused AI suites GREEN
- [x] T069 [US6] Add end-to-end quota/budget/outage/core-finance-isolation evidence in `apps/api/test/e2e/ai/ai-operations.e2e-spec.ts`; run focused E2E GREEN

**Checkpoint**: quota/budget/circuit failures are visible and safe; provider outage
does not fail ledger/planning/tracking health or loosen privacy.

---

## Phase 9: Mobile And Admin Phase 09 Adapters

- [x] T070 Add failing Mobile voice OpenAPI parity and provider-selection tests in `apps/mobile/src/services/contracts/voice-api-parity.test.ts`; run focused Mobile Jest RED
- [x] T071 [P] Add failing Mobile assistant OpenAPI parity and provider-selection tests in `apps/mobile/src/services/contracts/assistant-api-parity.test.ts`; run focused Mobile Jest RED
- [x] T072 Implement the minimum live voice API workflow adapter in `apps/mobile/src/services/live/voice-api-service.ts` and production selector in `apps/mobile/src/services/voice-analyzer-service.ts`; run T070 and existing voice tests GREEN
- [x] T073 Implement the minimum live assistant API adapter in `apps/mobile/src/services/live/assistant-api-service.ts` and existing assistant selector/context wiring; run T071 and existing assistant tests GREEN
- [x] T074 Add release-mode explicit unavailable and zero-silent-fixture regression tests in `apps/mobile/src/services/contracts/ai-release-unavailable.test.ts`; run focused Mobile Jest GREEN
- [x] T075 Add failing Admin AI OpenAPI/permission/repository parity tests in `apps/admin-web/src/tests/ai-live-contract.test.ts`; run focused Admin Vitest RED
- [x] T076 Normalize Admin AI contracts and implement live repository HTTP mapping in `apps/admin-web/src/features/ai/contracts.ts` and `apps/admin-web/src/features/ai/repository.ts`; run T075 and existing AI tests GREEN
- [x] T077 Make Admin AI MSW selection explicit test/demo-only and production fail closed in `apps/admin-web/src/mocks/handlers/ai.ts` and provider configuration; run Admin AI tests GREEN
- [x] T078 Verify Mobile and Admin production bundles contain no OpenRouter secret, direct provider URL, hidden mock fallback, or raw content logging; record commands/results in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/client-contracts.md`

---

## Phase 10: Hardening, Performance, Recovery, And Acceptance

- [x] T079 Add AI-specific package scripts without a dependency in `apps/api/package.json`; verify JSON parse and every named script resolves to an existing test/runner
- [x] T080 Add production-like AI SQL seed/EXPLAIN checks in `apps/api/test/performance/ai.sql`; verify critical plans use bounded indexed access at one million usage/failure rows
- [x] T081 Add k6 AI API/worker/quota/outage/cancel scenario in `apps/api/test/performance/ai.k6.js` and native runner in `apps/api/test/performance/run-ai.ts`; run syntax and threshold checks
- [x] T082 Run normal and stress AI performance gates and record P95/P99/payload/heap/connection/queue results in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/performance.md`; every planned threshold must pass
- [x] T083 Add Phase 09 privacy export/deletion handler in `apps/api/src/ai/ai-privacy.handler.ts` and focused tests in `apps/api/test/integration/ai/ai-privacy.spec.ts`; verify restartable purge and preserved finance/audit evidence
- [x] T084 Add migration clean/repeat/N-1/failed-forward/backup-restore/route-rollback/media-recovery E2E tests in `apps/api/test/e2e/ai/ai-recovery.e2e-spec.ts`; run the focused recovery suite GREEN
- [x] T085 Write operator procedures for enable/disable, key/account policy, evaluations, budget, circuit, provider outage, prompt/route rollback, queue drain, media purge, reconcile, restore, and external gates in `docs/runbooks/ai-voice-operations.md`; verify every command exists
- [x] T086 Execute and record OWASP/MASVS/BOLA/BFLA/injection/SSRF/content-leak/RLS/grant/secret/dependency/SAST findings in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/security-review.md`; zero unresolved Critical/High
- [x] T087 Execute the clean-code guard over every changed production file and record resolved findings in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/clean-code-review.md`; zero unresolved release blocker
- [x] T088 Execute the test guard over every changed test and record independence/mocking/async/boundary/flakiness findings in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/test-review.md`; zero unresolved release blocker
- [x] T089 Request an independent code review agent for the complete scoped diff and record findings/resolutions in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/code-review.md`; zero unresolved correctness/security blocker
- [x] T090 Run SpecKit converge against spec/plan/tasks/code and append any remaining work as new tasks to this file; record the audit in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/convergence.md`
- [x] T091 Execute every appended convergence task test-first and rerun its focused verification; no unchecked convergence task remains
- [x] T092 Run fresh Supabase reset, lint, all pgTAP, migration checksums, and live database/integration/E2E/recovery gates; record exact counts/results in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/database.md`
- [x] T093 Run fresh API typecheck, lint, format, unit, contract, integration, E2E, security, build, dependency, workflow, and container/image gates; record counts/results in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/api.md`
- [x] T094 Run fresh Mobile lint/typecheck/full Jest and Admin lint/typecheck/full Vitest/build/Playwright gates; record counts/results in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/clients.md`
- [x] T095 Run live OpenRouter evaluation only if a usable key and reviewed policy exist; otherwise record the provider gate pending without a pass in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/external-gates.md`
- [x] T096 Audit the final diff for exact Phase 09 ownership, no SPEC-BE-010+ implementation, no protected untracked path, no secret, and no generated junk in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/final-audit.md`; verify `git diff --check`
- [x] T097 Mark only evidence-backed DoD/spec/tasks checklist items complete and create `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/final-summary.md` with SHAs, counts, thresholds, known external gates, and rollback state
- [ ] T098 Stage only reviewed Phase 09 paths, create the implementation commit on `main`, and record the SHA in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/commits.md`; verify protected paths remain untracked/unstaged
- [ ] T099 Push the verified implementation commit directly to `origin/main`; verify local `main` equals `origin/main`
- [ ] T100 Monitor the resulting remote workflow, fix actionable failures forward on `main` with a failing reproduction, rerun affected/full gates, push repairs, and record run/job links and final green status in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/remote.md`
- [ ] T101 Create and push a scoped closeout commit only if post-push evidence changed, verify its remote workflow green, and record final local/origin SHAs in `apps/api/specs/009-voice-openrouter-financial-assistant/evidence/commits.md`

## Dependencies

```text
Phase 1 baseline/contracts
  -> Phase 2 database + shared gateway foundations
  -> US1 voice proposal -> US2 voice confirmation
  -> US3 assistant response -> US4 preview confirmation
  -> US5 Admin governance
  -> US6 quota/cost/outage/recovery
  -> client adapters
  -> hardening/reviews/converge/full verification/direct delivery
```

US1 and US3 may proceed independently after Phase 2. US2 depends on US1; US4 on
US3. US5 can proceed beside story work after route foundations. US6 integrates
all provider-bound paths and therefore follows US1/US3/US5.

## Parallel Execution Examples

- After T006: pgTAP files T007-T010 use separate files, but implementation waits
  for their combined expected RED result.
- After T023: voice contract/storage/worker/security tests T024-T027 use separate
  files; assistant tests T038-T041 can be authored independently.
- Admin contracts/security T052/T054 and client parity T070/T071/T075 use separate
  applications/files after OpenAPI stabilizes.
- Performance, runbook, and privacy test authoring may proceed on nonoverlapping
  paths after all production flows are stable.

## Implementation Strategy

The MVP is US1+US2: voice creates an inert proposal and explicit confirmation uses
the existing ledger command. Assistant, governance, operations, and clients then
reuse the same route/schema/quota boundaries. No generalized agent/tool platform,
vector store, SDK, or later-domain integration is built.

## Completion Rule

Do not mark a task complete or claim a verification result unless the named
command/procedure executed successfully and its evidence was retained. After all
local pre-push gates pass, push directly to `main`, collect required remote/image/
SBOM/signature/provenance evidence where triggered, fix failures forward, and
complete the Definition of Done only after all local and remote gates pass or a
named provider/release action is proven genuinely external.
