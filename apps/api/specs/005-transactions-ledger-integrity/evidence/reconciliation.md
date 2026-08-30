# Phase 05 Reconciliation Evidence

On 2026-08-30 a disposable live PostgreSQL fixture contained one exact account,
one confirmed projection mismatch, and one pending projection mismatch. The
worker repository scanned by ascending account UUID with explicit predecessor
and continuation cursors, returned no more than the requested batch, and
classified all three cases exactly. The mismatched projection row was byte-for-
byte unchanged after the scan; only exact matches are eligible for a
`reconciled_at` timestamp. No repair method exists on the worker repository.

Two reports for the same account, ledger version, and mismatch kind produced one
outbox incident under an advisory lock. Its payload contained only `accountId`,
`mismatchKind`, `ledgerVersion`, `observedAt`, and `requestId`; no amount,
projection, title, merchant, note, token, or hash was present. Unit tests proved
a failed batch retains its cursor for retry/restart, batch size defaults to 100
and rejects values above 500, mismatch metrics use fixed labels, and shutdown
waits for the active batch. The Nest worker container registered without an HTTP
listener and invoked `stop()` during close.

```text
npx jest --selectProjects unit integration container --runInBand --runTestsByPath test/unit/ledger/ledger.worker.spec.ts test/unit/ledger/ledger.observability.spec.ts test/integration/ledger/reconciliation.integration.spec.ts test/container/ledger-worker.container-spec.ts
Result: 4 suites passed, 17 tests passed

npm run typecheck
Result: passed
```

Operational containment, write-disable, protected investigation, forward-only
correction, cursor restart, and explicit closure are retained in
`docs/runbooks/ledger-reconciliation-recovery.md`.
