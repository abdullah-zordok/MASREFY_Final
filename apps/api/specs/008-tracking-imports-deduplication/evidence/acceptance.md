# Acceptance Evidence Map

Counts:

- Functional requirements: 40/40 mapped to implementation and tests.
- Acceptance criteria: 20/20 passed or evidenced; genuinely external provider and
  tag-release proofs are listed separately and are not implementation blockers.
- Success criteria: 10/10 passed or evidenced.

## Requirement traceability

| Requirements  | Implementation and passing evidence                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001–FR-003 | `us1-tracking-controls.md`; preference/rule DTO, service, RLS, pgTAP, unit, contract, integration, Mobile tests                      |
| FR-004–FR-016 | `us2-imports.md` and `us5-parsers.md`; intake/storage/parser/corpus/unsupported unit, security, integration, E2E, pgTAP, performance |
| FR-017–FR-021 | `us3-review.md`; edited acceptance, revalidation, replay/concurrency, and ledger-boundary tests                                      |
| FR-022–FR-023 | `us4-duplicates.md`; deterministic explanation and optimistic/idempotent decision tests                                              |
| FR-024–FR-034 | `us6-operations.md`; history, feedback, permissions, workers, events, retention, purge, reconciliation, recovery tests               |
| FR-035–FR-036 | `client-contracts.md`; Mobile/Admin production-adapter, fixture-boundary, component, and Playwright tests                            |
| FR-037–FR-039 | `local-feature-gates.md`, `local-release.md`, `recovery.md`, and observability/runbook artifacts                                     |
| FR-040        | `final-audit.md`; scoped diff contains no SPEC-BE-009+ implementation                                                                |

| Success criterion | Passing evidence                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| SC-001            | accepted-item history/audit/outbox/ledger trace tests                                     |
| SC-002            | replay, retry, crash, concurrent-decision, duplicate, and fenced-lease tests              |
| SC-003            | parser corpus, immutable version, publish, and rollback tests                             |
| SC-004            | hostile corpus, payload/file validation, quarantine, and security tests                   |
| SC-005            | owner intake/review/duplicate/feedback API, Mobile, and Admin tests                       |
| SC-006            | tracking/outbox normal, stress, 10k CSV, index-plan, memory, and error artifacts          |
| SC-007            | pgTAP RLS/grants plus API ownership/permission/stale-version/ledger-boundary tests        |
| SC-008            | raw retention/purge fencing, orphan reconciliation, history retention, and recovery tests |
| SC-009            | Mobile and Admin production adapter/contract/fixture-boundary validation                  |
| SC-010            | all local gates and pushed-main workflow `33744378707` pass                               |

## Surface traceability

- All 19 owned tables are covered by the migration/data-model and pgTAP
  structure/RLS/command/job suites: `financial_institutions`,
  `institution_senders`, `parser_rules`, `parser_rule_versions`,
  `parser_test_cases`, `merchant_rules`, `category_rules`,
  `tracking_preferences`, `user_keyword_rules`, `user_sender_rules`,
  `import_sessions`, `import_items`, `import_attempts`,
  `raw_ingestion_payloads`, `unsupported_formats`, `review_items`,
  `duplicate_candidates`, `tracking_history`, and `tracking_feedback`.
- All 56 OpenAPI paths and 72 unique operations parse and pass contract/runtime
  drift tests; owner/Admin permissions and bounded request/response schemas are
  asserted by contract, unit, integration, and E2E suites.
- All 13 safe outbox event types and all 7 worker job kinds in
  `contracts/events-jobs.md` are mapped to repository/service/worker tests,
  outbox tests, metrics, alerts, and the operational runbook.
- Every Mobile automatic-tracking and Admin imports/parsers production flow in
  `contracts/mobile-admin-mapping.md` is mapped to adapter tests plus the green
  Mobile full suite and Phase 08 Admin component/Playwright gates.

| Acceptance | Status                            | Evidence                                                                                     |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| AC-001     | Passed locally                    | Fresh Supabase reset plus 36-file/1,304-assertion pgTAP passed.                              |
| AC-002     | Passed locally                    | Fresh RLS/grant pgTAP and API security suites passed.                                        |
| AC-003     | Passed locally                    | Tracking intake P99 27 ms normal and 31 ms stress, both with zero errors.                    |
| AC-004     | Passed locally                    | Parser/security unit and contract coverage in API verify; hostile fixture corpus.            |
| AC-005     | Passed locally                    | Parser corpus tests and Admin parser stewardship gates.                                      |
| AC-006     | Passed locally                    | Rule precedence tests and parser/duplicate deterministic evidence.                           |
| AC-007     | Passed locally                    | Duplicate unit/integration/performance evidence.                                             |
| AC-008     | Passed locally                    | Review/duplicate/retry replay and concurrency tests.                                         |
| AC-009     | Passed locally                    | Ledger boundary scan and `tracking-ledger-boundary.spec.ts`.                                 |
| AC-010     | Passed locally                    | Review edit allowlist tests and service validation.                                          |
| AC-011     | Passed locally                    | History/feedback/privacy tests and evidence.                                                 |
| AC-012     | Passed locally                    | Worker claim/retry/shutdown tests and outbox/tracking stress summaries.                      |
| AC-013     | Passed locally                    | Tracking and Outbox performance artifacts under `test/performance/artifacts/`.               |
| AC-014     | Passed locally                    | Fresh live E2E passed rollback/forward, recovery, migration concurrency, and backup/restore. |
| AC-015     | Passed locally                    | OpenAPI parses after formatting; contract drift tests in API verify.                         |
| AC-016     | Passed locally                    | Mobile full gates and Phase 08 Admin imports/parsers/accessibility Playwright passed.        |
| AC-017     | Passed locally                    | `ops/observability/` and `docs/runbooks/tracking-imports.md`.                                |
| AC-018     | Passed                            | Every Phase 08 local gate and pushed-main workflow `33744378707` passed.                     |
| AC-019     | Passed locally with external gaps | SPEC-BE-001..007 dependencies evidenced; provider/account proofs remain external.            |
| AC-020     | Passed                            | Spec09+ scope scan passes; scoped commits were pushed and CI completed successfully.         |
