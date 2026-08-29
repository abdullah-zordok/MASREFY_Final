# Tasks: Admin RBAC, RLS, Audit & Security Foundation

**Input**: `apps/api/specs/003-admin-rbac-security/spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/`
**Scope**: Phase 03 / SPEC-BE-003 backend ownership only
**Tests**: Jest, pgTAP, security, performance, container, and recovery evidence are required
**Branch**: Implement directly on synchronized `main`; do not create a backend branch or worktree

Every task uses the required checklist form. `[P]` means the task can run in parallel after its phase prerequisites because it owns different files. Story tasks use `[USn]` labels; baseline, foundational, and final tasks do not.

## Phase 1: Baseline And Contract Review

**Purpose**: Reconfirm the main-first baseline, exclusive ownership, current client contracts, and cross-artifact consistency before implementation.

- [X] T001 Verify `main`, `HEAD...origin/main`, base revision, active feature pointer, and unrelated changes; record the exact command output and preserved `.agents/plugins` state in `apps/api/specs/003-admin-rbac-security/checklists/implementation-baseline.md`
- [X] T002 [P] Re-read current API/worker/identity/outbox/config/test seams and update any factual path drift in `apps/api/specs/003-admin-rbac-security/plan.md`; verify with `rg --files apps/api/src apps/api/test supabase`
- [X] T003 [P] Reconcile the current Admin 151-key role map/security/governance Zod contracts and Mobile security/privacy service contracts in `apps/api/specs/003-admin-rbac-security/contracts/client-mapping.md`; verify zero client edits with `git diff --exit-code -- apps/admin-web apps/mobile`
- [X] T004 Confirm migration slots after `20260827001300`, all 16 owned tables, four functions, 38 paths/45 operations, five jobs, ten event names, and exclusions in `apps/api/specs/003-admin-rbac-security/checklists/ownership-inventory.md`; verify against `data-model.md` and `contracts/openapi.yaml`
- [X] T005 Run `speckit-analyze`, resolve every Critical/High or Constitution conflict across `spec.md`, `plan.md`, and this task list, and retain the result in `apps/api/specs/003-admin-rbac-security/checklists/artifact-analysis.md`

**Gate**: Baseline is synchronized on `main`, no other Backend Spec owns the diff, client paths are factual, and cross-artifact analysis has no unresolved blocking finding.

---

## Phase 2: Blocking Foundations

**Purpose**: Establish shared dependency/configuration, immutable manifests/contracts, the complete ordered schema, grants/RLS, and module composition required by every story.

- [X] T006 Add the single streaming ZIP dependency and matching type package only if required by the selected release in `apps/api/package.json` and `apps/api/package-lock.json`; verify with `npm --prefix apps/api install --package-lock-only` followed by `npm --prefix apps/api run security:dependencies`
- [X] T007 [P] Add fail-closed API/worker/migration configuration tests for every variable and process scope in `apps/api/test/unit/config/security-environment.schema.spec.ts`; verify with `npm --prefix apps/api run test:unit -- security-environment.schema`
- [X] T008 Implement the Phase 03 environment names, bounds, secret isolation, and route-enable default in `apps/api/src/platform/config/environment.types.ts`, `apps/api/src/platform/config/environment.schema.ts`, and `apps/api/.env.example`; verify T007 passes without printing values
- [X] T009 [P] Add exact 151-key count, alias uniqueness, seven-role mapping, and Admin drift contract tests in `apps/api/test/contract/security/permission-manifest.contract-spec.ts`; verify the test fails on a missing, duplicate, unmapped, or unexpected key
- [X] T010 Implement the immutable server permission/alias/system-role manifest in `apps/api/src/security/permission-manifest.ts`; verify with `npm --prefix apps/api run test:contract -- permission-manifest`
- [X] T011 [P] Add schema/privacy tests for all ten Phase 03 event payloads and the alert input in `apps/api/test/contract/security/security-events.contract-spec.ts`; verify free text, email, token, URL, Storage key, and unknown fields are rejected
- [X] T012 Implement safe event builders matching `contracts/events.md` in `apps/api/src/security/security.events.ts`; verify with `npm --prefix apps/api run test:contract -- security-events`
- [X] T013 [P] Add duplicate/missing handler, deterministic-order, closed support-scope, and startup-manifest tests in `apps/api/test/unit/security/privacy-handlers.spec.ts`; verify unknown resource/action and handler drift fail closed
- [X] T014 Implement the typed support-scope and privacy-handler registry contracts in `apps/api/src/security/privacy-handlers.ts`; verify with `npm --prefix apps/api run test:unit -- privacy-handlers`
- [X] T015 Create Admin profile, role, permission, mapping, assignment, and invitation tables/constraints/indexes in `supabase/migrations/20260829062150_admin_access_tables.sql`; verify a clean `npm --prefix apps/api run db:reset` reaches the next migration
- [X] T016 Seed all canonical permissions, twelve explicit aliases, and seven system roles deterministically in `supabase/migrations/20260829062152_admin_permission_role_seeds.sql`; verify repeated seed execution is stable and the manifest hash matches T009
- [X] T017 Create immutable `public.security_events`, `audit.audit_events`, indexes, and immutability enforcement in `supabase/migrations/20260829062155_audit_security_events.sql`; verify runtime roles have no update/delete path
- [X] T018 Create support request/grant and security incident/timeline tables with closed bounds and indexes in `supabase/migrations/20260829062158_support_access_incidents.sql`; verify request/approval/scope/time constraints reject invalid rows
- [X] T019 Create privacy export, deletion request, retention policy, and retention hold tables/indexes in `supabase/migrations/20260829062200_privacy_retention.sql`; verify owner-active uniqueness, lifecycle checks, and bounded hold lookup plans
- [X] T020 Implement fixed-search-path permission/support/audit functions, guarded invariants, version triggers, forced RLS, revocations, and minimum grants in `supabase/migrations/20260829062203_admin_security_functions_rls_grants.sql`; verify no `PUBLIC`, `anon`, `authenticated`, owner, or BYPASSRLS escape exists
- [X] T021 Add structural/seed/function/grant smoke coverage for the complete ordered schema in `supabase/tests/009_admin_rbac_structure.test.sql`; verify with `npm --prefix apps/api run test:db`
- [X] T022 Update `supabase/migration-checksums.sha256` and prove clean apply, lint, pgTAP, and immutable-history checks with `npm --prefix apps/api run db:reset`, `db:lint`, `test:db`, and `migration:checksums`
- [X] T023 Create the shared `SecurityModule`/`SecurityWorkerModule` composition and empty API/worker lifecycle seams in `apps/api/src/security/security.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/worker.module.ts`, and `apps/api/src/worker.ts`; verify API/worker/migration builds without exposing a route before the enable gate

