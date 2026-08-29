# Performance Evidence

Recorded 2026-08-29 with
`DATABASE_URL=<local Supabase> npm run test:performance:reference`.

The runner loaded a rolled-back, two-tenant fixture of 100,000 categories and
100,000 accounts. Fixture-only triggers were disabled during bulk loading; all
production triggers are independently covered by pgTAP and live integration
tests. Measured reads used the normal schema and indexes.

| Measurement | Result | Budget |
| --- | ---: | ---: |
| Category SQL P95 | 1.81 ms | <=100 ms |
| Account SQL P95 | 2.06 ms | <=100 ms |
| HTTP cold | 27.05 ms | observational |
| HTTP warm P95 | 1.17 ms | <=300 ms |
| HTTP warm P99 | 1.66 ms | <=600 ms |
| Payload | 53 bytes | <=153,600 bytes |

- `ownerPlansIndexed` is `true`: the retained plans use
  `categories_user_kind_active_sort_idx` and `accounts_user_currency_idx` with no
  active owner-table sequential scan.
- Every one of 102 HTTP requests performed the bounded canonical hash/version
  check. The warm cache served the collection, a digest change invalidated it,
  and the repository was reread exactly once after invalidation.
- The generated redacted plan artifact is
  `test/performance/artifacts/reference-summary.json`; it records `passed: true`
  and contains no user content, notes, last four, or raw exchange-rate values.
