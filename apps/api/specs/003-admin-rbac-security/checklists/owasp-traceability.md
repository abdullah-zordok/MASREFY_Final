# OWASP traceability

| Control family | Phase 03 control | Evidence | Result |
| --- | --- | --- | --- |
| ASVS V2 / API1 Broken Object Authorization | verified Clerk subject, owner RLS, exact object predicates | pgTAP 010/012/014; admin/owner integration and negative security suites | Pass |
| ASVS V4 / API5 Broken Function Authorization | exact DB permission, active Admin/assignment, recent MFA | guard/unit/security matrix; permission manifest and DB tests | Pass |
| ASVS V5 / API3 Property Authorization | request/query allowlists and redacted projections | DTO/contract tests; owner-column grants; workspace projection | Pass |
| ASVS V6/V9 Cryptography & communications | token hashing, keyed IP hashing, private Storage, short-lived signing | DTO, provider/storage, environment tests | Pass |
| ASVS V7 / API8 Security configuration | fail-closed environment, route gate, role separation, fixed search path | config tests, migration pgTAP, container contract | Pass |
| ASVS V8 / API6 Sensitive business flows | idempotency, rate limits, expected versions, continuity locks | abuse, governance, support, privacy/deletion tests | Pass |
| ASVS V10 / API10 Unsafe consumption | official Clerk SDK, bounded fetch/timeout/URL checks, provider error mapping | Clerk and Storage boundary tests | Pass |
| ASVS V11/V13 / API4 Resource consumption | bounded cursors, batches, ZIP count/bytes, rate limits | unit/security/performance evidence | Pass |
| ASVS V14 / API9 Inventory | 16 owned tables, four contract functions, 45 operations, five jobs, ten events | ownership inventory, OpenAPI/event contracts | Pass |
| OWASP Top 10:2025 access-control/injection/design/logging classes | parameterized SQL, deny-by-default authorization/RLS, immutable redacted evidence | SAST/lint, pgTAP, audit/security tests, Codex Security scan | Pass |
| MASVS AUTH/STORAGE/NETWORK/PRIVACY | server remains authoritative; Mobile projection excludes raw evidence and private references | Mobile mapping contract and no-client-diff gate | Pass |

Manual source-to-sink review covered the controller, guard, service validation, repository transactions, worker claims, provider/storage adapters, all forced-RLS migrations, and runtime grants. No unresolved Critical or High issue remains.