**Gate**: All ordered migrations, seeds, functions, forced RLS/grants, shared manifests, configuration, and process composition pass before story implementation begins.

---

## Phase 3: User Story 1 - Authorize Every Admin Action Exactly (P1)

**Goal**: A verified Clerk session authorizes an Admin action only when the database finds an active profile, active Admin, time-valid assignment, enabled role, and exact permission; every uncertain or client-asserted state denies.

**Independent test**: `npm --prefix apps/api run test:integration -- admin-permission` and `npm --prefix apps/api run security:scope` prove exact allow/deny behavior for active, inactive, expired, revoked, future, anonymous, customer-only, worker, wrong-key, wildcard, role-header, Clerk-metadata, and evaluator-failure cases; permission DB P95 is at most 25 ms.

### Tests

- [ ] T024 [P] [US1] Add unit cases for exact key validation, missing Admin/MFA state, request-scoped reuse, and safe denial mapping in `apps/api/test/unit/security/admin-auth.guard.spec.ts`; verify with `npm --prefix apps/api run test:unit -- admin-auth.guard`
- [ ] T025 [P] [US1] Add positive/negative/time-window permission and grant tests in `supabase/tests/010_admin_permission_rls.test.sql`; verify exact keys only and immediate disable/revoke denial with `npm --prefix apps/api run test:db`
- [ ] T026 [P] [US1] Add live transaction-context and evaluator-failure coverage in `apps/api/test/integration/security/admin-permission.spec.ts`; verify the API connection role cannot bypass RLS or call ungranted functions
- [ ] T027 [P] [US1] Add client-assertion, wildcard, related-key, stale-state, and route-enable negative coverage in `apps/api/test/security/admin/exact-permission-boundary.spec.ts`; verify with `npm --prefix apps/api run security:scope`

### Implementation

