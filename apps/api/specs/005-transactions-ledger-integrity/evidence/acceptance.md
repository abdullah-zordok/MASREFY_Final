# Phase 05 Acceptance Evidence

## US1 — Record income or expense

- Result: PASS on 2026-08-30.
- Unit: 6 suites, 100 assertions passed (DTO, service, manifest, idempotency,
  observability, stable errors).
- Integration: 2 live assertions passed against local Supabase, including exact
  replay, one header/posting/revision/projection/audit/idempotency effect, and the
  exact lifecycle plus balance-change outbox records.
- HTTP/contract: 2 suites, 4 assertions passed; authentication, mandatory key,
  strict validation, response shape, runtime route, and approved OpenAPI compose.
- Database: all 22 pgTAP files passed, including Phase 05 files 019–022; 606
  assertions total.
- Compile: `npm run typecheck` and `npm run build` passed for API, worker, and
  migration entrypoints.

The live rollback case verified a failed owner/account command leaves no claimed
idempotency row. Existing external-only identity/provider/protected-release gaps
remain listed in `dependencies.md`; none prevents this local acceptance result.

## US5 — Delete and undo

- Result: PASS on 2026-08-30 (2 live integration assertions, 1 E2E assertion,
  and runtime/static OpenAPI checks).
- Delete appended the exact inverse effect, set a database-derived deadline at
  exactly 30 seconds, and returned a zero projection without physical deletion.
- An exact retry through a newly constructed repository returned the stored
  response and did not extend the deadline.
- Restore appended the protected pre-delete effect and reconstructed `-1000`
  from postings. An artificially aged database deadline returned `UNDO_EXPIRED`
  and left the zero projection unchanged.
- A transaction with an active refund returned
  `TRANSACTION_HAS_DEPENDENTS`; stale/version and invalid body cases were
  side-effect-free.
