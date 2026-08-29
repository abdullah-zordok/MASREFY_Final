# Performance evidence

Dataset: 1,000,000 generated `security_events` rows. Dataset hash: `1948ffc2289acb148d0506d995bc28fa3c9f4fb7814a425dabd1f93cceafcdfc`.

| Surface | Samples | Observed | Budget | Result |
| --- | ---: | --- | --- | --- |
| Exact permission evaluation | 500 | P95 1.556 ms; P99 1.965 ms | P95 <=25 ms | Pass |
| Owner event page | 100 | P95 1.831 ms; P99 3.718 ms | P95 <=300 ms; P99 <=600 ms | Pass |
| Owner event payload | one max page | 17,293 bytes | <=204,800 bytes | Pass |
| Privacy export acceptance | bounded request | P95 0.646 ms; P99 2.181 ms; 141 bytes | P95 <=300 ms; P99 <=600 ms; <=50 KiB | Pass |
| Deletion acceptance | bounded request | P95 0.552 ms; P99 0.942 ms; 164 bytes | P95 <=300 ms; P99 <=600 ms; <=50 KiB | Pass |
| Outbox steady claim | 5 workers; batch 50 | P95 23 ms; P99 35.02 ms | P95 <50 ms; P99 <100 ms | Pass |
| Outbox publication | steady/outage/recovery | P95 30 ms; P99 46 ms | P95 <500 ms; P99 <1000 ms | Pass |
| Outbox stress correctness | 75 workers | 147,200 published; 147,200/147,200 lease checks | zero claim failures; all lease checks pass | Pass |

The clean Linux database job in release-tag GitHub Actions run `33252556673` reset and linted the final schema, passed all 15 pgTAP files (394 assertions), ran the live integration/E2E suites, and retained redacted plans plus the five performance summaries. The million-row dataset hash is stable, every bounded claim plan is present, and the indexed outbox claim plan executes in under 1 ms. Artifact: `backend-98c40a98ddc6a1df22a9d9ce89290a0ab70b72db-performance-evidence` (ID `9714957629`).
