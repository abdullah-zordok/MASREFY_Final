# Wave 6 — Voice and AI

Status: local Wave 6 implementation and verification are complete through T088. T089 remains open until the implementation commit is pushed and required GitHub Actions pass for its exact SHA.

- Base and rollback SHA: `72b2d2839bb7bbb84340b1f8d911eb35cc89cc3c` (accepted Wave 5 evidence SHA).
- Required implementation commit: `feat(cutover): complete voice ai wave`.
- No Phase 14-owned generic cutover resource was added. The owner correction adds the BE009 assistant-availability projection to the existing Phase 9 schema.
- Protected user-owned paths remain excluded from edits and staging. The assistant contract file remains byte-for-byte preserved.

## Implemented scope and contracts

BE009 safe error transport now preserves allowlisted domain codes and bounded quota metadata while unknown fields remain closed. Runtime AJV instances cover quota, consent/preferences, AssistantMessage and Admin mutation responses. The assistant-availability endpoint derives consent, rolling-24-hour quota and provider readiness from existing owner data. Consent writes require the current optimistic-concurrency version and reject stale or retired policy versions.

Production Mobile selectors construct strict voice and assistant adapters with `getLiveClerkToken`. Voice mapping preserves actual recording duration and authoritative session, proposal, operation and version identifiers. Edited transcripts, multiple proposals, transfers and obligations are never silently downgraded to expense: unsupported execution paths return explicit unavailable states. No financial mutation runs before owner confirmation.

Assistant mapping retrieves authoritative consent, availability and quota, traverses conversations/messages for cold response and preview restoration, preserves action/source versions, and rejects malformed or unknown values. Owner changes clear response/preview caches before cold traversal. Editable preview mutation is explicit unavailable because BE009 exposes no safe update contract; confirmation and cancellation use the accepted owner endpoints. Replayed message creates return the durable result without reopening an SSE stream.

The Admin AI repository uses the shared authenticated client, strict live schemas, complete cursor handling, exact money/token metrics, sanitized report/safety fields and exact mutation bodies. Client-side severity, content, safety, totals and timestamps are not invented.

## Test-first and rehearsal receipts

- Voice regressions cover actual duration, cold/restored proposals, edited transcripts, multiple proposals, transfer/obligation metadata, upload/process/poll state validation, and original operation/version IDs.
- Assistant regressions cover authoritative availability/quota, cold response/preview retrieval, complete action/source-version mapping, confirmation readback and unknown/error rejection.
- Admin regressions cover strict schemas, cursor totals, exact metrics, sanitized reports, payloads, errors and MFA behavior.
- Clean local-database rehearsal ran all 15 AI integration suites (33 tests), verified `enabled_routes_after_ai=0`, then passed all 58 pgTAP files / 1,804 tests. This proves each AI suite tears down its route/prompt fixtures and cannot contaminate later database gates.
- Deterministic provider rehearsals cover the shared five-request rolling-24-hour quota, allowed routing, privacy controls, circuit/outage isolation, rollback selection and recovery without claiming live OpenRouter execution.

## Verification receipts

All results below are local and use no hosted production identity, provider key, native microphone, signed build, or deployed cohort.

| Gate | Result |
|---|---|
| API full unit | 117 suites / 885 tests passed |
| API full contract | 77 suites / 227 tests passed |
| API AI integration after clean reset | 15 suites / 33 tests passed; zero enabled routes remained |
| API AI security | 5 suites / 10 tests passed |
| API AI recovery | 1 suite / 3 tests passed |
| API AI performance and stress | Passed against disposable local Supabase |
| API OpenAPI drift | 1 suite / 3 tests passed |
| Full local pgTAP after clean reset | 58 files / 1,804 tests passed |
| API build, typecheck, lint and migration checksums | Passed |
| API dependency audit | Exit 0 at the High threshold; one Moderate `qs` advisory remains upstream |
| Mobile dependency audit | Exit 0 at the High threshold after the lock-only `js-yaml` 3.15.2/4.3.2 remediation; 32 Moderate advisories remain below the release threshold |
| Mobile focused voice/assistant/auth rehearsal | 3 suites / 21 tests passed |
| Mobile full Jest | 432 suites / 2,004 tests passed; exit 0 with the known `--forceExit` open-handle warning |
| Mobile typecheck | Passed |
| Mobile ESLint | Passed with 0 errors and 78 pre-existing warnings |
| Mobile frontend-quality boundaries | Passed; 953 files checked |
| Admin focused AI repository/contracts | 2 files / 21 tests passed |
| Admin Wave 6 rehearsal | 4 files / 29 tests passed |
| Admin full Vitest | 80 files / 854 tests passed |
| Admin typecheck and ESLint | Passed |
| Admin live production build | 82 pages generated with mocks disabled and valid non-secret build configuration |
| Admin AI Playwright matrix | 25 tests passed across five viewports |
| Admin performance Playwright | 1 test passed |
| Mobile production export and credential scan | 125 routes exported to `C:\Users\DELL\AppData\Local\Temp\masarifi-phase14-wave6-final-export`; no embedded server credential or provider endpoint found |
| Exact-SHA remote acceptance | Pending T089 push and required workflow completion |

## Reviews

- Clean Code/SOLID/DRY/KISS/YAGNI review: PASS after reusing the existing shared client, selectors, BE009 repository and safe-error boundary; no new dependency or speculative abstraction was added.
- Test-quality review: PASS after making the unknown-field AJV case exercise an otherwise complete runtime instance and isolating every integration suite's route/prompt fixtures.
- Security diff review: PASS. The initial immutable scan `8bff29b4-2573-4127-b9d2-1c72bb48e871` found four actionable issues: retired consent-policy acceptance, replayed-message SSE amplification, identity-agnostic preview caching, and discarded consent versions. After test-first remediation, final scan `e048caf6-a2ef-45d4-95c2-ebc6e7b05150` reviewed 26 items with complete coverage and reported zero findings. Snapshot digest: `codex-security-snapshot/v1:sha256:4a307217b3e4ec4ad661e4395bf489a05da9f46ccdfe4440c6dcfeb19e15a5ba`.
- Diff review: PASS after aligning safe runtime errors with the closed BE009 schemas, preserving exact live pagination cursors, and removing cache-only/fabricated success paths.

## External limits

Approved OpenRouter privacy/ZDR and live model behavior, hosted Clerk/Supabase owner and cross-owner execution, physical Android/iOS microphone behavior, signed builds, deployed shadow/cohort observation and N-1 binary rollback remain open in [external gates](external-gates.md). Deterministic local provider fixtures and mock-mode browser tests are not represented as hosted proof.

The existing voice UI still emits a local notification and stores a local merchant/category preference through fixture-named seams. They do not replace, confirm or fabricate the BE009 financial mutation, but moving notification/support production consumers to BE011 is Wave 8 scope and remains visible in the mock-removal report.

Pre-commit preservation receipt: `apps/mobile/src/services/contracts/assistant-notifications-service.ts` SHA-256 is `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, and the assistant file remain excluded from staging.
