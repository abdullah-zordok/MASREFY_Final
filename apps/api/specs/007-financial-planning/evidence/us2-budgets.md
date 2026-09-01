# US2 budget evidence

- pgTAP and live tests cover overlapping independent budgets, atomic complete allocations, category uniqueness, zero totals, copy/rollover, lifecycle, transfer exclusion, refund/reversal/reclassification, missing FX, and ownership.
- Utilization is ledger-derived once. Missing conversion produces `partial` with `missing_rate`; exact money remains bigint text at the API and sync boundaries.
- Focused unit tests passed 9/9, live tests passed 5/5, and the complete pgTAP suite passed.
