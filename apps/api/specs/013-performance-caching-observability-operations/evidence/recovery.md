# Recovery evidence

Date: 2026-09-06

Profile: local Supabase/PostgreSQL containers and redacted fixtures

## Locally executed proof

The following command ran with `MASARIFI_LIVE_DATABASE_TESTS=1` and the local Supabase database URL so the database-backed test was active rather than skipped:

```text
npm run db:reset
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$env:MASARIFI_LIVE_DATABASE_TESTS='1'
npm run test:operations:recovery
```

Result: 3 suites passed, 3 tests passed, 0 skipped.

The proof:

- applies every ordered migration through `20260906130000_phase13_operations.sql`;
- creates an independent SQL dump with the Supabase CLI, deletes the owned provider-health data, and restores it through PostgreSQL `psql`;
- verifies the restored value and forced RLS;
- rejects a corrupt provider row through the real database constraint;
- measures restored-row age for local RPO instead of using a constant;
- measures elapsed local restore time for RTO;
- verifies the Phase 13 migration is additive and forward-correctable rather than destructive;
- replays one durable fixed-registry job claim without duplicate completion.

An actual N-1 image was also built from base commit `ddec10683e88a3fd5e471f1d627e5ed3676a14f3` and started against the upgraded Phase 13 database. Docker reported the image healthy and `GET /health/live` returned HTTP 200. N-1 image ID: `sha256:3476c9212a85e8f87dd2c5b189bb9135e48748f0b5a4aea4970ac2529294a80d`.

The measured local scenario remained within RPO <=900 seconds and RTO <=7,200 seconds. Full `npm run test:migration`, `npm run test:e2e`, migration checksum, database lint, pgTAP, worker recovery, ledger/sync reconciliation, and release-image tests also passed in the verification matrix.

## Evidence classification

| Scope | Status | Evidence |
|---|---|---|
| migration application/checksum | local pass | clean reset, migration Jest tests, checksum verification |
| isolated Phase 13 state restore/corruption rejection | local pass | active live-database recovery suite |
| RLS/application compatibility | local pass | restored object plus forced-RLS assertions and full API gates |
| worker replay/reconciliation | local pass | operations recovery plus existing ledger/sync/domain suites |
| N-1/forward correction | local pass | additive migration test plus actual prior-commit image healthy against the upgraded database |
| encrypted hosted database/Storage backups | external/manual required | requires hosted provider console and immutable evidence |
| hosted PITR status/retention | external/manual required | requires hosted provider access |
| cross-region disaster-recovery rehearsal | external/manual required | requires infrastructure, credential rotation, traffic control, and provider evidence |

No hosted backup, PITR, or full-DR success is claimed. Admin APIs expose metadata/status only and provide no backup-content download or restore-command surface.
