# US3 — Delta and Ack Evidence

- Live `npm run test:sync:integration`: 5 suites, 11 tests passed.
- The delta fixture creates 502 owner events plus a foreign-owner event. The first keyset read returns the 500-item page plus one look-ahead row; resume after cursor 500 returns exactly 501 and 502 with no gap.
- Acknowledging 502 then acknowledging 1 leaves the durable checkpoint at 502.
- Mobile `sync-delta.test.ts`: cursor persistence happens after every local apply in the same exclusive transaction; an apply failure writes no cursor.
- Clean query-plan workload retained `test/performance/artifacts/sync-plans.txt` and used `outbox_events_sync_delta_idx` and `client_mutations_claim_idx`.
- Final `npm run test:performance:sync`: PASS against 100,000 resources. Delta P95 67 ms; 100-operation mutation P95 39 ms; maximum sync payload 159,531 bytes, below 512 KiB; 1,081 checks passed with zero failures.
- A single change that cannot fit the response budget now returns `SYNC_PAYLOAD_TOO_LARGE` instead of an empty non-progressing page.

Result: PASS for ordered owner/domain keyset resume, monotonic ack, payload bounds, and apply-before-cursor behavior.
