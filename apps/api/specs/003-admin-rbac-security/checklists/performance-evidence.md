# Performance evidence

Dataset: 1,000,000 generated `security_events` rows. Dataset hash: `1948ffc2289acb148d0506d995bc28fa3c9f4fb7814a425dabd1f93cceafcdfc`.

| Surface | Samples | Observed | Budget | Result |
| --- | ---: | --- | --- | --- |
| Exact permission evaluation | 500 | P95 1.870 ms; P99 2.488 ms | P95 <=25 ms | Pass |
| Owner event page | 100 | P95 2.622 ms; P99 3.623 ms | P95 <=300 ms; P99 <=600 ms | Pass |
| Owner event payload | one max page | 17,293 bytes | <=204,800 bytes | Pass |
| Privacy export acceptance | bounded request | P95 2.839 ms; P99 2.964 ms; 141 bytes | P95 <=300 ms; P99 <=600 ms; <=50 KiB | Pass |
| Deletion acceptance | bounded request | P95 0.723 ms; P99 1.097 ms; 164 bytes | P95 <=300 ms; P99 <=600 ms; <=50 KiB | Pass |
| Outbox steady claim | 5 workers; batch 50 | P95 20 ms; P99 33 ms | P95 <50 ms; P99 <100 ms | Pass |
| Outbox publication | steady/outage/recovery | P95 30 ms; P99 45 ms | P95 <500 ms; P99 <1000 ms | Pass |
| Outbox stress correctness | 75 workers | 152,700 published; 152,700/152,700 lease checks | zero claim failures; all lease checks pass | Pass |

The clean Linux database job in GitHub Actions run `33247615323` reset and linted the final schema, passed all 15 pgTAP files (394 assertions), ran the live integration/E2E suites, and retained redacted plans plus the five performance summaries. The million-row dataset hash is stable, every bounded claim plan is present, and the indexed outbox claim plan executes in under 1 ms. Artifact: `backend-b69e58493e94b1316a69fcca03837415af724c69-performance-evidence`.
