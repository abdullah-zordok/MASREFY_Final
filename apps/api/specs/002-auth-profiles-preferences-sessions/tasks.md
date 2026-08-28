---
description: "Dependency-ordered implementation tasks for SPEC-BE-002"
---

# Tasks: Authentication, Profiles, Preferences & Sessions

**Input**: `apps/api/specs/002-auth-profiles-preferences-sessions/spec.md`,
`plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Delivery branch**: `codex/backend-spec-be-002` (explicit final user instruction;
push only, no merge)
**Scope**: SPEC-BE-002 backend ownership only
**Tests**: Jest, pgTAP/RLS, OpenAPI/event contract, integration/E2E, security,
performance, container, provider-failure, migration, and recovery evidence required

Every task uses:

Format example: `- [ ] T001 [P?] [US?] Imperative action with exact file path and verification`.

`[P]` means the task can run concurrently only after its stated phase prerequisites
are complete and while no other task edits the same file. Story labels appear only
inside story phases. Tests are written and observed failing for the intended missing
behavior before the paired implementation task.

> **Implementation gate cleared 2026-08-28**: the existing checkout is `main` at
> `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`, includes SPEC-BE-001 and these
> SPEC-BE-002 artifacts, and preserves unrelated user files. Do not create a
> Backend branch or worktree.
>
> **Delivery override 2026-08-28**: after all achievable local gates, move the
> verified diff to the already-existing `codex/backend-spec-be-002` branch, commit
> and push that branch only. Do not create a worktree and do not merge.

Migration paths below are exact reserved names based on the current BE-001 sequence.
At T004, stop and renumber them in `data-model.md`, `plan.md`, and this file if the
merged baseline already owns any `20260827000500` through `20260827001300` slot.
Create each file through `supabase migration new`, then normalize the generated
name only after the reserved slot is confirmed unused; never rewrite a merged
migration.

## Phase 1: Baseline And Contract Review

**Goal**: Confirm the real merged foundation and current client contracts before
any implementation. This is an existing project review; no Backend, Admin, Mobile,
or worktree initialization is allowed.

- [X] T001 Verify the existing checkout is exactly `main`, fetch and safely fast-forward it to `origin/main`, confirm SPEC-BE-001 is present, preserve the SPEC-BE-002 artifacts and unrelated user files, then record the resulting base revision in `apps/api/specs/002-auth-profiles-preferences-sessions/spec.md` and `apps/api/specs/002-auth-profiles-preferences-sessions/plan.md` before T007
- [X] T002 Run `git worktree list` and `git status --short --branch`, record the main-only/no-new-worktree and preserved-unrelated-files preflight in `apps/api/specs/002-auth-profiles-preferences-sessions/quickstart.md`, and verify no existing `.agents/plugins`, `apps/api/test/performance/artifacts`, `supabase/.branches`, or `supabase/.temp` content was removed
- [X] T003 Re-read merged `apps/api/src`, `apps/api/test`, `supabase/migrations`, `supabase/tests`, `docker`, and `.github/workflows/backend-foundation.yml`, reconcile any path/API/role/outbox drift in `apps/api/specs/002-auth-profiles-preferences-sessions/plan.md`, and verify the Constitution Check still passes
- [X] T004 Inventory the merged migration/test sequence and BE-001 roles, lifecycle trigger, outbox helper, and queue contract; record confirmed next migration/test names in `apps/api/specs/002-auth-profiles-preferences-sessions/data-model.md` and verify no reserved name collides
- [X] T005 Review current `apps/mobile/src/domain/app-shell.ts`, `apps/mobile/src/features/onboarding/onboarding-progress.ts`, Mobile auth service contracts, and Admin user/device/session mocks; create the mapping-only `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/client-mapping.md` and verify `git diff -- apps/mobile apps/admin-web` is empty
- [X] T006 Validate all SPEC-BE-002 Markdown links, OpenAPI YAML/internal refs/unique operation IDs, owned-resource/event/environment coverage, and strict checklist syntax in `apps/api/specs/002-auth-profiles-preferences-sessions/tasks.md`; resolve any artifact error before Phase 2

---

## Phase 2: Blocking Foundations

**Goal**: Extend the merged platform once for Clerk configuration, raw webhook
bytes, safe errors, and contract composition before story behavior.

**Gate**: T001-T006 pass and the implementation hold is cleared.

- [X] T007 Install the current Node-24-compatible `@clerk/backend` release in `apps/api/package.json` and `apps/api/package-lock.json` using npm; verify `npm --prefix apps/api ls @clerk/backend` reports one locked production dependency and no direct `svix`, JOSE, crypto, ORM, or Supabase client dependency was added
- [X] T008 [P] Add failing validation/redaction tests for all Clerk, push-key, recent-auth, timeout, poll, attempt, and reconciliation variables in `apps/api/test/unit/config/environment.schema.spec.ts`; verify the targeted Jest run fails only on missing SPEC-BE-002 configuration behavior
- [X] T009 Implement the process-specific contract from `contracts/environment.md` in `apps/api/src/platform/config/environment.types.ts`, `apps/api/src/platform/config/environment.schema.ts`, `apps/api/src/platform/config/platform-config.service.ts`, and `apps/api/.env.example`; verify API/worker/migration required-variable matrices and unknown `MASARIFI_*` rejection pass without printing values
- [X] T010 [P] Add API/worker/migration fail-before-bind and secret-redaction tests in `apps/api/test/unit/bootstrap/entrypoints.spec.ts` and `apps/api/test/container/runtime-contract.spec.ts`; verify missing webhook/push/Clerk secrets fail only applicable processes and migration remains provider-independent
- [X] T011 [P] Add failing raw-body/content-type/body-limit contract tests for `/webhooks/clerk` versus ordinary JSON routes in `apps/api/test/contract/identity/http-raw-body.contract-spec.ts`; prove the current global parser consumes or changes webhook bytes before T012
- [X] T012 Mount a route-scoped raw `application/json` parser before the existing global parser in `apps/api/src/platform/http/http-validation.ts` and `apps/api/src/main.ts`; verify T011 passes and all BE-001 HTTP validation/security tests remain green
- [X] T013 [P] Add failing safe-error tests for `AUTH_TOKEN_INVALID`, `PROFILE_INACTIVE`, `PROFILE_SYNC_UNAVAILABLE`, `VERSION_CONFLICT`, `RECENT_AUTH_REQUIRED`, `DEVICE_NOT_FOUND`, `PUSH_TOKEN_CONFLICT`, `PROVIDER_UNAVAILABLE`, `INVALID_WEBHOOK`, `WEBHOOK_SIGNATURE_INVALID`, and `WEBHOOK_EVENT_CONFLICT` in `apps/api/test/contract/identity/identity-errors.contract-spec.ts`
- [X] T014 Extend the shared allowlisted domain-error mapping in `apps/api/src/platform/http/safe-exception.filter.ts` without a second envelope; verify T013 and all BE-001 error-contract tests expose no provider/database/exception detail
- [X] T015 [P] Add a failing multi-fragment OpenAPI composition/drift test for BE-001 plus `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml` in `apps/api/test/contract/openapi-drift.contract-spec.ts`; verify all ten SPEC-BE-002 operations are initially absent from runtime output
- [X] T016 Extend `apps/api/src/platform/http/openapi.ts` to compose approved fragments deterministically and reject duplicate/conflicting paths, operations, schemas, or security schemes; verify T015 passes without replacing the BE-001 contract
- [X] T017 [P] Extend ownership/scope security assertions in `apps/api/test/security/scope-boundary.spec.ts` and `apps/api/test/security/ownership-boundary.spec.ts` for exactly the SPEC-BE-002 paths/resources and zero Mobile/Admin/authz/audit/idempotency/session-table ownership
- [X] T018 Run `npm --prefix apps/api run typecheck`, `lint`, `test:unit`, `test:contract`, `security:scope`, and `build`; record the foundational gate result in `apps/api/specs/002-auth-profiles-preferences-sessions/quickstart.md` and stop on any BE-001 regression

---

## Phase 3: User Story 1 - Authenticate Through One Trusted Identity (P1)

**Goal**: Accept only verified Clerk Phone/Google sessions, derive one immutable text
subject/session, establish active-profile RLS context, and create no Supabase Auth
identity or legacy JWT-template path.

**Independent test**: Two Phone identities and one Google identity call the same
protected contract and resolve distinct nonempty Clerk subjects; all invalid trust
cases fail closed and `auth.users` remains unchanged.

### Tests

- [X] T019 [P] [US1] Add failing pgTAP structure/function/RLS/grant tests for `public.profiles`, `public.current_clerk_user_id()`, and `private.assert_active_profile(text)` in `supabase/tests/004_identity_profiles_rls.test.sql`; include owner, second owner, anonymous, missing-subject, inactive, API, worker, Admin, table-owner, and BYPASSRLS negative evidence
- [X] T020 [P] [US1] Add failing unit tests for official Clerk request authentication, authenticated role/user/session extraction, pending state, configured audience, present `azp`, absent native `azp`, factor age, safe errors, and no raw token logging in `apps/api/test/unit/identity/clerk-auth.guard.spec.ts`
- [X] T021 [P] [US1] Add failing `/api/v1/meta` contract tests proving the existing `META_TOKEN_VERIFIER` uses the same Clerk verifier and returns 401/503 safely in `apps/api/test/contract/identity/meta-clerk-auth.contract-spec.ts`
- [X] T022 [P] [US1] Add failing pooled-connection integration tests for transaction-local `request.jwt.claims`, `SET LOCAL ROLE masarifi_api`, rollback/reset, subject isolation, and no superuser/service-role execution in `apps/api/test/integration/identity/rls-request-context.spec.ts`
- [X] T023 [P] [US1] Add failing security tests for wrong issuer/configured audience/present `azp`/role/signature/algorithm/`kid`/`exp`/`nbf`/`sub`/`sid`, native missing-`azp` success, Clerk/JWKS outage, and zero account-existence hints in `apps/api/test/security/identity/clerk-token-boundary.spec.ts`

### Implementation

- [X] T024 [US1] Create `supabase/migrations/20260827000500_identity_profiles_functions.sql` through Supabase CLI with the complete `profiles` constraints/indexes plus the two owned fixed-search-path functions; verify T019 structure/function assertions progress from missing objects to the expected grant/RLS failures
- [X] T025 [US1] Create `supabase/migrations/20260827000600_identity_profile_rls_grants.sql` through Supabase CLI, attach the BE-001 version trigger, revoke defaults, enable/force RLS, add active-owner policies and minimum `authenticated`/`masarifi_api`/`masarifi_worker` grants; verify all T019 positives and negatives pass
- [X] T026 [US1] Implement one official SDK client with bounded Clerk Admin/auth request methods and safe error normalization in `apps/api/src/identity/clerk-client.service.ts`; verify provider responses, tokens, keys, subjects, sessions, emails, and phones never reach logs/errors
- [X] T027 [US1] Implement the single Clerk verifier/guard/principal contract in `apps/api/src/identity/clerk-auth.guard.ts` using `authenticateRequest()` and the exact `aud`/`azp`/native semantics from research; verify T020 and T023 pass without custom JWT/JWKS code
- [X] T028 [US1] Implement the reusable direct-PostgreSQL customer transaction wrapper and active-profile assertion in `apps/api/src/identity/identity.repository.ts`; verify T022 proves transaction-local claims cannot leak between pooled requests
- [X] T029 [US1] Register `ClerkClientService`, `ClerkAuthGuard`, the `META_TOKEN_VERIFIER` adapter, and identity providers in `apps/api/src/identity/identity.module.ts` and `apps/api/src/app.module.ts`; verify T021 and the original BE-001 meta tests pass through one verifier
- [X] T030 [US1] Enable the documented local Clerk Third-Party Auth block with the approved non-secret instance domain in `supabase/config.toml`; restart local Supabase and verify a Clerk `role=authenticated` token reaches owner RLS while a wrong subject returns zero rows
- [X] T031 [US1] Configure/verify one Clerk Development application, Phone OTP and Google only, password/Apple/Facebook/other providers off, and exact `+20/+966/+971` SMS policy; record redacted evidence/check state only in `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/provider-configuration.md` and leave the SMS tier limitation blocking if unresolved
- [ ] T032 [P] [US1] Configure/verify Android and iOS Native Applications as `com.masarifi.mobile`, Native API, and only `masarifi://oauth-callback` for the approved Mobile SSO redirect; record safe evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/provider-configuration.md` without client-source edits
- [X] T033 [US1] Enable Clerk native Supabase integration and register the exact Clerk instance domain under Supabase Third-Party Auth; update `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/provider-configuration.md` only after a valid asymmetric token passes and no legacy JWT Template exists
- [ ] T034 [US1] Provision two controlled Phone OTP identities and one Google identity through the approved secret/account channel, recording aliases and hashed subject references only in protected test evidence referenced by `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/provider-configuration.md`
- [ ] T035 [US1] Add and pass provider-backed authentication/owner-subject E2E tests in `apps/api/test/e2e/identity/clerk-auth.e2e-spec.ts`; verify all three aliases resolve stable distinct subjects without printing tokens, OTPs, phone/email, or raw IDs
- [ ] T036 [US1] Add and pass Clerk key rotation, unknown-key refresh, provider outage, documented Supabase refresh-delay, and fail-closed recovery integration tests in `apps/api/test/integration/identity/clerk-jwks-rotation.spec.ts`
- [ ] T037 [US1] Run the US1 pgTAP, unit, contract, integration, security, and E2E commands from `apps/api/specs/002-auth-profiles-preferences-sessions/quickstart.md`; verify zero Masarifi rows in `auth.users`, zero legacy-template path, and satisfy AC-001 through AC-004 plus AC-006 authentication evidence