- [ ] T028 [US1] Implement exact database permission and recent-auth/MFA enforcement over the existing `ClerkPrincipal` in `apps/api/src/security/admin-auth.guard.ts`; verify T024 and T027 pass
- [ ] T029 [US1] Implement verified-claims Admin transactions, authoritative time, permission assertion, bounded query helpers, and stable denial handling in `apps/api/src/security/security.repository.ts`; verify T025 and T026 pass
- [ ] T030 [US1] Add permission metadata/decorators and request-scoped subject-permission-target reuse only within one request in `apps/api/src/security/security.service.ts`; verify changing an assignment between requests takes effect immediately
- [ ] T031 [US1] Wire exact permission and route-enable checks to every Admin operation shell in `apps/api/src/security/security.controller.ts` and `apps/api/src/security/security.module.ts`; verify all `x-permission` OpenAPI operations have one matching guard key
- [ ] T032 [US1] Add permission fan-out seed, redacted `EXPLAIN` capture, and P95 runner in `apps/api/test/performance/security-permission-queries.sql` and `apps/api/test/performance/security-permission.k6.js`; verify P95 <=25 ms without shared cache or unbounded scan
- [ ] T033 [US1] Run the US1 unit/pgTAP/integration/security/performance commands and record FR-001–FR-005, FR-012–FR-013, AC-002, SC-001–SC-002 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us1-exact-authorization.md`

**Checkpoint**: Every Admin route shell denies by default and can be independently proven to accept only its exact database permission.

---

## Phase 4: User Story 2 - Manage Administrators, Roles, and Invitations Safely (P1)

**Goal**: Authorized administrators can invite/accept, list, disable, revoke eligible sessions, create/update roles, assign/revoke roles, and preserve one effective super-admin with MFA, reason, version, audit, outbox, and safe retry behavior.

**Independent test**: `npm --prefix apps/api run test:e2e -- admin-access` proves invitation token/email safety, verified-email acceptance, seven roles/151 keys, self-elevation denial, last-super-admin continuity, exact permissions, MFA, versions, audit/outbox atomicity, Clerk outage behavior, and no duplicate effects.

### Tests

- [ ] T034 [P] [US2] Add strict DTO/Unicode/bounds/version/idempotency plus invitation-token entropy/hash/redaction tests in `apps/api/test/unit/security/admin-access.dto.spec.ts`; verify unknown/mass-assigned fields, unsafe text, weak tokens, and raw-token output fail
- [ ] T035 [P] [US2] Add runtime OpenAPI and safe response parity for all Admin access routes in `apps/api/test/contract/security/admin-access.contract-spec.ts`; verify tokens, raw emails, Clerk IDs/sessions, and mock confirmation values never appear
- [ ] T036 [P] [US2] Add atomic role/invitation/assignment/disable/session command, self-action, concurrency, audit, and outbox tests in `apps/api/test/integration/security/admin-access.spec.ts`; verify one winner and no partial mutation
- [ ] T037 [P] [US2] Add Clerk invitation acceptance, wrong-email, expired-token, orphan-delivery, and session-revoke outage flows in `apps/api/test/e2e/security/admin-invitations-sessions.e2e-spec.ts`; verify local denial remains fail closed
- [ ] T038 [P] [US2] Add last-super-admin, seed drift, system-role protection, active-assignment, and stale-version E2E flows in `apps/api/test/e2e/security/admin-rbac.e2e-spec.ts`; verify every rejected action has safe evidence only

### Implementation

- [ ] T039 [US2] Extend invitation delivery, verified primary-email lookup, and bounded session revocation through the existing official SDK in `apps/api/src/identity/clerk-client.service.ts`; verify provider errors map to stable safe codes
- [ ] T040 [US2] Implement strict Admin/invitation/role/assignment request and redacted response contracts in `apps/api/src/security/security.dto.ts`; verify T034 and T035 pass
- [ ] T041 [US2] Implement guarded Admin listing/detail, invitation persistence/acceptance, role mapping, assignment, disable, continuity locks, audit, and outbox SQL in `apps/api/src/security/security.repository.ts`; verify T036 and T038 pass
- [ ] T042 [US2] Implement masking, deterministic aliases, natural repeat handling, provider ordering, and safe session projections in `apps/api/src/security/security.service.ts`; verify no raw invitation token or email reaches response/log fixtures
- [ ] T043 [US2] Implement canonical Admin access routes from `contracts/openapi.yaml` in `apps/api/src/security/security.controller.ts`; verify T035 and both US2 E2E suites pass
- [ ] T044 [US2] Implement a route-disabled, advisory-locked, idempotent first-super-admin deployment command and package script in `apps/api/src/security/admin-bootstrap.ts` and `apps/api/package.json`; verify repeated execution creates one audited assignment and no migration fixture
- [ ] T045 [US2] Document two-person bootstrap, permission drift, invitation/token incident, session-provider outage, and super-admin recovery in `apps/api/docs/runbooks/admin-permission-bootstrap-recovery.md`; verify every step has owner, safe evidence, rollback, and closure checks
- [ ] T046 [US2] Run the US2 unit/contract/integration/E2E/security commands and record FR-006–FR-011, FR-016–FR-019, FR-039–FR-041, FR-047, AC-003–AC-006, SC-003 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us2-admin-governance.md`

**Checkpoint**: Admin governance is independently usable and cannot self-elevate, lose the last super-admin, bypass audit, expose invitation/session secrets, or trust client role state.

---

## Phase 5: User Story 3 - Grant Purpose-Bound Temporary Support Access (P1)

**Goal**: A distinct approver and, when required, the customer grant a named assignee only a subset of requested masked/status/aggregate scopes for 5–60 minutes, with per-use reauthorization and immediate revoke/expiry denial.

**Independent test**: `npm --prefix apps/api run test:e2e -- support-access` proves requester/approver separation, optional customer approval, no widening, per-object checks, financial-write denial, revoke/expiry races, one audit record per use, and no raw workspace data.

### Tests

- [ ] T047 [P] [US3] Add support scope/subset/duration/customer-approval DTO tests in `apps/api/test/unit/security/support-access.dto.spec.ts`; verify only the six registered resources and three safe actions parse
- [ ] T048 [P] [US3] Add request/grant constraints, minimum grants, immutability, owner visibility, and per-use function coverage in `supabase/tests/012_support_access.test.sql`; verify requester cannot approve and approval cannot widen
- [ ] T049 [P] [US3] Add request/decision/use/revoke/end/expiry concurrency and audit tests in `apps/api/test/integration/security/support-access.spec.ts`; verify revoke/use and expiry/use races always deny data
- [ ] T050 [P] [US3] Add Admin and owner route contract/E2E coverage in `apps/api/test/e2e/security/support-access.e2e-spec.ts`; verify non-owner responses do not reveal request existence

