# Offline Sync Recovery

Use only a disposable local stack unless an incident commander explicitly authorizes a production action. Never run `db:reset`, fixture SQL, or replication-role commands against production.

## Detect

From `apps/api`, confirm the local target and inspect bounded state:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm run supabase:start
npm run test:sync:integration
npm run test:sync:security
```

Success: sync integration/security suites pass, no owner boundary fails, and readiness reports no lease older than five minutes or more than 100 recent terminal failures.

## Lease recovery

Do not rewrite a lease token. Stop the failing worker, wait for `locked_until`, and restart the worker so `private.claim_client_mutations` issues a new fence. Verify with:

```powershell
$env:MASARIFI_LIVE_DATABASE_TESTS='1'
npm run test:sync:integration -- --runTestsByPath test/integration/sync/sync-workers.integration.spec.ts
```

Success: the expired row is reclaimed, stale completion returns `SYNC_MUTATION_LEASE_LOST`, and the current lease completes once.

## Reconciliation and poison items

Inspect counts only; never log mutation payloads or financial snapshots. A rejected item remains terminal for operator review. Run the bounded worker/container checks:

```powershell
npm run test:unit -- --runTestsByPath test/unit/sync/sync.worker.spec.ts
npm run test:container -- --runTestsByPath test/container/sync-worker.container-spec.ts
```

Success: retries are deterministic/capped, max-attempt items become `rejected`, all four jobs are reachable, and shutdown waits for the active batch.

## Retention and cursor expiry

Retention is at least 30 days. `sync-state.cleanup` may remove inactive device checkpoints; outbox cleanup must preserve every event at or above an active checkpoint. An expired client cursor must receive `SYNC_CURSOR_EXPIRED` and re-bootstrap without deleting pending local mutations.

```powershell
npm run test:db
npm run test:sync:logic
npm --prefix ../mobile test -- --runInBand src/storage/sync-delta.test.ts src/storage/sync-queue.test.ts
```

Success: pgTAP retention assertions pass, cursor bounds are stable, and Mobile pending/sending rows survive recovery.

## Backup and restore rehearsal

The automated rehearsal uses a transaction and temporary backup tables on the disposable local stack:

```powershell
$env:MASARIFI_LIVE_DATABASE_TESTS='1'
npm run test:sync:recovery
```

Success: mutation queues, checkpoints, and cursor-bearing outbox rows restore exactly; checksums remain valid; the previous account query shape still works. Any schema correction is a new forward migration—never edit an applied production migration or run a down migration.

## Performance confirmation

```powershell
$env:DATABASE_URL='postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
$env:K6_DATABASE_URL='postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
npm run test:performance:sync
```

Success: retained plans use `outbox_events_sync_delta_idx` and `client_mutations_claim_idx`; delta P95 is below 500 ms, a 100-operation mutation batch P95 is below 800 ms, failures are zero, and payloads stay below 512 KiB.