**Checkpoint**: The single Clerk trust boundary and active-profile/RLS substrate are
independently usable by later stories; invalid or unusable identity cannot reach a
customer handler.

---

## Phase 4: User Story 2 - Maintain Profile and Preferences Across Devices (P1)

**Goal**: Expose masked owner `/me` and complete preferences with strict field
allowlists, active-profile denial, optimistic versions, and no cross-user access.

**Independent test**: Owner reads and updates `/me` and preferences at the current
version, stale concurrent updates fail, and a second owner receives/changes zero
rows belonging to the first.

### Tests

- [X] T038 [P] [US2] Extend pgTAP tests for profile immutable/server fields, active-owner UPDATE `USING`/`WITH CHECK`, `user_preferences` columns/privacy JSON/defaults/version trigger/RLS/grants in `supabase/tests/005_identity_preferences_onboarding.test.sql`; observe failures before the preference migration
- [X] T039 [P] [US2] Add failing DTO/normalization tests for profile PATCH and complete preferences PUT, unknown/mass-assigned fields, IANA timezone, privacy keys/types/size, `expectedVersion`, and bounded `Idempotency-Key` in `apps/api/test/unit/identity/profile-preferences.dto.spec.ts`
- [X] T040 [P] [US2] Add failing OpenAPI/error/masking contract tests for `GET/PATCH /api/v1/me` and `GET/PUT /api/v1/me/preferences` in `apps/api/test/contract/identity/profile-preferences.contract-spec.ts`
- [X] T041 [P] [US2] Add failing integration tests for transaction-local owner isolation, one-statement optimistic updates, full preference replacement, one winner under concurrent same version, inactive/missing profile denial, and outbox atomicity in `apps/api/test/integration/identity/profile-preferences.spec.ts`
- [X] T042 [P] [US2] Add failing payload/envelope/sensitive-field/deduplication tests for `profile.created` and `profile.updated` in `apps/api/test/contract/identity/identity-events.contract-spec.ts`

