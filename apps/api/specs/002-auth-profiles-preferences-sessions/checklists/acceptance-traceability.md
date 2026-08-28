# Acceptance Traceability — SPEC-BE-002

## Implemented local evidence

- AC-005/SC-003: migrations 005-013 and pgTAP 004-008 cover six owned tables, functions, forced RLS, least grants, and owner/non-owner/Admin negatives; latest local result: 8 files, 308 tests.
- AC-007: runtime OpenAPI drift passes for all ten operations; DTO/contract suites and real-database HTTP E2E cover two-owner profile/preferences and onboarding flows.
- AC-008/SC-006: crypto, registration race/rotation, local-first revoke, recent auth, provider retry, and device E2E tests pass locally.
- AC-009/SC-004: official signed ingress, durable duplicate/hash conflict, current-state worker convergence, concurrent claims, provider rollback, reconciliation, and seven-day redaction pass with local fixtures.
- AC-010: active-profile database assertion and inactive lifecycle tests fail closed.
- AC-012: bounded metrics, redaction checks, and both recovery runbooks exist; dashboard/tabletop evidence remains open.
- AC-013: additive ordered migrations exist; final checksum/N-1/forward-recovery run remains open.
- AC-014: mapping-only contract and no-client-diff/Admin-denial tests pass; SPEC-BE-003/014 work remains deferred.

## Release blockers

- AC-002: Android is configured, while the Apple Team ID required for iOS is unavailable.
- AC-003: Clerk native Supabase integration, no legacy JWT Template, the hosted exact-domain connection, and real asymmetric token acceptance all pass; a corrupted token fails closed.
- AC-004/AC-006/SC-001: one Google identity passes the official Clerk guard, hosted Third-Party Auth, and local owner/non-owner RLS; two Phone identities and the hosted schema remain unavailable for the full matrix.
- AC-011: production-like SQL runs used the profile primary keys, device cursor index, and webhook claim/retention indexes under the 50 ms DB budget. Authenticated identity k6 requires protected provider tokens and all remaining k6 was explicitly skipped by the user; it is not a pass.
- AC-015: dependency audit, SAST, repository/history/image secret scans, release-container checks, and remote CI/image/Trivy pass; tag-only SBOM/signature/provenance remains open.
- SC-002/SC-005/SC-007/SC-008: locally covered in part; final provider and release evidence remains open.

FR-001..FR-045 map to tasks T001..T145 in `tasks.md`; unchecked tasks remain explicit evidence gaps and are not inferred as passes.

## Fresh command evidence — 2026-08-29

- Fresh local `npm run verify`: unit 172/172, contract 83/83, security 50/50, build, migration checksums, dependency audit, and workflow pins pass. Explicit live-database runs separately pass integration 48/48 and E2E 18/18.
- `npm run db:lint && npm run test:db`: no schema errors; 8 files and 308 pgTAP assertions pass.
- `npm run test:release-image`: 4 suites and 9 container assertions pass.
- Production-like SQL: profile lookup 0.036 ms, preferences lookup 0.023 ms, device cursor 0.059 ms, webhook claim 0.036 ms, and retention 0.051 ms in the final recorded local run; all used the intended indexes after forward migration 013 and removed their own fixtures.
- Clean-state rehearsal: local reset reapplied migrations 001-013; schema lint passed; pgTAP passed 8 files/308 assertions; migration apply/checksum/concurrency/backup-restore passed 4/4.
- Provider recovery rehearsal: live-database integration passed 18 suites/48 tests, including Clerk outage, reconciliation, webhook crash/retry/retention, and device session recovery.
- Completed load evidence: outbox 4,791 iterations with zero claim failures (P95 18 ms/P99 53 ms); webhook 600 requests with only 202/expected 429 responses (P95 7.045 ms/P99 15.063 ms). Remaining k6 is skipped by explicit user instruction and not counted as a release pass.
- Clerk provider evidence: native Supabase integration reports Enabled; JWT Templates reports 0 items; OIDC issuer/JWKS match the approved asymmetric instance. One controlled Google session with `role=authenticated` passes the official API guard, reaches hosted PostgREST through the exact-domain Third-Party Auth connection, and passes local owner/non-owner RLS; a corrupted token is rejected with `401/PGRST301`. Hosted Supabase contains zero `auth.users`; hosted owner/non-owner RLS still requires the canonical hosted schema and two Phone identities.
- Remote workflow `33211892554`: application, live database, Gitleaks/redaction, release-image/container/non-root, image-digest artifact, and Trivy all pass on commit `bcf45bb`; k6 is intentionally skipped and signed release evidence remains tag-only.

## Requirement traceability

