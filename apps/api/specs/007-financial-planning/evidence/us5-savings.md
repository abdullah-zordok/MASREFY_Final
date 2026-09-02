# US5 savings evidence

- Tests cover target/lifecycle/account validation, signed contribution/withdrawal/adjustment, exact derived progress, overdraft denial, duplicate/replay, ownership/currency isolation, concurrent reversal, and target-below-progress decision.
- Savings history is append-only; reversal adds an opposite movement and reconciliation derives progress from opening value plus immutable movements.
- Focused results: pgTAP 75/75, unit 9/9, contract green, and live integration 4/4.
- Phase 06 planning sync handles goal upsert/delete tombstones and movement/reversal upserts without numeric rounding.