### Implementation

- [X] T043 [US2] Create `supabase/migrations/20260827000700_identity_preferences.sql` through Supabase CLI with complete constraints, privacy JSON checks, version trigger, active-owner RLS, minimum grants, and SPEC-BE-004 currency-FK deferral; verify T038 preference assertions pass
- [X] T044 [US2] Implement strict profile/preferences request and response DTOs plus canonical validators in `apps/api/src/identity/identity.dto.ts`; verify T039 rejects every unknown or server-controlled field
- [X] T045 [US2] Implement masked profile reads, safe-field conditional profile update, complete conditional preference replacement, default lookup, and bounded last-seen update in `apps/api/src/identity/identity.repository.ts`; verify no SELECT-then-update concurrency path exists
- [X] T046 [US2] Implement active-profile orchestration, error mapping, masking, version/idempotency-header semantics, and safe event payload construction in `apps/api/src/identity/identity.service.ts`; verify no durable replay/hash-mismatch claim is introduced
- [X] T047 [US2] Implement the four profile/preferences operations with Clerk guard and strict response projection in `apps/api/src/identity/identity.controller.ts`; verify T040 returns only the approved schemas/status/errors
- [X] T048 [US2] Register profile/preferences controllers/providers and Swagger metadata in `apps/api/src/identity/identity.module.ts`; verify the composed runtime OpenAPI contains exact SPEC-BE-002 operations and no `/api/v1/admin` route
- [X] T049 [US2] Enqueue `profile.created`/`profile.updated` through the existing BE-001 outbox inside the same repository transactions in `apps/api/src/identity/identity.repository.ts`; verify T042 and T041 rollback/duplicate/version cases pass with `aggregate.id=null`
- [X] T050 [P] [US2] Add safe-log/response/property-authorization tests for masked email/phone, identity/status/deletion/version immutability, no raw subject metric labels, and no provider/database error leakage in `apps/api/test/security/identity/profile-data-exposure.spec.ts`
- [X] T051 [US2] Add and pass two-owner profile/preferences HTTP E2E coverage in `apps/api/test/e2e/identity/profile-preferences.e2e-spec.ts`; verify owner A/B isolation, full replacement, conflict codes, request IDs, and no partial state
- [ ] T052 [P] [US2] Add production-like profile/preference seed and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` checks in `apps/api/test/performance/identity-profile-queries.sql` and HTTP k6 scenario in `apps/api/test/performance/identity-profile.k6.js`; verify indexed DB P95 <=50 ms and API <=250/500 ms P95/P99 with <=50 KiB
- [ ] T053 [US2] Run all US2 tests and record fresh AC-005/AC-007/AC-010/AC-011 evidence references in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`