### Implementation

- [ ] T051 [US3] Implement support request/grant queries, subset locks, customer decision, per-use assertion/evidence, revoke/end, and bounded expiry claims in `apps/api/src/security/security.repository.ts`; verify T048 and T049 pass
- [ ] T052 [US3] Implement support workflow validation, registered masked projections, and non-enumerating errors in `apps/api/src/security/security.service.ts`; verify no unregistered field/resource/action is returned
- [ ] T053 [US3] Implement canonical Admin and owner support-access routes in `apps/api/src/security/security.controller.ts`; verify T047 and T050 pass
- [ ] T054 [US3] Implement bounded `support-grants.expire` processing and safe revocation event/metrics in `apps/api/src/security/security.worker.ts`; verify expired work is idempotent and no cache invalidation path exists
- [ ] T055 [US3] Document emergency revoke, suspicious-use triage, expiry failure, and reconciliation in `apps/api/docs/runbooks/support-access-emergency-revoke.md`; verify the runbook contains no customer purpose/workspace values
- [ ] T056 [US3] Run the US3 unit/pgTAP/integration/E2E/security commands and record FR-020–FR-025, AC-007, SC-004 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us3-support-access.md`

**Checkpoint**: Support access is independently testable, purpose/scope/time bound, customer-aware, immediately revocable, read-only, and audited per use.

---

## Phase 6: User Story 4 - Investigate Security and Audit Evidence (P1)

**Goal**: Authorized investigators can search redacted immutable security/audit evidence and manage explicit incident transitions whose timeline, audit, outbox, and alerts remain durable.

**Independent test**: `npm --prefix apps/api run test:e2e -- audit security-incidents` proves bounded cursor/filter behavior, immutable evidence, exact permissions/MFA, allowed transitions, version races, audit/outbox atomicity, and durable evidence when alert delivery fails.

### Tests

- [ ] T057 [P] [US4] Add audit/security/timeline immutability, metadata bounds, grants, and index coverage in `supabase/tests/011_audit_security_immutability.test.sql`; verify update/delete fails for every runtime role
- [ ] T058 [P] [US4] Add strict incident/audit/security filter/action/response contract tests in `apps/api/test/contract/security/audit-incidents.contract-spec.ts`; verify raw IP/user agent/provider payload/before-after data is absent
- [ ] T059 [P] [US4] Add privileged mutation/audit/outbox rollback, incident transition/version, and alert-failure integration tests in `apps/api/test/integration/security/audit-incidents.spec.ts`; verify audit append failure rolls back the mutation
- [ ] T060 [P] [US4] Add cursor/filter/permission/incident E2E coverage in `apps/api/test/e2e/security/audit-incidents.e2e-spec.ts`; verify invalid filters stay bounded and non-authorized resources are non-enumerating

### Implementation

- [ ] T061 [US4] Implement immutable audit/security append and redacted cursor queries plus incident command/timeline SQL in `apps/api/src/security/security.repository.ts`; verify T057 and T059 pass
- [ ] T062 [US4] Implement allowlisted metadata/hash evidence, incident transition table, overview freshness/partial semantics, and safe response mapping in `apps/api/src/security/security.service.ts`; verify T058 passes
- [ ] T063 [US4] Implement canonical security overview/event/incident and audit routes in `apps/api/src/security/security.controller.ts`; verify T060 passes
- [ ] T064 [US4] Implement `security-alert.dispatch` selection/publication/retry behavior in `apps/api/src/security/security.worker.ts`; verify delivery failure preserves committed audit/security/timeline evidence
- [ ] T065 [US4] Add low-cardinality permission/audit/security/incident metrics and redacted structured logs in `apps/api/src/platform/observability/platform-metrics.ts` and `apps/api/src/platform/observability/platform-logger.ts`; verify canary PII never appears in labels/log output
- [ ] T066 [US4] Document immutable-audit failure, incident lifecycle, alert failure, evidence reconciliation, and closure in `apps/api/docs/runbooks/audit-security-incident-recovery.md`; verify owner/severity/threshold/escalation are explicit
- [ ] T067 [US4] Run the US4 pgTAP/contract/integration/E2E/security commands and record FR-015–FR-019, FR-026–FR-027, AC-006, AC-008–AC-009 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us4-audit-incidents.md`

**Checkpoint**: Investigators can independently use redacted evidence and incident workflows without any mutable-history or alert-delivery dependency.

---

## Phase 7: User Story 5 - Review Personal Security Events (P1)

**Goal**: A customer reads only their own Mobile-safe security events through a bounded cursor while other customers, Admin direct-table clients, and anonymous callers learn nothing.

**Independent test**: `npm --prefix apps/api run test:e2e -- customer-security-events` proves owner-only ordering/filtering, max 100 rows, safe Mobile mapping, redaction, cross-owner denial, and customer-read P95/P99/payload budgets.

### Tests

