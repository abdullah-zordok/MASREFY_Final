# Performance and stress

Local gates on 2026-09-05:

- `npm run test:performance:engagement`: 2 suites, 4 tests passed. The assertions
  enforce audience-parse P99 <50 ms, warm-cache P99 <50 ms with one load, and 1,000
  deterministic retryable provider results in <1,000 ms.
- `npm run test:stress:engagement`: 1 suite, 2 tests passed. A 100,000-user audience
  completed in fixed 500-row batches without duplication in <5,000 ms; 1,000
  concurrent cold-cache reads coalesced to one load and reloaded once after invalidation.
- `engagement-queries.sql` ran transactionally against the reset local Supabase
  database with 10,000 notifications, 5,000 tickets, 500 bilingual content items,
  1,000 profiles, and a running campaign. Notification, ticket, content, and campaign
  keyset `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` assertions each completed below
  the 50 ms database ceiling and rolled back their fixtures.

The endpoint budgets remain the contract ceilings: customer lists <=400/800 ms
P95/P99 and Admin pages <=500/1000 ms with bounded response/page budgets. Local
unit, database, and five-viewport browser gates passed; production percentiles must
still be observed from the shipped fixed-cardinality dashboard rather than invented
from a local single-user run.