**Checkpoint**: Profile and preferences are a complete independently testable owner
slice with masked projections, version conflicts, and forced-RLS isolation.

---

## Phase 5: User Story 3 - Resume Minimal Onboarding Progress (P1)

**Goal**: Store and replace only the approved minimal cross-device onboarding
projection with deterministic defaults, canonical steps, completion, and versions.

**Independent test**: Create/read/advance/complete/retry as one owner, reject stale
or invalid progress, and prove platform-specific local state is never accepted or
stored.

### Tests

- [X] T054 [P] [US3] Extend `supabase/tests/005_identity_preferences_onboarding.test.sql` with failing onboarding columns/defaults/vocabulary/array bounds/completion/version-trigger/RLS/grant assertions before the migration
- [X] T055 [P] [US3] Add failing DTO tests for all 12 approved steps, canonical unique order, duplicate/unknown/blank/oversized arrays, complete/step consistency, platform-only field rejection, `expectedVersion`, and `Idempotency-Key` in `apps/api/test/unit/identity/onboarding.dto.spec.ts`
- [X] T056 [P] [US3] Add failing OpenAPI/error contract tests for `GET/PUT /api/v1/me/onboarding` in `apps/api/test/contract/identity/onboarding.contract-spec.ts`
- [X] T057 [P] [US3] Add failing integration tests for default-row bootstrap, owner isolation, one-statement version update, identical completed-state no-op, concurrent winner, and rollback in `apps/api/test/integration/identity/onboarding.spec.ts`

### Implementation

- [X] T058 [US3] Create `supabase/migrations/20260827000800_identity_onboarding.sql` through Supabase CLI with approved vocabulary, array/completion bounds, version trigger, active-owner RLS, and minimum grants; verify T054 passes without a new validation function/trigger or GIN index
- [X] T059 [US3] Add onboarding request/response DTOs and canonical Mobile-step normalization to `apps/api/src/identity/identity.dto.ts`; verify T055 accepts only the minimal projection
- [X] T060 [US3] Add default read and conditional replace/no-op onboarding SQL to `apps/api/src/identity/identity.repository.ts`; verify same desired completed state does not increment version
- [X] T061 [US3] Add onboarding validation/orchestration and stable conflict/error handling to `apps/api/src/identity/identity.service.ts`; verify platform path, skipped steps, SMS permission, tracking, PIN, biometric, and navigation state cannot enter SQL
- [X] T062 [US3] Add guarded onboarding GET/PUT operations and Swagger metadata to `apps/api/src/identity/identity.controller.ts`; verify T056 matches the approved OpenAPI fragment
- [X] T063 [P] [US3] Add Mobile-contract mapping tests against the current step vocabulary and excluded local fields in `apps/api/test/contract/identity/mobile-onboarding-mapping.contract-spec.ts`; verify no `apps/mobile` file changes
- [X] T064 [US3] Add and pass create/resume/advance/complete/retry/second-owner onboarding E2E coverage in `apps/api/test/e2e/identity/onboarding.e2e-spec.ts`
- [X] T065 [US3] Run all US3 tests and record onboarding requirement/AC evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`

**Checkpoint**: The backend can resume the current Mobile onboarding vocabulary
without absorbing any platform permission/security/navigation state.

---

## Phase 6: User Story 4 - Register and Revoke Devices Safely (P1)

**Goal**: List, register, refresh, protect push tokens, and revoke owner devices/
linked sessions with recent-auth and cross-owner protections.

**Independent test**: Register/refresh two devices, rotate a push token, list by
cursor, revoke/retry/current-device reverify, inject Clerk outage, and repeat every
operation as a non-owner.

### Tests

- [X] T066 [P] [US4] Add failing pgTAP schema/constraint/composite-FK/index/trigger/RLS/grant tests for `user_devices` and `push_tokens` in `supabase/tests/006_identity_devices_push.test.sql`; include no ordinary token SELECT and API/worker/Admin negative paths
- [X] T067 [P] [US4] Add failing known-answer/round-trip/random-IV/tamper/wrong-AAD/key-ring/equal-key/redaction tests for fingerprint HMAC, token HMAC, and AES-256-GCM envelope in `apps/api/test/unit/identity/push-token.crypto.spec.ts`
- [X] T068 [P] [US4] Add failing DTO/OpenAPI/cursor/idempotency/recent-auth contract tests for device list/register/delete in `apps/api/test/contract/identity/devices.contract-spec.ts`
- [X] T069 [P] [US4] Add failing integration tests for owner/fingerprint upsert race, fresh-session reactivation, deterministic cursor, same-owner push FK, token rotation, provider/hash uniqueness, and cross-owner conflict in `apps/api/test/integration/identity/device-registration.spec.ts`
- [X] T070 [P] [US4] Add failing integration tests for deterministic device/token locks, repeated revoke 204, current-device factor age, local-first denial, Clerk success/outage/retry, non-owner 404, and revoked-session push failure in `apps/api/test/integration/identity/device-revocation.spec.ts`
- [X] T071 [P] [US4] Add failing security tests proving no fingerprint/session/push plaintext/hash/cipher/provider exception appears in responses/logs/traces/metrics and ciphertext tampering fails closed in `apps/api/test/security/identity/device-push-exposure.spec.ts`
- [X] T072 [P] [US4] Extend `apps/api/test/contract/identity/identity-events.contract-spec.ts` with failing `device.registered`/`device.revoked` payload, aggregate UUID, version, and forbidden-field tests

### Implementation

- [X] T073 [US4] Create `supabase/migrations/20260827000900_identity_devices_push_tokens.sql` through Supabase CLI with exact constraints, unique `(id,user_id)`, same-owner composite FK, cursor/lifecycle/session indexes, and version triggers; verify T066 structure/index/FK assertions pass
- [X] T074 [US4] Create `supabase/migrations/20260827001000_identity_devices_push_rls.sql` through Supabase CLI with revoked/active owner policies, direct-client token denial, minimum API/worker grants, and forced RLS; verify every T066 privilege/RLS case passes
- [X] T075 [US4] Implement Node-only HMAC/AES-256-GCM protection and versioned envelope parsing in `apps/api/src/identity/push-token.crypto.ts`; verify T067 and secret-redaction tests pass without a crypto dependency
- [X] T076 [US4] Add bounded linked-session revoke/current-session helpers using the official Clerk client in `apps/api/src/identity/clerk-client.service.ts`; verify provider 404/idempotent success/outage map only to stable safe outcomes
- [X] T077 [US4] Add strict device list/register/path/cursor request and safe response DTOs to `apps/api/src/identity/identity.dto.ts`; verify raw fingerprint/token may enter only the registration boundary and never a response type
- [X] T078 [US4] Implement HMAC owner/fingerprint upsert, fresh-session reactivation, cursor query `(last_seen_at,id)`, and same-owner token conflict SQL in `apps/api/src/identity/identity.repository.ts`; verify T069 uses the planned indexes and performs no N+1
- [X] T079 [US4] Implement local device/push revoke, after-commit linked-session completion marker, and revoked-session recovery query in `apps/api/src/identity/identity.repository.ts`; verify local denial/outbox commit is atomic and no DB lock spans the session-revoke HTTP call
- [X] T080 [US4] Implement device registration/list/revocation, recent factor-age policy, provider-outage semantics, natural repeatability, and safe event construction in `apps/api/src/identity/identity.service.ts`; verify no durable generic idempotency storage/error is added
- [X] T081 [US4] Add guarded device GET/register/DELETE operations to `apps/api/src/identity/identity.controller.ts`; verify T068 response/status/error behavior, including repeated DELETE 204
- [X] T082 [US4] Register device providers/routes and exact Swagger schemas in `apps/api/src/identity/identity.module.ts`; verify runtime OpenAPI and route inventory contain no Admin device/session endpoint
- [X] T083 [US4] Implement bounded revoked-device linked-session retry using nonnull `clerk_session_id` evidence in `apps/api/src/identity/clerk-webhook.worker.ts`; verify T070 provider recovery clears only successfully revoked links and never reactivates local push
- [X] T084 [US4] Register the identity worker's abort-aware lifecycle in `apps/api/src/worker.module.ts` and `apps/api/src/worker.ts`; verify worker starts no listener, stops within the BE-001 shutdown budget, and does not receive the webhook signing secret
- [X] T085 [US4] Add and pass owner/non-owner/register/rotate/list/revoke/retry/current-device E2E coverage in `apps/api/test/e2e/identity/devices.e2e-spec.ts`
- [ ] T086 [P] [US4] Add production-like device/push seed, cursor `EXPLAIN` checks, and bounded HTTP scenario in `apps/api/test/performance/identity-device-queries.sql` and `apps/api/test/performance/identity-devices.k6.js`; verify the cursor index is used, limit <=100, and no token/fingerprint field enters results
- [ ] T087 [US4] Run all US4 tests and record AC-005/AC-007/AC-008/SC-006 evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`