- [ ] T068 [P] [US5] Add owner/non-owner/Admin-direct/anonymous RLS and redaction cases for `security_events` in `supabase/tests/014_admin_denial_matrix.test.sql`; verify no runtime role can mutate history
- [ ] T069 [P] [US5] Add Mobile `SecurityEvent` mapping and OpenAPI drift coverage in `apps/api/test/contract/security/customer-security-events.contract-spec.ts`; verify every mapped field is allowlisted and bounded
- [ ] T070 [P] [US5] Add owner cursor/type/severity, cross-owner, payload, and inactive-profile E2E cases in `apps/api/test/e2e/security/customer-security-events.e2e-spec.ts`; verify max 100 and deterministic `(occurred_at,id)` order

### Implementation

- [ ] T071 [US5] Implement owner-scoped security-event cursor query and safe projection in `apps/api/src/security/security.repository.ts` and `apps/api/src/security/security.service.ts`; verify T068 and T069 pass
- [ ] T072 [US5] Implement `GET /api/v1/me/security/events` in `apps/api/src/security/security.controller.ts`; verify T070 passes
- [ ] T073 [US5] Add owner-security-event SQL seed/plan and k6 budget checks in `apps/api/test/performance/security-owner-events-queries.sql` and `apps/api/test/performance/security-owner-events.k6.js`; verify P95 <=300 ms, P99 <=600 ms, payload <=200 KiB
- [ ] T074 [US5] Run the US5 pgTAP/contract/E2E/performance commands and record FR-014–FR-015 and AC-008/AC-013–AC-014 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us5-customer-security-events.md`

**Checkpoint**: The customer security-event slice is independently releasable as an owner-only, redacted, bounded read contract.

---

## Phase 8: User Story 6 - Export a Customer's Data Safely (P1)

**Goal**: A recently authenticated owner creates one active export, every registered domain contributes to one bounded immutable ZIP, and only that reauthorized owner receives a minutes-lived URL before automatic expiry.

**Independent test**: `npm --prefix apps/api run test:e2e -- privacy-export` proves same-request replay, missing-handler failure, deterministic manifest/checksums, bounded streaming, private Storage, owner/recent-auth URL checks, no list URL/key/body leakage, and expiry cleanup.

### Tests

- [ ] T075 [P] [US6] Add streaming ZIP path/type/count/byte/checksum/error/backpressure tests in `apps/api/test/unit/security/export-package.spec.ts`; verify traversal, executable entries, duplicate paths, oversize output, and full-buffer behavior fail
- [ ] T076 [P] [US6] Add native Storage REST timeout/auth/upload/sign/delete and response-redaction tests in `apps/api/test/unit/security/export-storage.spec.ts`; verify credentials, object keys, and signed URLs never enter logs/errors
- [ ] T077 [P] [US6] Add export request/claim/handler/upload/ready/expiry/retry integration coverage in `apps/api/test/integration/security/privacy-export.spec.ts`; verify a missing/duplicate handler cannot mark ready
- [ ] T078 [P] [US6] Add owner/admin/cross-owner/recent-auth/Storage-outage contract and E2E coverage in `apps/api/test/e2e/security/privacy-export.e2e-spec.ts`; verify lists never contain a download URL

### Implementation

- [ ] T079 [US6] Implement bounded streaming ZIP entries, manifest, per-entry SHA-256, and terminal stream cleanup in `apps/api/src/security/export-package.ts`; verify T075 passes without buffering the complete package
- [ ] T080 [US6] Implement private `report-exports` upload, HEAD metadata validation, short-lived signing, and deletion through Node `fetch` in `apps/api/src/security/export-storage.ts`; verify T076 passes
- [ ] T081 [US6] Implement the SPEC-BE-002 identity export handler and register it in `apps/api/src/identity/identity-privacy.handler.ts` and `apps/api/src/identity/identity.module.ts`; verify the handler emits only the approved point-in-time identity fields
- [ ] T082 [US6] Implement owner/admin export request, status, action, claim, ready, and expiry SQL in `apps/api/src/security/security.repository.ts`; verify active uniqueness and cross-owner denial in T077
- [ ] T083 [US6] Implement export scope validation, handler completeness, point-in-time orchestration, safe metadata, and signed-URL reauthorization in `apps/api/src/security/security.service.ts`; verify T077 and T078 pass
- [ ] T084 [US6] Implement owner/Admin export routes in `apps/api/src/security/security.controller.ts` and `privacy.export.generate`/expiry processing in `apps/api/src/security/security.worker.ts`; verify async acceptance returns within budget and ready is atomic after validated upload
- [ ] T085 [US6] Add export backlog/acceptance/size performance scenarios in `apps/api/test/performance/security-privacy-export.k6.js`; verify acceptance P95 <=300 ms, P99 <=600 ms, payload <=50 KiB, and worker work stays bounded
- [ ] T086 [US6] Run the US6 unit/integration/E2E/security/performance commands and record FR-028–FR-031, AC-010, AC-013–AC-014, SC-005–SC-006 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us6-privacy-export.md`

**Checkpoint**: Export request/status/download is independently secure and worker retries cannot omit a domain, expose an object, or corrupt an immutable package.

---

## Phase 9: User Story 7 - Delete or Retain Data Under Explicit Policy (P1)

**Goal**: A recently authenticated owner can request/cancel deletion; workers wait for cooling-off, recheck holds, invoke every owner idempotently, revoke sessions, minimize retained links, and apply approved retention modes only through registered handlers.

