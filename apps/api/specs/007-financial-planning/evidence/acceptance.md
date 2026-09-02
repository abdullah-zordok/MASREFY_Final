# Phase 07 Acceptance Matrix

`PASS` means the requirement has retained local evidence. Remote-only publication
gates are deliberately `PENDING` and are accepted only as correctly accounted
for under SC-015.

## Functional requirements

| Requirement | Status | Retained evidence |
|---|---|---|
| FR-001 | PASS | [Foundations](foundations.md), [local feature gates](local-feature-gates.md) |
| FR-002 | PASS | [Foundations](foundations.md), [security review](code-review.md) |
| FR-003 | PASS | [Dependencies](dependencies.md), [client contracts](client-contracts.md) |
| FR-004 | PASS | [Dependencies](dependencies.md), [payment evidence](us4-payments.md) |
| FR-005 | PASS | [Dependencies](dependencies.md), [security review](code-review.md) |
| FR-006 | PASS | [Salary evidence](us1-salary.md) |
| FR-007 | PASS | [Salary evidence](us1-salary.md) |
| FR-008 | PASS | [Salary evidence](us1-salary.md) |
| FR-009 | PASS | [Salary evidence](us1-salary.md) |
| FR-010 | PASS | [Salary evidence](us1-salary.md) |
| FR-011 | PASS | [Salary evidence](us1-salary.md) |
| FR-012 | PASS | [Budget evidence](us2-budgets.md) |
| FR-013 | PASS | [Budget evidence](us2-budgets.md) |
| FR-014 | PASS | [Budget evidence](us2-budgets.md) |
| FR-015 | PASS | [Budget evidence](us2-budgets.md) |
| FR-016 | PASS | [Budget evidence](us2-budgets.md) |
| FR-017 | PASS | [Budget evidence](us2-budgets.md) |
| FR-018 | PASS | [Budget evidence](us2-budgets.md) |
| FR-019 | PASS | [Budget evidence](us2-budgets.md), [performance gates](local-feature-gates.md) |
| FR-020 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-021 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-022 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-023 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-024 | PASS | [Obligation evidence](us3-obligations.md), [recovery](recovery.md) |
| FR-025 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-026 | PASS | [Obligation evidence](us3-obligations.md) |
| FR-027 | PASS | [Operations evidence](us6-operations.md), [recovery](recovery.md) |
| FR-028 | PASS | [Obligation evidence](us3-obligations.md), [performance gates](local-feature-gates.md) |
| FR-029 | PASS | [Payment evidence](us4-payments.md) |
| FR-030 | PASS | [Payment evidence](us4-payments.md) |
| FR-031 | PASS | [Payment evidence](us4-payments.md) |
| FR-032 | PASS | [Payment evidence](us4-payments.md) |
| FR-033 | PASS | [Payment evidence](us4-payments.md) |
| FR-034 | PASS | [Payment evidence](us4-payments.md) |
| FR-035 | PASS | [Payment evidence](us4-payments.md) |
| FR-036 | PASS | [Payment evidence](us4-payments.md), [security review](code-review.md) |
| FR-037 | PASS | [Payment evidence](us4-payments.md), [clean-code review](clean-code-review.md) |
| FR-038 | PASS | [Payment evidence](us4-payments.md), [client contracts](client-contracts.md) |
| FR-039 | PASS | [Savings evidence](us5-savings.md) |
| FR-040 | PASS | [Savings evidence](us5-savings.md) |
| FR-041 | PASS | [Savings evidence](us5-savings.md) |
| FR-042 | PASS | [Savings evidence](us5-savings.md) |
| FR-043 | PASS | [Savings evidence](us5-savings.md) |
| FR-044 | PASS | [Savings evidence](us5-savings.md) |
| FR-045 | PASS | [Operations evidence](us6-operations.md), [performance gates](local-feature-gates.md) |
| FR-046 | PASS | [Recovery](recovery.md), [convergence](convergence.md) |
| FR-047 | PASS | [Operations evidence](us6-operations.md), [convergence](convergence.md) |
| FR-048 | PASS | [Client contracts](client-contracts.md), [security review](code-review.md) |
| FR-049 | PASS | [Client contracts](client-contracts.md), [local release](local-release.md) |
| FR-050 | PASS | [Client contracts](client-contracts.md), [convergence](convergence.md) |
| FR-051 | PASS | [Operations evidence](us6-operations.md) |
| FR-052 | PASS | [Operations evidence](us6-operations.md), [local feature gates](local-feature-gates.md) |
| FR-053 | PASS | [Recovery](recovery.md) |
| FR-054 | PASS | [Convergence](convergence.md), [local release](local-release.md) |
| FR-055 | PASS | [Local feature gates](local-feature-gates.md), [local release](local-release.md), [recovery](recovery.md) |
| FR-056 | PASS | [Baseline scope guard](baseline.md), [convergence](convergence.md), [Definition of Done](definition-of-done.md) |