**Checkpoint**: Device and push security works independently of webhook delivery;
Clerk outage cannot undo local revoke, and retry evidence remains bounded.

---

## Phase 7: User Story 5 - Synchronize Clerk Changes Reliably (P1)

**Goal**: Verify raw signed Clerk deliveries, durably deduplicate, synchronize
current provider state without regression, reconcile loss, and redact payloads.

**Independent test**: Valid/invalid/duplicate/conflicting/delayed/out-of-order
created/updated/deleted deliveries plus worker crash/provider outage/reconciliation/
seven-day redaction produce one converged effect and safe retained evidence.

### Tests

- [X] T088 [P] [US5] Add failing pgTAP schema/immutability/lifecycle/index/RLS/grant tests for `private.clerk_webhook_events` in `supabase/tests/007_clerk_webhook_inbox.test.sql`; include API receipt-only, worker lifecycle-only, client/Admin denial, payload redaction, and migration-owner cases
- [X] T089 [P] [US5] Add failing unit/contract tests for official `verifyWebhook()`, exact raw bytes, required Svix headers, timestamp window, content type/size, supported schema, unsupported signed type 204, safe errors, and no custom signature code in `apps/api/test/contract/identity/clerk-webhook.contract-spec.ts`
- [X] T090 [P] [US5] Add failing receipt integration tests for durable-before-202, identical `svix-id`+hash 202/no second row, same ID/different hash 409, rollback/unavailable inbox, and payload-hash immutability in `apps/api/test/integration/identity/clerk-webhook-ingress.spec.ts`
- [X] T091 [P] [US5] Add failing unit tests for current-Clerk synchronization, new-profile activation rule, provider-field-only update, no inactive reactivation, safe event choice, and provider-error retry in `apps/api/test/unit/identity/clerk-webhook.worker.spec.ts`
- [X] T092 [P] [US5] Add failing integration tests for `FOR UPDATE SKIP LOCKED`, same-subject serialization, concurrent workers, process crash rollback, retry ceiling/backoff, duplicate processing, and atomic profile/default/outbox/inbox effects in `apps/api/test/integration/identity/clerk-webhook-worker.spec.ts`
- [X] T093 [P] [US5] Add failing reconciliation tests for current Clerk create/update/absence, pagination/resume checkpoint, lost delivery, provider rate/outage, safe counts/hashes, and no credential/raw-subject output in `apps/api/test/integration/identity/clerk-reconciliation.spec.ts`
- [X] T094 [P] [US5] Add failing retention tests for seven-day boundary, bounded terminal redaction to `{}`, nonterminal recovery before redaction, retained ID/type/hash/status/attempt/time evidence, and no payload scan regression in `apps/api/test/integration/identity/clerk-webhook-retention.spec.ts`
- [X] T095 [P] [US5] Add failing security tests for invalid/stale/future/replayed signature, spoofed forwarding headers, rate limits, raw webhook/header/body/provider-error log absence, and no client/private-table grant in `apps/api/test/security/identity/clerk-webhook-boundary.spec.ts`

