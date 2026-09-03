# Recovery Evidence

Status: verified on a fresh local Supabase database.

Verified:

- Fresh `npm run db:reset`, `npm run db:lint`, and `npm run test:db` passed;
  pgTAP executed 36 files and 1,304 assertions.
- Live database integration passed 56 suites and 154 tests. Live E2E passed
  35 suites and 61 tests, including Phase 08 tracking recovery, migration
  concurrency, and backup/restore.
- Tracking recovery specifically passed its 1 suite and 3 tests under
  `MASARIFI_LIVE_DATABASE_TESTS=1`.
- The recovery fixture now inserts a processing session with an explicit expired
  claim/lease and matching private attempt, so stale-lease reclaim tests no
  longer depend on whichever session happens to be oldest.
- Parser rollback, raw purge, orphan reconciliation, session rollup, and
  idempotent retry/cancel functions are implemented in Phase 08 migrations and
  worker/repository paths.
- The recovery suite proved failed-migration rollback followed by forward fix,
  tracking-history restore, crashed-lease reclaim, parser-version rollback, and
  absence of direct ledger writes.
- pgTAP proved raw-payload retention, orphan cleanup claim/reclaim, fenced stale
  completion rejection, current-token completion, and idempotent completion.