| Requirement | Primary tasks/evidence | Result |
|---|---|---|
| FR-001 | T006, T031, provider checklist | Pass for one Development application; external matrix open |
| FR-002 | T006, T031, provider checklist | Pass for Phone/Google-only dashboard state |
| FR-003 | T031, T133 | Pass: Clerk enforces exactly Egypt, Saudi Arabia, and UAE (3 of 224 selected) |
| FR-004 | T032 | Partial: callback/Native API/Android registration pass; iOS is blocked on Apple Team ID |
| FR-005 | T030, T033 | Clerk/hosted Third-Party Auth configuration and real asymmetric token acceptance pass; hosted owner RLS awaits schema deployment |
| FR-006 | T008, T021, T126 | Pass: no legacy template/shared-secret implementation |
| FR-007 | T020, T037, secret/scope scans | Pass locally; provider matrix open |
| FR-008 | T012-T018 | Pass: official Clerk authenticator and fail-closed guard |
| FR-009 | T015, T036 | Local cache/fail-closed tests pass; provider rotation proof open |
| FR-010 | T014, T019-T020 | Pass: verified subject only, transaction-local claims |
| FR-011 | T024, pgTAP 004 | Pass |
| FR-012 | T019, T024-T025, pgTAP 004 | Pass |
| FR-013 | T038-T050, pgTAP 005 | Pass |
| FR-014 | T054-T064, pgTAP 005 | Pass |
| FR-015 | T066-T074, T088-T097, pgTAP 006-007 | Pass |
| FR-016 | T020, T040, T056, T066, T088, T112 | Pass: forced RLS/minimum grants |
| FR-017 | T019, T024 | Pass |
| FR-018 | T019, T024, inactive integration/security suites | Pass |
| FR-019 | T112-T118 | Pass locally; Admin privileged work remains deferred |
| FR-020 | T038-T051 | Pass |
| FR-021 | T039-T051 | Pass |
| FR-022 | T038-T051 | Pass |
| FR-023 | T054-T065 | Pass |
| FR-024 | T068, T077-T085 | Pass |
| FR-025 | T069, T073, T078-T085 | Pass |
| FR-026 | T066, T069, T073-T080 | Pass |
| FR-027 | T069, T071, T074, T078 | Pass |
| FR-028 | T070, T076, T079-T085 | Pass |
| FR-029 | T066, T069-T080 | Pass |
| FR-030 | T089-T090, T095, T100 | Pass locally |
| FR-031 | T088-T100 | Pass |
| FR-032 | T091-T108 | Pass locally |
| FR-033 | T092-T105, worker/E2E suites | Pass locally |
| FR-034 | T088, T094, T105, redaction E2E | Pass |
| FR-035 | T093, T098, T104, reconciliation E2E | Pass locally |
| FR-036 | T071, T095, T126 | Pass locally |
| FR-037 | T009, T119, T125-T126 | Pass locally |
| FR-038 | T005, T116, T135 | Pass: client diff empty |
| FR-039 | T106, T131, logger/metrics tests | Local metrics/log safety pass; dashboards open |
| FR-040 | T052, T123 | DB/index budgets pass; authenticated HTTP k6 open |
| FR-041 | T121, checksums/migration E2E | Clean-state/apply/checksum/concurrency/backup-restore pass; N-1 hosted rehearsal open |
| FR-042 | T121, T132, runbooks | Local outage/crash/retry/rotation/retention recovery paths pass; hosted provider rehearsal open |
| FR-043 | T034, T134 | Partial: one Google identity verified; two Phone identities blocked |
| FR-044 | T126-T145 | Partial: local gates pass; load/provider/remote gates open |
| FR-045 | T042, T059, T068, contract/E2E suites | Pass |

| Acceptance criterion | Evidence/result |
|---|---|
| AC-001 | Pass: one Development app, Phone/Google only, and exact three-country SMS restriction |
| AC-002 | Partial: callback/Native API/Android verified; iOS registration blocked |
| AC-003 | Pass: native integration/no-template, hosted exact-domain connection, real asymmetric token acceptance, and corrupt-token rejection |
| AC-004 | One real Google session and local guard negatives pass; Phone/rotation provider proof blocked |
| AC-005 | Pass: 308 pgTAP assertions |
| AC-006 | One real Clerk session and local fixtures pass owner/non-owner/Admin denial; protected three-user hosted proof blocked |
| AC-007 | Pass: OpenAPI/validation/masking/version/idempotency/E2E |
| AC-008 | Pass locally: crypto/device/revoke/retry/exposure suites |
| AC-009 | Pass locally: signature/replay/order/retry/loss/reconcile/redaction suites |
| AC-010 | Pass locally: inactive/missing/stale fail closed |
| AC-011 | DB pass; authenticated HTTP k6 open |
| AC-012 | Metrics/logs/runbooks and local tabletop pass; production dashboards open |
| AC-013 | Clean apply/checksum/concurrency/backup-restore pass; N-1 hosted rehearsal open |
| AC-014 | Pass: mapping and no-client-diff/Admin-route gates |
| AC-015 | Local and remote CI/image/vulnerability gates pass; provider and tag-only signed-release gates remain open |

| Success criterion | Evidence/result |
|---|---|
| SC-001 | Partial: one Google identity passes; two Phone identities remain blocked |
| SC-002 | Pass for all local invalid/unusable identity fixtures |
| SC-003 | Pass for local pgTAP/integration/E2E owner matrices |
| SC-004 | Pass for local duplicate/order/failure/reconciliation fixtures |
| SC-005 | Functional/conflict behavior passes; authenticated HTTP budget open |
| SC-006 | Pass for local revoked-device and exposure suites |
| SC-007 | Pass for local ownership/contract/task evidence; provider/remote references open |
| SC-008 | Pass locally; no forbidden identity/secret/template artifact found |