### Implementation

- [X] T096 [US5] Create `supabase/migrations/20260827001100_clerk_webhook_inbox.sql` through Supabase CLI with exact receipt/lifecycle/hash/payload/status constraints and base redaction/reconciliation indexes; verify T088 structure/lifecycle assertions pass
- [X] T097 [US5] Create `supabase/migrations/20260827001200_clerk_webhook_grants.sql` through Supabase CLI with forced RLS, immutable receipt fields, API insert+ID/hash conflict read, worker lifecycle/redaction access, migration policy, and zero client/Admin grants; verify all T088 privilege cases pass
- [X] T098 [US5] Add bounded current-user/list-users reconciliation methods and safe 404 versus outage classification to `apps/api/src/identity/clerk-client.service.ts`; verify T091/T093 never treat timeout/rate/auth failure as deletion
- [X] T099 [US5] Implement one-statement durable receipt/duplicate-hash comparison with immutable raw SHA-256 evidence in `apps/api/src/identity/identity.repository.ts`; verify T090 returns only after commit and creates no outbox/domain effect at ingress
- [X] T100 [US5] Implement raw `verifyWebhook()` ingress, signed delivery ID extraction, post-verification schema validation, supported/unsupported policy, and 202/204/409 handling in `apps/api/src/identity/clerk-webhook.controller.ts`; verify T089/T090 pass with no manual signature comparison
- [X] T101 [US5] Implement transaction-scoped inbox claim, per-subject advisory-lock serialization, current-state profile/default/event/status commit, and safe failure update in `apps/api/src/identity/identity.repository.ts`; verify a crash leaves no `processing` row or partial effect
- [X] T102 [US5] Implement provider-owned email/phone normalization, initial-name-only behavior, inactive no-reactivation, confirmed-absence deletion-pending semantics, and event selection in `apps/api/src/identity/clerk-client.service.ts` and `apps/api/src/identity/identity.repository.ts`; verify stale deliveries converge on current Clerk state
- [X] T103 [US5] Implement abort-aware bounded inbox polling, one-row transaction processing, capped retry/terminal alerts, and provider timeout in `apps/api/src/identity/clerk-webhook.worker.ts`; retain the documented provider-call transaction ceiling and add no queue/lease/watermark
- [X] T104 [US5] Implement resumable Clerk reconciliation using the same per-subject synchronization path and safe checkpoint/count/hash evidence in `apps/api/src/identity/clerk-webhook.worker.ts`; verify lost-event tests repair drift without email/phone/token logs
- [X] T105 [US5] Implement bounded seven-day payload redaction and nonterminal pre-redaction recovery in `apps/api/src/identity/clerk-webhook.worker.ts`; verify T094 and active-path query plans pass
- [X] T106 [US5] Add bounded auth/webhook/inbox/reconciliation/redaction/provider/device-retry metrics and safe log reason codes to `apps/api/src/platform/observability/platform-metrics.ts` and `apps/api/src/platform/observability/platform-logger.ts`; verify IDs/claims/payloads never become labels or log fields
- [X] T107 [US5] Register webhook controller and complete worker providers/lifecycle in `apps/api/src/identity/identity.module.ts`, `apps/api/src/worker.module.ts`, and `apps/api/src/worker.ts`; verify API alone receives the signing secret and webhook profile effects remain asynchronous
- [X] T108 [US5] Add and pass signed created/updated/deleted/duplicate/conflict/order/crash/loss/reconcile/redaction E2E coverage in `apps/api/test/e2e/identity/clerk-webhook.e2e-spec.ts`
- [ ] T109 [P] [US5] Add production-like inbox seed/claim/redaction query plans and burst/backlog/provider-slowdown k6 scenario in `apps/api/test/performance/clerk-webhook-queries.sql` and `apps/api/test/performance/clerk-webhook.k6.js`; add the measured forward correction `supabase/migrations/20260827001300_clerk_webhook_claim_index.sql`; prove bounded memory/connections, disjoint work, and no active sequential scan
- [X] T110 [US5] Create the webhook/reconciliation/redaction/device-session incident and recovery runbook in `apps/api/docs/runbooks/clerk-webhook-device-recovery.md`; include owner, thresholds, safe queries, retry/reconcile, secret/push-key rotation, escalation, and closure evidence
- [ ] T111 [US5] Run all US5 tests and record AC-009/AC-012/AC-013/SC-004 evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`

**Checkpoint**: Signed provider events are durably accepted once and converge on
current Clerk truth under duplicate, race, outage, crash, loss, and retention.

---

## Phase 8: User Story 6 - Preserve Admin Contract Boundaries (P2)

**Goal**: Make the owned evidence reusable later while proving Admin has no direct
database authority and no SPEC-BE-003 route/permission implementation appears.

**Independent test**: Compare current masked mocks to the documented mapping, deny
every Admin direct-table attempt, and find zero Admin route/authz/client-source diff.

### Tests

- [X] T112 [P] [US6] Add pgTAP role/grant/RLS negatives for direct Admin access to all six owned tables/functions and safe worker/API separation in `supabase/tests/008_identity_admin_denial.test.sql`
- [X] T113 [P] [US6] Add security tests proving simulated role headers/mock roles/public metadata grant nothing and no `/api/v1/admin/users`, Admin device/session/status/force-logout route exists in `apps/api/test/security/identity/admin-boundary.spec.ts`
- [X] T114 [P] [US6] Add contract tests comparing safe profile/device/session evidence with current Admin mock projection requirements and required masking/deferred permissions in `apps/api/test/contract/identity/admin-client-mapping.contract-spec.ts`

### Implementation / Evidence

- [X] T115 [US6] Complete the reviewed Mobile/Admin ownership, field, masking, deferred-route, and SPEC-BE-003/SPEC-BE-014 handoff matrix in `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/client-mapping.md`; verify no direct Admin table/API authority is documented
- [X] T116 [US6] Add a scope regression assertion that fails on any modified path under `apps/mobile` or `apps/admin-web` for this Spec in `apps/api/test/security/scope-boundary.spec.ts`; verify the current feature diff passes
- [X] T117 [US6] Add and pass an Admin-session direct database/API denial E2E case using protected aliases only in `apps/api/test/e2e/identity/admin-boundary.e2e-spec.ts`
- [X] T118 [US6] Run T112-T117 and record AC-006/AC-014 plus SPEC-BE-003 handoff evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`

