# Phase 05 Ledger Authorization And Client Evidence

On 2026-08-30 the live security matrix proved that an active customer can read
their own transaction detail and a different active customer receives the same
`NOT_FOUND` response as an absent row. Direct SQL reads by `anon`,
`authenticated`, and `masarifi_worker` failed with PostgreSQL `42501`.

Assigned Admin principals for every fixed system role—`super-admin`,
`support-agent`, `billing-operator`, `import-operator`, `ai-operator`,
`content-manager`, and `security-administrator`—all received owner-safe
`NOT_FOUND`; no raw financial permission or support scope was added. Forced RLS
and the Phase 05 grants remain the database authority, while the Admin contract
continues to expose only `transactionsCount`.

The owner read suite also proved bounded `(occurred_at DESC,id DESC)` keyset
pages without duplicate boundary rows, native token-prefix search, account
projection/version mapping, and at most four database statements for a 100-row
page. HTTP list/detail/summary and stable errors passed. The compatibility test
proved no diff under `apps/mobile` or `apps/admin-web`; all sync/delta/conflict/
offline mutation behavior remains SPEC-BE-006.

```text
npx jest --selectProjects unit integration security e2e contract --runInBand --runTestsByPath test/unit/ledger/ledger.dto.spec.ts test/integration/ledger/ledger-read.integration.spec.ts test/security/ledger/ownership-boundary.spec.ts test/e2e/ledger/ledger-read.e2e-spec.ts test/contract/ledger/client-mapping.contract-spec.ts
Result: 5 suites passed, 75 tests passed
```
