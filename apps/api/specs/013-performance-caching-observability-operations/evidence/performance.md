# Performance and cache evidence

Date: 2026-09-06

Evidence version: SPEC-BE-013 v1

Host: Windows 11 Pro 10.0.26200, Intel Core i7-12700H (14 cores/20 logical processors), approximately 13.45 GiB visible RAM, Node 24.16.0, npm 11.17.0, Docker Engine 29.7.2

Data: deterministic redacted local fixtures; no production data

## Phase 13 operations results

Commands:

```text
npm run perf:check:operations
npm run test:performance:operations
npm run test:stress:operations
npm run test:cache:operations
```

All commands passed. The SQL seed/EXPLAIN/cleanup cycle ran without residue, the performance Jest project passed bounded payload/cardinality/cache assertions, and k6 recorded zero failed requests.

| Profile | VUs | Requests/iterations | P50 | P95 | P99 | Maximum | Approved P95/P99 |
|---|---:|---:|---:|---:|---:|---:|---:|
| load | 5 | 2,419 | 19.678 ms | 26.438 ms | 33.020 ms | 71.519 ms | <=300 / <=750 ms |
| stress | 20 | 10,480 | 56.600 ms | 66.958 ms | 73.776 ms | 131.125 ms | <=300 / <=750 ms |

The load fixture runs the real guarded controller, `OperationsService`, `OperationsRepository`, and local PostgreSQL database. The seed contains 10,000 schedules and 10,000 provider observations. The runner also fails unless captured EXPLAIN output names the six required bounded indexes for due jobs, failed runs, provider history, incidents, feature rules, and maintenance windows.

## Cross-domain inventory

The existing applicable performance suites for implemented Specs 001-011 were executed in the same verification session:

| Domain | Commands | Result |
|---|---|---|
| platform HTTP/outbox | `test:performance`, `test:outbox:performance`, `test:stress` | PASS |
| identity/security | identity k6 syntax gates, `test:performance:security` | PASS |
| reference/accounts | `test:performance:reference` | PASS |
| ledger | `test:performance:ledger` | PASS |
| sync | `test:performance:sync` and concurrency coverage | PASS |
| planning | `test:performance:planning` | PASS |
| tracking/imports | `test:performance:tracking`, `test:stress:tracking` | PASS |
| AI/voice | `test:performance:ai`, `test:stress:ai` | PASS |
| reports/email | `test:performance:reports`, `test:stress:reports` | PASS |
| engagement | `test:performance:engagement`, `test:stress:engagement` | PASS |
| operations | operations load/stress/cache/EXPLAIN matrix above | PASS |
| billing/Stripe | not applicable: SPEC-BE-012 is deferred and no paid provider/job/metric exists | N/A |

## Cache ownership and bounds

| Cache | Owner | Bound | Invalidation proof | Sensitive/authorization use |
|---|---|---|---|---|
| safe platform metadata | `MetaService` | 32 context entries, 30-second maximum TTL, oldest-entry eviction | setting/flag/maintenance commands invalidate the API-process cache; explicit cache job is idempotent; cold/warm/invalidation tests pass | safe allowlisted projection only; never authorizes and never supplies financial truth |
| reference projections | reference service | existing bounded process cache | reference cold/warm and mutation invalidation performance tests pass | reference values only |
| report/Home summaries | owning domain services | existing domain bounds | existing domain performance/contract gates pass | no authorization decision |

No Redis or other shared-cache dependency was added. Multi-process convergence is bounded by the safe 30-second TTL; immediate invalidation is process-local. That is the approved Free-only design and is not represented as distributed coherence.

Generated JSON and EXPLAIN artifacts under `apps/api/test/performance/artifacts/` are reproducible test output. Only the intentional tracked summary needed by an existing test is retained; ephemeral generated artifacts are not release claims.