**Checkpoint**: SPEC-BE-003 can consume documented evidence later, but Admin has
zero direct grant, route, simulated-role authority, or client cutover in this Spec.

---

## Final Phase: Hardening And Acceptance

**Goal**: Prove all cross-cutting security, provider, migration, performance,
observability, recovery, ownership, and release gates with fresh evidence.

- [X] T119 [P] Reconcile implemented environment behavior against `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/environment.md`, extend redaction/startup tests in `apps/api/test/unit/config/environment.schema.spec.ts`, and verify API/worker/migration matrices plus key rotation rules pass
- [X] T120 [P] Reconcile every runtime path/schema/status/error/security declaration with `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml` in `apps/api/test/contract/openapi-drift.contract-spec.ts`; `npm --prefix apps/api run test:openapi` must report zero drift
- [X] T121 Run clean-state ordered apply, lint, pgTAP, checksum, concurrent migration, failed-migration, and forward-correction tests against all SPEC-BE-001/002 SQL in `supabase/migrations`, `supabase/tests`, and `supabase/migration-checksums.sha256`; historical files must remain immutable
- [X] T122 Run the complete owner/non-owner/anonymous/missing-sub/inactive/API/worker/Admin/table-owner/BYPASSRLS matrix from `supabase/tests/004_identity_profiles_rls.test.sql` through `supabase/tests/008_identity_admin_denial.test.sql`; any cross-row or excess grant blocks release
- [ ] T123 [P] Execute the production-like identity/profile/onboarding/device query and HTTP performance suites under `apps/api/test/performance`; retain redacted P95/P99/payload/EXPLAIN evidence and block on >50 ms DB, >250/500 ms API, >50 KiB, N+1, unbounded query, or wrong index
- [ ] T124 [P] Execute webhook burst/backlog/provider-slowdown/crash/stress tests in `apps/api/test/performance/clerk-webhook.k6.js`; record connection/throughput ceiling evidence and stop for approved Master Plan change if the one-row provider-call transaction fails its budget
- [X] T125 [P] Extend/run non-root, read-only filesystem, no-dev-dependency, no-baked-secret, API/worker config, readiness, and SIGTERM drain checks in `apps/api/test/container/runtime-contract.spec.ts` against the release image
- [X] T126 [P] Run dependency audit, SAST, repository/history/image secret detection, and log/fixture scans; record only safe pass/fail references in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/security-evidence.md` and block on any Clerk/webhook/push/database/test credential, JWT, OTP, phone/email, or token exposure
- [X] T127 Create and complete applicable ASVS 5.0 L2/L3 identity/privacy, OWASP API Top 10:2023, OWASP Top 10:2025, and MASVS 2.1.0 traceability with exact tests/evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/owasp-traceability.md`; any exploitable Critical/High or unsigned/replayed webhook remains blocking
- [X] T128 Complete FR-001..FR-045, AC-001..AC-015, and SC-001..SC-008 traceability to tasks/tests/results in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`; no requirement may rely on inferred or stale evidence
- [X] T129 Create the Clerk/JWKS/native-Supabase/provider outage, key rotation, wrong-domain/party, readiness, and no-fallback runbook in `apps/api/docs/runbooks/clerk-auth-provider-recovery.md`; include owner, alerts, safe diagnostics, mitigation, escalation, reconciliation, and closure
- [X] T130 Review both identity runbooks against implemented metrics/alerts and provider procedures in `apps/api/docs/runbooks/clerk-auth-provider-recovery.md` and `apps/api/docs/runbooks/clerk-webhook-device-recovery.md`; run each tabletop and retain safe evidence references
- [ ] T131 Document final bounded metric names/labels, alert thresholds/windows/severity, dashboard evidence references, and runbook links in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/operations-evidence.md`; prove no high-cardinality user/session/event ID label exists
- [ ] T132 Run N-1 image compatibility, failed+forward migration, Clerk/JWKS/Supabase outage, lost webhook, worker crash, signing/encryption/hash-key rotation, linked-session retry, and payload-retention recovery procedures from `apps/api/specs/002-auth-profiles-preferences-sessions/quickstart.md`; verify no identity/evidence loss or fallback auth
- [X] T133 Complete every verifiable provider item in `apps/api/specs/002-auth-profiles-preferences-sessions/contracts/provider-configuration.md` using redacted evidence; leave AC-001/release blocked if exact SMS country enforcement is still unavailable and never mark unchecked items complete by assumption
- [ ] T134 Run the protected two-Phone/one-Google owner/non-owner matrix across auth, RLS, profile, preferences, onboarding, devices, webhook synchronization, and Admin denial; reference alias-only results in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md`
- [X] T135 Run Mobile/Admin mapping and no-client-diff gates from `apps/api/test/contract/identity/mobile-onboarding-mapping.contract-spec.ts`, `apps/api/test/contract/identity/admin-client-mapping.contract-spec.ts`, and `apps/api/test/security/scope-boundary.spec.ts`; verify client mocks/source remain unchanged
- [ ] T136 Run `npm --prefix apps/api run verify`, full pgTAP, container, performance, stress, provider-backed E2E, and recovery commands; record exact fresh command results in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/acceptance-traceability.md` without converting skips/partials into passes
- [X] T137 Run `$speckit-analyze` against `apps/api/specs/002-auth-profiles-preferences-sessions/spec.md`, `plan.md`, and `tasks.md`; record every finding in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/artifact-analysis.md`
- [ ] T138 Resolve every critical/high and production-relevant analysis finding by updating the owning artifact/source/test under `apps/api/specs/002-auth-profiles-preferences-sessions`, rerun T136-T137, and verify zero unresolved Constitution/ownership/security/contract conflict
- [X] T139 Review every Definition of Done checkbox against fresh evidence and record final pass/block status in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`; do not claim completion while the SMS/provider/dependency/security/performance/remote gate is open
- [X] T140 Run `git status --short`, `git diff --check`, ownership path checks, client-diff checks, generated-artifact/secret scans, and migration checksum verification; stage only SPEC-BE-002-owned files and record the final scope review in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`
- [X] T141 Commit the verified SPEC-BE-002 change on the existing `codex/backend-spec-be-002` delivery branch with a clear Spec-identifying message after T139-T140 pass; verify the commit contains no unrelated/untracked user files and reference it in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`
- [X] T142 Push `codex/backend-spec-be-002` to `https://github.com/abdullah-zordok/MASREFY_Final` without force or merge; record the remote commit reference in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`
- [ ] T143 Collect CI test/image/SBOM/vulnerability/signature/provenance results for the pushed delivery-branch commit when the repository workflow supports that ref, and attach only safe evidence references to `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`
- [X] T144 Address every remote failure with a forward-fix commit on `codex/backend-spec-be-002`, rerun affected local checks before pushing, and update `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`
- [ ] T145 Mark SPEC-BE-002 complete only after T143-T144 and every DoD/acceptance/provider gate passes; record final completion evidence in `apps/api/specs/002-auth-profiles-preferences-sessions/checklists/definition-of-done.md`

## Dependencies

### Phase graph

```text
Phase 1 baseline review
  -> Phase 2 blocking foundations
      -> US1 trusted identity/RLS
          -> US2 profile/preferences
          -> US3 onboarding
          -> US4 devices/push
          -> US5 webhook synchronization
              -> US6 Admin boundary proof
                  -> Final hardening/acceptance/release
