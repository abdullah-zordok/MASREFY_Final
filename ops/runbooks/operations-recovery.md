# Operations recovery

Run from the repository root with the local Supabase stack already started. The test process reads the local database connection from its environment but does not print it.

## Local restore and corruption drill

```powershell
$env:MASARIFI_LIVE_DATABASE_TESTS = "1"
npm --prefix apps/api run test:operations:recovery
Remove-Item Env:MASARIFI_LIVE_DATABASE_TESTS
```

The suite copies owned state into an isolated temporary relation, deletes and restores it transactionally, rejects corrupt provider rows, verifies replay/lease reconciliation, and measures the local RPO/RTO result. A failure is evidence of an unsafe recovery path; do not mark the job verified.

## Clean migration compatibility

```powershell
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run migration:checksums
npm --prefix apps/api run test:migration
```

This is a forward-correction migration policy. Do not run destructive rollback SQL against a shared environment. The N-1 compatibility test proves the prior application shape can coexist through deployment.

## Hosted evidence

Encrypted backup retention, point-in-time recovery, cross-region disaster recovery, provider-console restore identifiers, and production RPO/RTO are external and unavailable locally. The responsible platform owner must supply immutable provider evidence before any hosted-success claim; local passing tests do not substitute for it.
