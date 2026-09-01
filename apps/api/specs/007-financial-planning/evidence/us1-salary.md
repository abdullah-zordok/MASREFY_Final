# US1 salary evidence

- pgTAP covers monthly day 31, leap year, weekly, biweekly, custom interval, horizon, and idempotent generation.
- Unit/contract/live tests cover allowlisted exact-money profiles, owned account/currency checks, deterministic receipts, confirmed-income link, correction, undo, replay, stale version, concurrency, and cross-owner denial.
- Planning outbox snapshots use the Phase 06 `planning` cursor; archive produces a tombstone. The live sync test preserves `9007199254740991` as a string and observes cursors 1 then 2.
- Fresh database result: `supabase test db` passed all 1010 assertions.