```

### Story dependencies

| Story | Depends on | Reason |
|---|---|---|
| US1 | Phase 2 | Supplies the only verified principal and RLS request context |
| US2 | US1 | Profiles/RLS/guard are required for owner `/me` and preferences |
| US3 | US1; may run after US1 in parallel with US2 | Uses active owner/profile but not profile/preferences endpoint implementation |
| US4 | US1; may run after US1 in parallel with US2/US3 | Uses verified subject/session and profile FK |
| US5 | US1 and profile schema; complete after US2 event/default behavior is stable | Synchronizes profiles/default rows and reuses outbox; schedules US4 session recovery |
| US6 | US1-US5 database/API contracts | Proves final owned surface and deferred Admin handoff |

US2, US3, and US4 can be developed concurrently after US1 only if different
agents/files are isolated; their shared edits to `identity.dto.ts`, repository,
service, controller, and module must be serialized or integrated deliberately.

## Parallel Execution Examples

### Foundations

After T007, T008, T010, T011, T013, T015, and T017 use separate test/config files
and may run in parallel. T009/T012/T014/T016 then implement their paired failures
serially where platform files overlap.

### US1

T019-T023 are independent failing-test tracks. After them, the safe groups are:

```text
Database: T024 -> T025
SDK/auth: T026 -> T027
Provider evidence: T031 and T032 (different dashboard areas, one evidence file edit serialized)
```

T028-T030 integrate those tracks before provider E2E T033-T037.

### US2

T038-T042 may run in parallel. T043, T044, and T050 use different files and may
start after the failing tests; T045-T049 serialize shared repository/service/
controller/module changes. T052 performance work is parallel after the schema/API
contract stabilizes.

### US3

T054-T057 may run in parallel. T058 and T059 can run concurrently, followed by
T060-T062. T063 mapping tests are independent of SQL and may run alongside T058.

### US4

T066-T072 may run in parallel. Afterward:

```text
Database: T073 -> T074
Crypto: T075
Clerk session adapter: T076
DTO: T077
Performance fixtures: T086 after T073
```

Repository/service/controller tasks T078-T084 then integrate serially.

### US5

T088-T095 may run in parallel. Database T096-T097, Clerk adapter T098, and metrics
T106 use different files. T099-T105 serialize the shared ingress/repository/service/
worker flow. T109 and T110 can proceed after contracts stabilize.

### US6 and final

T112-T114 are parallel. After T118, T119-T127 and T129 may use separate files/test
environments, but database/container/performance jobs must respect local resource
capacity. T137 follows complete task generation and T136 fresh verification;
release tasks T139-T145 are strictly serial.

## Implementation Strategy

1. **Dependency gate first**: complete T001-T006 only; stop if BE-001 is not merged
   or the real baseline conflicts with the plan.
2. **MVP**: Phase 2 plus US1. This proves one Clerk identity, native Supabase trust,
   active-profile denial, and RLS without any customer resource expansion.
3. **Customer state increment**: US2, then US3. Each ends with an independently
   testable protected API slice.
4. **Security state increment**: US4 adds device/push/session revocation without
   depending on webhook delivery.
5. **Provider reliability increment**: US5 adds verified ingress, convergence,
   reconciliation, and retention using the established identity aggregate.
6. **Boundary proof**: US6 confirms reusable evidence without implementing Admin.
7. **Release**: complete every final gate, analyze artifacts, commit and push
   directly to `main`, collect remote evidence, and fix failures forward.

## Completion Rule

- A checkbox is marked only after its named command/procedure succeeds with fresh
  retained evidence; expected RED tests are not completion evidence until their
  paired implementation turns them green.
- Skipped, partial, stale, inferred, or provider-unverified outcomes remain open.
- No task may create a resource outside SPEC-BE-002 ownership or modify Mobile/Admin
  source. Durable generic idempotency remains SPEC-BE-006.
- No real secret, JWT, OTP, phone/email, raw subject/session/event, push token,
  fingerprint, webhook body/header, or provider response is committed or logged.
- An unresolved SMS country restriction, dependency hold, RLS cross-user path,
  invalid webhook acceptance, Critical/High finding, performance/recovery failure,
  or remote gate blocks push or final completion.
