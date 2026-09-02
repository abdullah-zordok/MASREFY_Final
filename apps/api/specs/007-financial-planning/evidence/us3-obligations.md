# US3 obligation evidence

- Schedule tests cover fixed/open/irregular plans, month-end clamping, residual installments, bounded horizons, deterministic retries, and concurrent generation.
- Overdue marking changes only eligible unpaid schedule rows. Payable and receivable summaries remain separate and owner-scoped.
- Focused unit tests passed 9/9, live tests passed 5/5, and worker integration verified schedule generation, overdue marking, reminder intent idempotency, crash reclaim, and stale fencing.
