# US4 Evidence — Duplicate Detection

Status: implemented with deterministic scoring, explanations, and idempotent
decisions.

Evidence:

- Duplicate candidates are owner-local, unique per item/transaction pair, scored
  with bounded versioned reasons, and exposed through safe list/detail DTOs.
- Decisions support `keep_existing`, `keep_new`, `keep_both`, and
  `merge_details` through optimistic/idempotent service methods.
- Duplicate decisions either link an existing owned transaction or use the
  existing ledger command path; they never perform direct ledger table writes.
- Stress/performance evidence shows duplicate reads remain bounded:
  - normal duplicate P99 8.58 ms;
  - stress duplicate P99 9.15 ms.

Acceptance mapping: FR-022, FR-023, FR-024, FR-026, FR-029, FR-031, FR-032,
AC-007, AC-008, AC-009, AC-011, AC-013.
