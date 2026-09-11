# Phase 14 Free-Only Release Checklist

Unchecked items are implementation/release gates, not omissions from the planning package.

## Artifact and Scope Gates

- [x] SpecKit analysis has zero unresolved material finding.
- [x] Contract manifest contains every active Mobile/Admin operation with exact live or explicit unavailable disposition and linked evidence.
- [x] No Phase 14 database object, migration, endpoint, DTO, worker, job, or event exists.
- [x] SPEC-BE-012, Stripe, paid entitlement, checkout, subscriptions, promotions, payment history, and billing reconciliation remain unimplemented and unavailable.
- [x] Existing unrelated user work remains present and excluded from Phase 14 commits unless an exact reviewed hunk is integrated.

## Per-Wave Gates

- [x] Wave 1 Identity accepted at `4f1ba15d2c21fe1af897beda1d1ef3a1c08c6ae7`; all required jobs in Backend Foundation run `34217625981` passed.
- [x] Wave 2 Reference/accounts accepted at `4fa062691d9977c5d70062b9ada0a2c45cf4505c`; all required jobs in Backend Foundation run `34266115054` passed.
- [x] Wave 3 Ledger/sync accepted at forward-fix SHA `4acc53b30f72d15f175016b43762963b4a082d4d`; all 12 required jobs in Backend Foundation run `34290179908` passed.
- [x] Wave 4 Planning accepted at `09dd0f0968226c37b849dc35955f40a9cc54d86d`; all required jobs in Backend Foundation run `34310124533` passed, with evidence follow-up `c4c5dcb6ef68984f69898ecc40d7af68cbf85695` also remotely green in run `34311999577`.
- [x] Wave 5 Tracking/imports accepted at `943ba40734a1a142c30d68a3c34d189ac4349b96`; all 12 required jobs in Backend Foundation run `34323754467` passed.
- [x] Wave 6 Voice/AI accepted at `0b000d1dcc82de4a3f9a8e86c7f5c0eab6982ceb`; all required jobs in Backend Foundation run `34347313370` passed, with evidence follow-up `ec475d36e122596a16e21cda670dbbf8f67f1f07` also remotely green in run `34349876623`.
- [x] Wave 7 Reports accepted at `069499dd5aa0883332058c367af81c6db15f185a`; the stale test-only export fixture exposed by run `34449410712` was forward-fixed at `f158666f38a35cf34c7a20510586dd4eaadda3e5`, and all required jobs passed in Backend Foundation run `34452034138`.
- [x] Wave 8 Engagement accepted, pushed, and remotely green.
- [x] Wave 9 Operations accepted at `86a64c4c3f70bd9f8cd2d388144be470f90c7ff7`; all required jobs in Backend Foundation run `34593905513` passed.

## Client and Data Gates

- [x] Production Mobile identity selects Clerk/live owner providers explicitly and rejects missing/invalid API or Clerk configuration.
- [x] Production Admin rejects MSW and uses Clerk-authenticated Wave 1 repositories.
- [x] Unhandled MSW API requests fail in test/development while framework navigation remains available.
- [x] Production static/bundle scan finds no reachable mock/demo route, provider secret, service-role call, direct OpenRouter call, unsafe service URL, or hidden debug mode; inert code-split fixtures remain demo/test-only behind fail-closed production policy.
- [x] SQLite records, pending mutations, conflicts, drafts, device-only preferences, PIN/biometric material, and encryption guarantees survive upgrade/cutover/rollback in the repository-provided local/real-SQLite coverage; physical-device proof remains external.
- [x] Unknown fields, states, errors, and malformed responses fail explicitly.
- [x] Financial and report values reconcile exactly with zero tolerance.

## Security, Performance, and Recovery Gates

- [x] Complete local RLS/grant owner/non-owner/Admin/worker/anonymous matrix passes.
- [x] Authentication/authorization, MFA/recent-auth, audit/redaction, provider outage, and OWASP traceability pass locally; hosted identity evidence remains external.
- [x] Secret, dependency, container/image, and security diff scans have zero unresolved exploitable Critical/High finding.
- [x] All owning P95/P99, payload, pagination, query-plan, cache, sync, queue, AI, report, stress, and no-unbounded-query gates pass.
- [x] Source/local N-1 client/image policy, failed migration/forward correction, replay, disposable backup/restore, storage recovery, ledger/report reconciliation, and locally provable RPO/RTO pass; deployed rollback and full DR remain external.
- [x] External provider/device/hosted/registry/signing/store gaps remain accurately open until genuine proof exists.

## Final Verification and Delivery

- [x] Full API, Supabase, Mobile, Admin, contract drift, bundle, mock-removal, review, and release commands pass freshly.
- [x] Clean Code review, test review, per-wave independent code review, and final aggregate security diff scan have no unresolved blocker.
- [x] Mock-removal report is complete and every retained mock is explicitly demo/test-only.
- [x] `billingAvailable` is false and no billing provider is active in repository code or local release artifacts; protected deployment inspection remains external.
- [ ] Every task is checked or accurately marked as an unavoidable external gate after all local work.
- [ ] Final `main` equals `origin/main` and required remote CI for the final SHA is successful.
