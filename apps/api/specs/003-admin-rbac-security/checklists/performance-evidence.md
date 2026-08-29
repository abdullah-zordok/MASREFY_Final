# Performance evidence

Dataset: 1,000,000 generated `security_events` rows. Dataset hash: `1948ffc2289acb148d0506d995bc28fa3c9f4fb7814a425dabd1f93cceafcdfc`.

| Surface | Samples | Observed | Budget | Result |
| --- | ---: | --- | --- | --- |
| Exact permission evaluation | 500 | P95 1.740 ms; P99 2.473 ms | P95 <=25 ms | Pass |
| Owner event page | 100 | P95 1.880 ms; P99 5.263 ms | P95 <=300 ms; P99 <=600 ms | Pass |
| Owner event payload | one max page | 17,293 bytes | <=204,800 bytes | Pass |

The runner also captures redacted JSON plans for owner events and exact permissions, verifies indexes, bounded privacy/deletion/retention claims, and writes `test/performance/artifacts/security-permission-summary.json`. Clean reset, database lint, all 15 pgTAP files (386 assertions), and the runner passed before the host WSL service became unavailable; final clean Linux CI reruns them after the last additive migrations.
