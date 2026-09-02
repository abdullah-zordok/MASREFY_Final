# Phase 06 Constitution Check

| Gate                                                                | Result                                          |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| Specification and acceptance criteria precede code                  | PASS                                            |
| Ownership limited to the four registered Phase 06 tables            | PASS                                            |
| Existing outbox/finance commands reused instead of duplicated       | PASS                                            |
| Migration is additive and generated with pinned Supabase CLI        | PASS                                            |
| Public resources use explicit grants plus FORCE RLS                 | PASS; pgTAP 024 and security suite               |
| Private definer functions use fixed path and revoked PUBLIC execute | PASS; pgTAP 024 and security suite               |
| Nontrivial behavior is red-first                                    | PASS; story evidence US1-US6                     |
| Financial invariants delegate to Phase 04/05 command paths          | PASS in design                                  |
| Logs/metrics exclude financial payload and high-cardinality labels  | PASS; observability and security suites          |
| Recovery, rollback, retention, and reconciliation are specified     | PASS                                            |
| Local and external evidence are distinguished                       | PASS                                            |
| User prohibition on push/merge/rebase/PR is retained                | PASS                                            |

No Constitution exception is approved or required.
