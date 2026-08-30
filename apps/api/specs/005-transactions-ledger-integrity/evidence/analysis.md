# Phase 05 Cross-Artifact Analysis

Date: 2026-08-30 (Asia/Riyadh)
Scope: Constitution, Backend Master Plan, `spec.md`, `plan.md`, `tasks.md`,
`data-model.md`, contracts, implementation, tests, operations, and release gates.

The repository does not contain SpecKit's optional
`.specify/scripts/powershell/check-prerequisites.ps1`; feature context was instead
derived from `.specify/feature.json` and every required artifact was read
directly. This did not prevent consistency analysis.

## Coverage

| Measure | Result |
|---|---:|
| Functional requirements mapped to tasks | 23 / 23 |
| Success criteria mapped to tasks | 7 / 7 |
| Acceptance criteria retained | 15 / 15 |
| Tasks with a requirement, verification, evidence, or release mapping | 111 / 111 |
| Unmapped buildable requirements | 0 |
| Open Critical/High product inconsistencies | 0 |

## Findings and resolution

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| A-001 | Critical governance | Constitution 2.0.0 normally requires main-only work and forbids worktrees, while the user's controlling instruction explicitly required an isolated worktree when the existing checkout was not isolated and authorized branch/release operations. | Recorded as an explicit process exception. Work was completed on `codex/spec-be-005`; the primary dirty checkout remained untouched; T109 fast-forwarded synchronized `main` without rewriting history. No product/security requirement was weakened. |
| A-002 | High | Master Plan/spec event taxonomy included `transfer.created`, refund/reversal-specific events, `balance.changed`, and `ledger.reconciliation_failed`; the implementation initially used generic or mismatched names and omitted `balance.changed`. | Added strict redacted schemas and repository emission for every named event. Each balance-touching command now atomically emits one lifecycle event plus one sorted aggregate `balance.changed`; replay duplicates neither. Focused unit and five live integration suites pass. |
| A-003 | Medium | Event contract metric names used seconds while the implementation and observability contract use milliseconds. | Synchronized the contract to `ledger_command_duration_ms` and `ledger_reconciliation_duration_ms`. |
| A-004 | High | Reconciliation was bounded by batch size but lacked the required database statement timeout. | Worker transactions now set a local 2-second `statement_timeout` before adopting the minimum worker role; a repository unit test fixes the ordering and value. |
| A-005 | High | Performance evidence covered list/search/detail/writes/reconciliation but not the required account-balance summary path. | Added an account-summary k6 scenario, payload bound, threshold, and retained `EXPLAIN` plan. The final 100k-header run passed at P95 6 ms with a 12,822-byte maximum payload. |
| A-006 | High | The OpenAPI/internal contract required stale-write errors to disclose the current server version, but service and database conflict mappings returned only `VERSION_CONFLICT`. | Added a sanitized optional `currentVersion` field, populated it from service prechecks and PostgreSQL exception detail on all five expected-version commands, and proved both paths with red-first unit/E2E plus live concurrent integration tests. |
| A-007 | Critical | Independent review found that an active customer promoted to Admin could retain ledger access through the policy's Admin test. | Added an explicit, minimum-grant `ledger_actor_is_admin` predicate and qualified policy correlations. Promoted-Admin read and idempotency replay are denied while ordinary-customer behavior with unrelated Admin rows remains intact. |
| A-008 | Critical | Completed idempotency replay occurred after version, rate, recent-auth, and business prechecks. | Added non-mutating lookup and moved completed replay before all business gates for all eight writes; fresh claims still execute every gate and database invariant. |
| A-009 | Critical | Refund delete/restore could exceed the original refund cap. | Prohibited deleting compensating/dependent rows and retained immutable history; the exact exploit is a live atomic regression. |
| A-010 | High | Historical posting account IDs leaked into current summaries and exceeded the event bound after repeated account revisions. | Current IDs derive from grouped nonzero effects; mutation responses/events use command-touched projections. A four-account revision sequence passes. |
| A-011 | High | Opening-entry hashing depended on JSON property insertion order. | Canonical recursive object-key ordering now precedes SHA-256; reordered nested objects hash identically. |
| A-012 | High | Database projection overflow mapped to a generic ledger/validation error. | Numeric and named balance-range errors now map to `AMOUNT_OUT_OF_RANGE`; live cumulative overflow proves complete rollback. |
| A-013 | High | Mobile mapping evidence did not execute `currency -> currencyCode` or nullable/status transformations. | Synchronized terminology and added an executable representative OpenAPI-to-Mobile mapping contract with no client cutover. |
| A-014 | Medium | Dashboard replay grouping used an absent label. | Group by the emitted low-cardinality `scope` label. |
| A-015 | High operations | The initial metric surface did not evidence all requested read, lock, posting, projection, reconciliation-age, retry, and append-failure signals. | Reused the platform metrics registry to add fixed-cardinality observations and executable docs tests; no IDs or amounts are labels. |

## Consistency conclusion

The specification, plan, tasks, data model, API/event contracts, migrations,
implementation, tests, and runbooks agree on Phase 05 ownership and behavior.
The only SPEC-BE-006 work is the explicitly authorized forward-compatible
idempotency bridge. No later-Spec or client feature is planned or implemented.

Previously documented SPEC-BE-002 protected-identity, provider, hosted-schema,
and protected release-evidence gaps remain explicit external-only gaps. They do
not block local Phase 05 implementation and are never counted as passes.