**Independent test**: `npm --prefix apps/api run test:e2e -- deletion retention` proves cancellation cutoff, one active request, all-handler accounting, hold races, safe completion results, registered-only retention, bounded batches, session/profile transitions, and no generic SQL/cascade deletion.

### Tests

- [ ] T087 [P] [US7] Add deletion/retention/hold lifecycle, owner access, grant denial, active uniqueness, and bounded-index coverage in `supabase/tests/013_privacy_retention.test.sql`; verify hold overlap and immutable history rules
- [ ] T088 [P] [US7] Add deletion confirmation/action and retention policy/hold DTO/OpenAPI tests in `apps/api/test/contract/security/deletion-retention.contract-spec.ts`; verify legal policy fields are server/admin controlled and unknown modes fail
- [ ] T089 [P] [US7] Add cancellation/claim/hold race, every-handler, retry, profile/session, and safe-result integration tests in `apps/api/test/integration/security/deletion-retention.spec.ts`; verify no irreversible handler repeats
- [ ] T090 [P] [US7] Add owner/Admin/cross-owner/MFA/version and worker recovery E2E flows in `apps/api/test/e2e/security/deletion-retention.e2e-spec.ts`; verify held resources never enter a handler call

### Implementation

- [ ] T091 [US7] Extend the identity privacy handler with idempotent deletion/session/profile transition and retention behavior in `apps/api/src/identity/identity-privacy.handler.ts`; verify SPEC-BE-002 ownership invariants and no physical audit/security deletion
- [ ] T092 [US7] Implement deletion request/cancel/claim/result, retention policy/hold commands, advisory overlap locks, per-object hold recheck, and bounded candidate cursors in `apps/api/src/security/security.repository.ts`; verify T087 and T089 pass
- [ ] T093 [US7] Implement cooling-off, complete handler reconciliation, safe retained-category mapping, and registered-only retention orchestration in `apps/api/src/security/security.service.ts`; verify missing handlers and unknown resource types fail closed
- [ ] T094 [US7] Implement owner/Admin deletion and Admin retention routes in `apps/api/src/security/security.controller.ts`; verify T088 and T090 pass
- [ ] T095 [US7] Implement bounded `account.deletion.execute` and `retention.apply` processing/retry/metrics in `apps/api/src/security/security.worker.ts`; verify cancellation/hold is rechecked immediately before irreversible work
- [ ] T096 [US7] Document deletion pause/resume, handler reconciliation, session/profile recovery, export cleanup, retention hold conflict, and policy rollback in `apps/api/docs/runbooks/privacy-retention-recovery.md`; verify no step invents legal policy or destructive SQL
- [ ] T097 [US7] Add deletion backlog/acceptance and retention batch/hold plan evidence in `apps/api/test/performance/security-deletion-retention.k6.js` and `apps/api/test/performance/security-retention-queries.sql`; verify acceptance <=300/600 ms, payload <=50 KiB, and no unbounded scan
- [ ] T098 [US7] Run the US7 pgTAP/contract/integration/E2E/security/performance commands and record FR-032–FR-038, AC-011–AC-014, SC-007 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us7-deletion-retention.md`

**Checkpoint**: Deletion and retention are independently safe, policy/hold aware, fully reconciled across registered owners, retryable, and incapable of arbitrary table deletion.

---

## Phase 10: User Story 8 - Preserve Current Client Contract Boundaries (P2)

**Goal**: Current Admin/Mobile mocks remain untouched while server contracts, aliases, state/pagination adapters, and security semantics are fully mapped for SPEC-BE-014 without granting mock authority.

**Independent test**: `npm --prefix apps/api run test:contract -- client-mapping openapi` plus `git diff --exit-code -- apps/admin-web apps/mobile` proves all 151 keys, governance/security/privacy schemas, Mobile security events, statuses, versions, cursors, and mutation requirements map with zero client source change or production mock trust.

### Tests

- [ ] T099 [P] [US8] Add Admin governance/security Zod-to-OpenAPI field/state/pagination/permission parity in `apps/api/test/contract/security/admin-client-mapping.contract-spec.ts`; verify mock confirmation/sessionStorage/query-role values have no server mapping
- [ ] T100 [P] [US8] Add Mobile security-event/export/deletion service-to-OpenAPI parity in `apps/api/test/contract/security/mobile-security-mapping.contract-spec.ts`; verify no raw IP/token/provider/Storage field is silently exposed
- [ ] T101 [P] [US8] Add production rejection cases for `__scenario`, fixture IDs, role headers/query values, and mock confirmation tokens in `apps/api/test/security/admin/mock-authority-boundary.spec.ts`; verify all cases deny or ignore without affecting database authorization

### Implementation

- [ ] T102 [US8] Compose the Phase 03 fragment into runtime OpenAPI and stable errors in `apps/api/src/platform/http/openapi.ts` and `apps/api/src/platform/http/safe-exception.filter.ts`; verify all 38 paths/45 operations and safe error codes match `contracts/openapi.yaml`
- [ ] T103 [US8] Finalize exact alias/state/cursor/masking mapping and future adapter notes in `apps/api/specs/003-admin-rbac-security/contracts/client-mapping.md`; verify T099–T101 pass and no client path changed
- [ ] T104 [US8] Run the US8 contract/security/no-client-diff commands and record FR-044–FR-045, AC-015, SC-010 evidence in `apps/api/specs/003-admin-rbac-security/checklists/us8-client-boundaries.md`

**Checkpoint**: Server/client parity is explicit and testable, but production authorization remains entirely database-backed and client source remains untouched.

---

## Final Phase: Hardening And Acceptance

**Purpose**: Complete cross-cutting abuse controls, observability, performance, container, migration/recovery, security traceability, local/remote evidence, and the full Definition of Done.

- [ ] T105 [P] Add distinct bounded abuse/rate-limit tests for RBAC, invitations, support, audit/security enumeration, privacy, deletion, retention, and incidents in `apps/api/test/security/admin/abuse-boundaries.spec.ts`; verify changing client role headers cannot bypass a limit
- [ ] T106 Implement the tested PostgreSQL-backed route/category abuse controls over immutable security-attempt evidence and safe `Retry-After` responses in `apps/api/src/security/security.repository.ts`, `apps/api/src/security/security.module.ts`, and `apps/api/src/security/security.controller.ts`; verify T105 and existing HTTP security contracts pass across concurrent API instances
- [ ] T107 [P] Add ZIP/Storage/Clerk timeout, malformed response, unsafe URL/path, log-canary, secret, and exceptional-condition security cases in `apps/api/test/security/admin/provider-storage-boundary.spec.ts`; verify provider failure never broadens access or leaks details
- [ ] T108 [P] Extend API/worker image startup, process-scoped secret, non-root, no-source-secret, graceful-stop, and route-enable tests in `apps/api/test/container/security-runtime-contract.spec.ts`; verify with `npm --prefix apps/api run test:container`
- [ ] T109 [P] Add million-row audit/security, role-change storm, concurrent support, privacy/deletion backlog, retention batch, payload, and query-plan runners in `apps/api/test/performance/run-security.ts`; verify every threshold in `plan.md` and retain redacted plans under `apps/api/test/performance/artifacts/`
- [ ] T110 Complete structured metrics, alerts, dashboards, low-cardinality labels, and correlation coverage for all five jobs and critical workflows in `apps/api/src/platform/observability/platform-metrics.ts`, `apps/api/src/platform/observability/platform-events.ts`, and `apps/api/specs/003-admin-rbac-security/checklists/operations-evidence.md`; verify every alert has owner/runbook/threshold/closure evidence
- [ ] T111 Create OWASP ASVS 5.0.0/API Top 10:2023/Top 10:2025/MASVS traceability and manual authorization review in `apps/api/specs/003-admin-rbac-security/checklists/owasp-traceability.md`; verify every applicable control maps to a test/evidence path and no Critical/High remains
- [ ] T112 Run dependency, SAST, secret, image, log, OpenAPI, event, permission, and ownership scans and record safe summaries in `apps/api/specs/003-admin-rbac-security/checklists/security-evidence.md`; verify zero release-blocking finding and print no secret/canary value
- [ ] T113 Rehearse clean migration, failed migration plus forward fix, checksum enforcement, N-1 image compatibility, backup/restore, RPO/RTO, bootstrap recovery, worker crash, Clerk/Storage outage, and reconciliation; record commands/outcomes in `apps/api/specs/003-admin-rbac-security/checklists/recovery-evidence.md`
- [ ] T114 Run `npm --prefix apps/api run typecheck`, `lint`, `perf:check`, `test:unit`, `test:contract`, `test:integration`, `test:e2e`, `test:container`, `build`, `migration:checksums`, `security:dependencies`, and `security:workflow-pins`; record exact fresh results in `apps/api/specs/003-admin-rbac-security/checklists/local-release-evidence.md`
- [ ] T115 Run `npm --prefix apps/api run db:reset`, `db:lint`, and `test:db` plus all Phase 03 performance/stress runners against disposable production-like data; record exact thresholds, dataset hash, plans, and cleanup in `apps/api/specs/003-admin-rbac-security/checklists/performance-evidence.md`
- [ ] T116 Reconcile FR-001–FR-050, AC-001–AC-018, SC-001–SC-010, 16 tables, four functions, 45 operations, five jobs, ten events, seven roles, 151 keys, alerts, runbooks, rollback, and client no-diff evidence in `apps/api/specs/003-admin-rbac-security/checklists/acceptance-traceability.md`; verify every item links to a fresh command/result and no requirement is orphaned
- [ ] T117 Review the final production/test diff for Clean Code/SOLID/DRY/KISS/YAGNI, test quality, ownership, secret exposure, and unrequested infrastructure; record required fixes and rerun evidence in `apps/api/specs/003-admin-rbac-security/checklists/final-review.md`
- [ ] T118 Complete every Definition of Done item only from fresh retained evidence in `apps/api/specs/003-admin-rbac-security/checklists/definition-of-done.md`; verify no skipped/partial/inferred result is marked passing
- [ ] T119 Commit the fully verified SPEC-BE-003 artifacts and implementation directly on `main` with a Spec-identifying message, then push to `origin/main`; record commit SHA and push result without rewriting history in `apps/api/specs/003-admin-rbac-security/checklists/remote-release-evidence.md`
- [ ] T120 Collect remote CI, image scan, SBOM, signature, provenance, and branch evidence for T119; fix any failure forward on `main`, rerun materially affected local gates, and close `apps/api/specs/003-admin-rbac-security/checklists/remote-release-evidence.md` only when all remote blockers pass

## Dependencies

### Phase dependency graph

```text
Phase 1 Baseline/Analysis
  -> Phase 2 Blocking Foundations
      -> US1 Exact Authorization
          -> US2 Admin Governance
              -> US3 Support Access
              -> US4 Audit/Incidents
                  -> US5 Customer Security Events
              -> US6 Privacy Export
                  -> US7 Deletion/Retention
                      -> US8 Client Boundaries
                          -> Final Hardening/Acceptance
