# US1 Durable Idempotency Evidence

Date: 2026-08-31

## Red first

- The initial targeted Jest run failed because `sync.service.ts` did not exist.
- The first live database run then exposed the deliberately invalid default test DSN; the
  repository-standard disposable local Supabase DSN was supplied explicitly.
- The stale-fence fixture initially violated the existing idempotency time constraint. Setting
  `locked_until=created_at` exercised expiry without weakening that constraint.

## Green verification

```text
npx jest --selectProjects unit contract e2e --runInBand --runTestsByPath
  test/unit/sync/sync-idempotency.spec.ts
  test/unit/sync/sync.handlers.spec.ts
  test/unit/sync/sync.observability.spec.ts
  test/contract/sync/mutations.contract-spec.ts
  test/e2e/sync/mutations.e2e-spec.ts
Result: 5 suites, 15 tests passed.

MASARIFI_LIVE_DATABASE_TESTS=1 DATABASE_URL=<local-disposable-supabase>
npx jest --selectProjects integration --runInBand --runTestsByPath
  test/integration/sync/mutations.integration.spec.ts
Result: 1 suite, 2 tests passed.

npm run typecheck
Result: passed.

npx eslint src/sync test/unit/sync test/contract/sync test/e2e/sync test/integration/sync
Result: passed with no findings.
```

The live checks proved one durable receipt under eight concurrent submissions, restart replay,
same-operation/different-hash rejection, partial receipt durability, lease reclamation, stale-token
completion rejection, terminal completion, and stored response replay. Existing Phase 04/05
finance services remain the only mutation effect path.
