# Phase 14 Free-Only Release Checklist

Unchecked items are implementation/release gates, not omissions from the planning package.

## Artifact and Scope Gates

- [ ] SpecKit analysis has zero unresolved material finding.
- [ ] Contract manifest contains every active Mobile/Admin operation with exact live or explicit unavailable disposition and linked evidence.
- [ ] No Phase 14 database object, migration, endpoint, DTO, worker, job, or event exists.
- [ ] SPEC-BE-012, Stripe, paid entitlement, checkout, subscriptions, promotions, payment history, and billing reconciliation remain unimplemented and unavailable.
- [ ] Existing unrelated user work remains present and excluded from Phase 14 commits unless an exact reviewed hunk is integrated.

## Per-Wave Gates

- [x] Wave 1 Identity local implementation, verification, and review complete; acceptance waits for the pushed-SHA remote gate.
- [ ] Wave 2 Reference/accounts accepted, pushed, and remotely green.
- [ ] Wave 3 Ledger/sync accepted, pushed, and remotely green.
- [ ] Wave 4 Planning accepted, pushed, and remotely green.
- [ ] Wave 5 Tracking/imports accepted, pushed, and remotely green.
- [ ] Wave 6 Voice/AI accepted, pushed, and remotely green.
- [ ] Wave 7 Reports accepted, pushed, and remotely green.
- [ ] Wave 8 Engagement accepted, pushed, and remotely green.
- [ ] Wave 9 Operations accepted, pushed, and remotely green.

## Client and Data Gates

- [x] Production Mobile identity selects Clerk/live owner providers explicitly and rejects missing/invalid API or Clerk configuration.
- [x] Production Admin rejects MSW and uses Clerk-authenticated Wave 1 repositories.
- [x] Unhandled MSW API requests fail in test/development while framework navigation remains available.
- [ ] Production static/bundle scan finds no mock/demo route, provider secret, service-role call, direct OpenRouter call, unsafe URL, or hidden debug mode.
- [ ] SQLite records, pending mutations, conflicts, drafts, device-only preferences, PIN/biometric material, and encryption guarantees survive upgrade/cutover/rollback.
- [ ] Unknown fields, states, errors, and malformed responses fail explicitly.
- [ ] Financial and report values reconcile exactly with zero tolerance.

## Security, Performance, and Recovery Gates

- [ ] Complete RLS/grant owner/non-owner/Admin/worker/anonymous matrix passes.
- [ ] Authentication/authorization, MFA/recent-auth, audit/redaction, provider outage, and OWASP traceability pass.
- [ ] Secret, dependency, container/image, and security diff scans have zero unresolved exploitable Critical/High finding.
- [ ] All owning P95/P99, payload, pagination, query-plan, cache, sync, queue, AI, report, stress, and no-unbounded-query gates pass.
- [ ] N-1 client/image rollback, failed migration/forward correction, replay, backup/restore, storage recovery, ledger/report reconciliation, and locally provable RPO/RTO pass.
- [ ] External provider/device/hosted/registry/signing/store gaps remain accurately open until genuine proof exists.

## Final Verification and Delivery

- [ ] Full API, Supabase, Mobile, Admin, contract drift, bundle, mock-removal, review, and release commands pass freshly.
- [ ] Clean Code review, test review, independent code review, and security diff scan have no unresolved blocker.
- [ ] Mock-removal report is complete and every retained mock is explicitly demo/test-only.
- [ ] `billingAvailable` is false and no billing provider is active.
- [ ] Every task is checked or accurately marked as an unavoidable external gate after all local work.
- [ ] Final `main` equals `origin/main` and required remote CI for the final SHA is successful.
