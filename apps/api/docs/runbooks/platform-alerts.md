# Platform Alerts

Platform Operations owns routing and first response. Backend on-call owns code
and query remediation. Security Engineering owns security release gates. Labels
are restricted by `platform-metrics.ts`; alerts must never add IDs, SQL, payload,
PII, tokens, or financial descriptions.

| Metric | Threshold and window | Severity / owner | Operations decision and runbook |
|---|---|---|---|
| `masarifi_process_started_total` | more than 3 starts per process kind in 10 min | warning, Platform | investigate restart loop; critical at 10; `readiness-failure.md` |
| `masarifi_http_request_duration_ms` | route P95 >250 ms or P99 >500 ms for 10 min | warning, Backend | inspect route/dependency latency; critical at 2x; platform performance evidence |
| `masarifi_database_query_duration_ms` | P95 >50 ms for 10 min | warning, Backend | inspect pool and approved EXPLAIN; critical >100 ms; `readiness-failure.md` |
| `masarifi_readiness_state` | not ready 2 min on one instance or 1 min on 25% | warning/critical, Platform | remove unhealthy instances and diagnose; `readiness-failure.md` |
| `masarifi_shutdown_duration_ms` | any drain >30 s | critical, Platform | force termination, retain leases, investigate active work; `platform-observability.md` |
| `masarifi_outbox_depth` | >10,000 for 5 min | warning, Backend | critical >50,000; diagnose/replay; `outbox-delivery-failure.md` |
| `masarifi_outbox_oldest_unpublished_age_seconds` | >300 s for 5 min | warning, Backend | critical >900 s; `outbox-delivery-failure.md` |
| `masarifi_outbox_claim_duration_ms` | P95 >=50 ms for 5 min | critical, Backend | block release or reduce load and inspect index/EXPLAIN; `outbox-delivery-failure.md` |
| `masarifi_outbox_claim_batch_size` | dashboard only; zero while depth >0 for 2 min | critical, Backend | worker/lease diagnosis; `outbox-delivery-failure.md` |
| `masarifi_outbox_active_leases` | dashboard baseline; >worker count x100 for 5 min | warning, Backend | check stuck workers and lease duration; `outbox-delivery-failure.md` |
| `masarifi_outbox_lease_expired_total` | increase >100 in 5 min | warning, Backend | critical if rising 15 min; inspect crashes/queue latency; `outbox-delivery-failure.md` |
| `masarifi_outbox_attempt_count` | P95 >=3 for 5 min | warning, Backend | inspect queue errors; critical P95 >=8; `outbox-delivery-failure.md` |
| `masarifi_outbox_publication_duration_ms` | P95 >500 ms or P99 >1 s for 5 min | warning, Backend | provider/queue latency diagnosis; `outbox-delivery-failure.md` |
| `masarifi_outbox_retry_total` | rate >5% of published for 5 min | warning, Backend | critical >20%; stop scaling and diagnose; `outbox-delivery-failure.md` |
| `masarifi_outbox_delivery_failed_total` | any increase | critical, Backend | page immediately; retain/reconcile every source row; `outbox-delivery-failure.md` |
| `masarifi_outbox_published_total` | no increase for 2 min while eligible depth >0 | critical, Backend | queue/worker outage response; `outbox-delivery-failure.md` |
| `masarifi_reference_operation_total` | errors >5% for 5 min, or any sustained ownership/permission denial anomaly | warning, Backend/Security | critical >20%; `reference-account-recovery.md` |
| `masarifi_reference_operation_duration_ms` | P95 >100 ms for data operations or >300 ms for account routes for 10 min | warning, Backend | critical at 2x; inspect approved plans and cache state; `reference-account-recovery.md` |
| `masarifi_reference_cache_total` | misses >50% for 15 min or no invalidation after a reference write | warning, Backend | bypass local cache, compare database hash, and reconcile; `reference-account-recovery.md` |
| `masarifi_reference_result_count` / `masarifi_reference_payload_bytes` | result count exceeds the route bound or account payload >150 KiB | critical, Backend | block release, inspect pagination/mass-assignment drift; `reference-account-recovery.md` |
| `masarifi_reference_fx_age_seconds` | approved configured rate age exceeds its request maximum | warning, Backend | return `FX_UNAVAILABLE`; never estimate a rate; `reference-account-recovery.md` |

Migration checksum/apply failure, secret detection, exploitable Critical/High
findings, missing SBOM/provenance/signature, root/writable image, and OpenAPI or
scope drift are immediate release blockers rather than delayed metric alerts.
Use `migration-and-recovery.md` and `security-release-gates.md`; there is no
feature-flag bypass.
