# US4 payment evidence

- Atomic payment/allocation tests cover partial, multiple-item, prepayment, excess rejection, stale version, duplicate transaction, currency/owner checks, concurrent terminal winner, and failure rollback.
- Reversal is compensating and reconstructs the schedule projection without changing the ledger. Match confidence is advisory; only an explicit versioned decision authorizes allocation.
- Unit tests passed 11/11, live payment/match tests passed 5/5, and reconciliation dry-run/repair passed in the worker integration suite.
- Event/sync snapshots exclude raw match evidence and keep payment/allocation money as strings.
