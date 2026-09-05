# Prior-Spec Dependency Review

All SPEC-BE-001 through SPEC-BE-010 packages, task ledgers, current source,
ordered root migrations/tests, and available evidence were inspected.

| Spec | Ledger at baseline | Phase 11 dependency conclusion |
|---|---:|---|
| 001 foundation | 178 checked / 3 historical branch-PR tasks unchecked | Current database, Storage, outbox, queue, worker, HTTP, config, observability, migration and CI implementation exists on `main`; obsolete branch-era checklist items do not describe missing runtime primitives. |
| 002 identity | 125 checked / 20 external/performance/old delivery tasks unchecked | Current profiles, devices, encrypted push tokens, Clerk guards and identity repositories exist. Genuine provider identities remain external; Phase 11 does not claim them. |
| 003 security | 120 / 120 | RBAC, exact permission manifest, recent MFA, audit, support grants, privacy handlers and deny-by-default patterns are reusable. |
| 004 reference | 60 / 60 | Current reference data and owner-scoped lookup conventions are reusable. |
| 005 ledger | 111 / 111 | Financial event contracts are consumed read-only; ledger commands and transactions are not modified. |
| 006 sync | 90 / 90 | Idempotency, cursor and replay conventions are reusable. |
| 007 planning | 117 / 117 | Planning event contracts are consumed read-only. |
| 008 tracking | 139 / 139 | Tracking/import event contracts and Storage patterns are reusable. |
| 009 AI | 101 / 101 | AI event contracts may be consumed; no AI behavior or provider access is added. |
| 010 reports | 95 / 95 | SMTP, Storage, cache, worker and closeout conventions are reusable. |

The root migration chain ends at Phase 10 and pgTAP ends at
`043_phase10_reports_functions.test.sql`. Specs 004-010 contain their expected
local/security/performance/recovery/client/convergence/remote evidence. Phase 11
does not reopen or rewrite any prior migration or owned business command.

