# Phase 06 Verification Quickstart

Run backend commands from `apps/api` and Mobile commands from `apps/mobile`.
Never report an environment-gated check as passed; record the gate and reason.

## Prerequisites

- Node.js 24 and the committed lockfiles.
- Docker Desktop and the repository-pinned Supabase CLI 2.116.0.
- A disposable local Supabase project; never run reset/performance/recovery
  commands against production.

```powershell
npm ci
npx supabase --version
npx supabase migration new --help
```

## Fast TDD Loop

```powershell
npm run test:unit -- --testPathPatterns=sync
npm run test:contract -- --testPathPatterns=sync
npm run typecheck
```

Add each nontrivial behavior red-first. If a test fails unexpectedly, use the
systematic-debugging workflow: reproduce narrowly, trace the shared path, fix the
root cause, rerun the narrow check, then its owning suite.

## Database Gates

```powershell
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run migration:checksums
npm run test:integration -- --testPathPatterns=sync
npm run test:e2e -- --testPathPatterns=sync
```

pgTAP must prove the four-table ownership boundary, constraints/indexes,
idempotency fencing and replay, outbox cursor atomicity/immutability, RLS/grants,
worker leases/recovery, ack monotonicity, conflict policy, retention safety, and
dependency preservation. Live tests must prove concurrent duplicate submission,
stale lease completion rejection, partial batch replay, restart recovery, cursor
ordering, and delete tombstones.

## Mobile Gates

```powershell
npm run typecheck
npm test -- --runInBand
```

Run from `apps/mobile`. Prove schema v9 -> v10 upgrade without data loss, stable
operation IDs across retries/restarts, transactionally applied delta + cursor,
ID mapping without PK rewrites, tombstones, conflicts, and cursor-expiry
bootstrap that preserves pending mutations.

## Performance and Query Plans

```powershell
npm run perf:check
$env:DATABASE_URL='postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
$env:K6_DATABASE_URL=$env:DATABASE_URL
npm run test:performance:sync
```

Seed realistic per-owner outbox history and pending mutation volume. Record
`EXPLAIN (ANALYZE, BUFFERS)` for delta keyset reads, mutation claims, conflict
pages, ack lookup, and cleanup. Required budgets: delta limit 500 P95 <=500 ms,
mutation batch up to 100 P95 <=800 ms, and request/response payload <=512 KiB.
Hot bounded paths must use their intended indexes.

## Full Local Release Candidate

```powershell
npm run verify
npm run test:container
npm run test:release-image
```

Review the backend workflow and require clean reset, pgTAP, sync unit/contract/
integration/e2e/security/performance, migration checksum, Mobile upgrade, image,
scan, SBOM, and protected release evidence. External-only gates remain explicitly
open until their real environment runs them.

## Recovery Rehearsal

Against disposable populated state:

1. back up Phase 06 data including outbox sync metadata;
2. restore into an empty target and verify migration checksums;
3. expire a mutation worker lease and prove fenced reclaim/completion;
4. run reconciliation and require zero cursor gaps, orphan conflicts, or stuck
   receipt drift;
5. prove cleanup retains every cursor required by an active checkpoint;
6. run the previous application image against the additive schema;
7. correct schema defects only with a forward migration.

Close the gate only with recorded command output, zero unexplained drift, and a
clear list of any external environment/provider checks that could not run.