```

- Phase 1 blocks all implementation. T005 must report no unresolved Constitution or production-critical conflict.
- Phase 2 is shared and blocks every story because the ordered migration chain creates all owned tables/functions/RLS before routes are exposed.
- US1 blocks every privileged Admin story because it establishes exact database authorization.
- US2 blocks US3 because support requester/approver/assignee identities require active Admin governance.
- US4 blocks US5 because it completes the shared security/audit projections and immutable evidence behavior.
- US6 blocks US7 because both use the privacy-handler registry, identity handler, Storage/export lifecycle, and security worker.
- US8 follows all behavior stories so it validates the complete contract surface without changing clients.
- Final hardening follows every story; commit/push tasks T119–T120 occur only after all local gates and Definition of Done evidence pass.

### User-story completion order

1. **US1** is the MVP authorization slice after shared foundations.
2. **US2** makes Admin governance operable and supplies Admin identities for later stories.
3. **US3** and **US4** may proceed in parallel after US2 if repository/controller edits are coordinated serially.
4. **US5** follows US4; **US6** may proceed in parallel with US3/US4 after US2 when files do not overlap.
5. **US7** follows US6; **US8** follows all production behavior stories.

## Parallel Execution Examples

- **Foundations**: T007, T009, T011, and T013 can run in parallel; T015–T020 remain strictly ordered SQL.
- **US1**: T024–T027 can run in parallel before T028–T031; T032 owns only performance files after the permission query exists.
- **US2**: T034–T038 can run in parallel; T039 owns the identity client while T040 owns DTOs, then T041–T043 proceed in repository/service/controller order.
- **US3**: T047–T050 can run in parallel; T055 can be drafted after behavior is fixed while T051–T054 implement sequential shared files.
- **US4**: T057–T060 can run in parallel; T065 and T066 can run in parallel after event/metric names stabilize.
- **US5**: T068–T070 can run in parallel; T073 can run after T071 independently of controller work.
- **US6**: T075–T078 can run in parallel; T079, T080, and T081 own separate implementation files and can run in parallel before orchestration T082–T084.
- **US7**: T087–T090 can run in parallel; T096 and T097 can proceed in parallel after lifecycle behavior stabilizes.
- **US8**: T099–T101 can run in parallel; T103 follows their findings.
- **Final**: T105, T107–T109, and T111 can run in parallel; evidence consolidation T112–T118 remains ordered by the commands it records.

## Implementation Strategy

### MVP first

Complete Phases 1–2 and US1 only. This delivers the reusable exact-permission trust boundary and proves the 25 ms database authorization budget without exposing unfinished Admin workflows. Do not enable Admin routes merely because their shells exist.

### Incremental delivery

1. Add US2 and bootstrap one verified super-admin only after exact authorization, manifest drift, RLS, audit, and recovery gates pass.
2. Add US3/US4 as independently tested privileged workflows; never merge authorization, support grants, and audit into one check.
3. Add owner security events, then privacy export and deletion/retention workers with complete handler/recovery evidence.
4. Validate all current client mappings without touching clients.
5. Run full hardening, local evidence, Definition of Done, then commit/push for remote-only evidence.

### Safety rules during execution

- Work only on synchronized `main`; preserve unrelated untracked/modified files and never use destructive Git cleanup/reset.
- Tests precede changed behavior where practical; a checkbox is completed only after its named command or observable result passes.
- Do not add a generic idempotency table, Redis, ORM, policy engine, microservice, Edge Function, client cutover, domain data handler, or legal policy outside Phase 03 ownership.
- Do not claim durable arbitrary response replay before SPEC-BE-006; prove only the documented natural/idempotent state transitions.
- Never put secrets, tokens, raw emails/IPs, signed URLs, Storage keys, support purpose/workspace data, export bodies, or deleted payloads in source, fixtures, commands, logs, metrics, screenshots, or evidence.

## Completion Rule

SPEC-BE-003 is complete only when T001–T120 are checked from fresh evidence, every local and remote gate passes, FR-001–FR-050/AC-001–AC-018/SC-001–SC-010 traceability is closed, and no release-blocking security, authorization, RLS, audit, support, privacy, deletion, retention, migration, recovery, alert, or client-boundary gap remains.
