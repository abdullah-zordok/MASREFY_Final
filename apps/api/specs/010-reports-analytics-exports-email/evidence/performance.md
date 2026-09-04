# Performance Evidence

Date: 2026-09-04
Scope: SPEC-BE-010

- `npm run test:performance:reports`: PASS, 3 suites/8 tests against the live
  database. Twenty uncached samples measured Admin aggregate p95 at 2.094 ms
  (2.822 ms maximum) and monthly-summary p95 at 1.565 ms (3.264 ms maximum),
  below the 800 ms budgets. Category output remained SQL-bounded to 100 rows.
- `npm run test:stress:reports`: PASS, 1 suite/4 tests. A 100,000-row CSV rendered
  6,538,949 bytes in 322.37 ms across 399 chunks, with a 67.54 MiB peak heap
  delta, below the 10 s, 20 MB, and 192 MiB limits.
- The bounded worker test held maximum concurrency at one, rejected a reentrant
  run, used a batch size of ten, and drained schedule/expiry backlogs oldest
  first.
- A transient SMTP outage remained retryable and completed in under one second;
  maximum-size cache-hit p95 remained below 50 ms.
- Worker batch configuration remains bounded to 1-100, and generation, email,
  schedule, expiry, duration, byte, and backlog metrics use fixed-cardinality
  labels.