## Acceptance scenarios

| Scenario | Status | Retained evidence |
|---|---|---|
| US1-AC1 month-end salary clamp | PASS | [Salary evidence](us1-salary.md) |
| US1-AC2 exact owned income link | PASS | [Salary evidence](us1-salary.md) |
| US1-AC3 unsafe/ambiguous link rejection | PASS | [Salary evidence](us1-salary.md) |
| US2-AC1 atomic complete allocation replacement | PASS | [Budget evidence](us2-budgets.md) |
| US2-AC2 over-allocation/cross-owner rollback | PASS | [Budget evidence](us2-budgets.md) |
| US2-AC3 overlapping budgets remain independent | PASS | [Budget evidence](us2-budgets.md) |
| US3-AC1 idempotent schedule generation | PASS | [Obligation evidence](us3-obligations.md) |
| US3-AC2 deterministic dates/residuals/stops | PASS | [Obligation evidence](us3-obligations.md) |
| US3-AC3 API and RLS cross-owner denial | PASS | [Obligation evidence](us3-obligations.md), [security review](code-review.md) |
| US4-AC1 atomic exact payment allocation | PASS | [Payment evidence](us4-payments.md) |
| US4-AC2 invalid payment attempts have no partial effect | PASS | [Payment evidence](us4-payments.md) |
| US4-AC3 explicit terminal match decision | PASS | [Payment evidence](us4-payments.md) |
| US5-AC1 ledger-backed signed movement | PASS | [Savings evidence](us5-savings.md) |
| US5-AC2 invalid/overdrawn movement rejection | PASS | [Savings evidence](us5-savings.md) |
| US5-AC3 idempotent lifecycle reconciliation | PASS | [Savings evidence](us5-savings.md), [recovery](recovery.md) |
| US6-AC1 bounded aggregate response | PASS | [Operations evidence](us6-operations.md), [performance gates](local-feature-gates.md) |
| US6-AC2 versioned invalidation prevents stale output | PASS | [Operations evidence](us6-operations.md) |
| US6-AC3 bounded retry/crash recovery | PASS | [Recovery](recovery.md), [convergence](convergence.md) |

## Success criteria

| Criterion | Status | Retained evidence |
|---|---|---|
| SC-001 | PASS | [Foundations](foundations.md), [local feature gates](local-feature-gates.md) |
| SC-002 | PASS | [Salary evidence](us1-salary.md) |
| SC-003 | PASS | [Budget evidence](us2-budgets.md) |
| SC-004 | PASS | [Obligation evidence](us3-obligations.md) |
| SC-005 | PASS | [Payment evidence](us4-payments.md) |
| SC-006 | PASS | [Payment evidence](us4-payments.md) |
| SC-007 | PASS | [Savings evidence](us5-savings.md) |
| SC-008 | PASS | [Performance gates](local-feature-gates.md): P95 14 ms, P99 22.93 ms, max 22,970 bytes |
| SC-009 | PASS | [Performance gates](local-feature-gates.md) |
| SC-010 | PASS | [Recovery](recovery.md) |
| SC-011 | PASS | [Client contracts](client-contracts.md), [convergence](convergence.md), [local release](local-release.md) |
| SC-012 | PASS | [Recovery](recovery.md) |
| SC-013 | PASS | [Local release](local-release.md), [recovery](recovery.md), [security review](code-review.md) |
| SC-014 | PASS | [Security review](code-review.md), [local feature gates](local-feature-gates.md) |
| SC-015 | PASS | [Remote gate accounting](remote.md): all prohibited external gates are explicit PENDING |

## Result

All 56 functional requirements, 18 acceptance scenarios, and 15 success
criteria have retained local evidence. No external-only gate is represented as
passing.
