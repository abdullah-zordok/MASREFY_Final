# Clerk Webhook and Device Recovery

Owner: Backend on-call. Security on-call joins for signature replay, leaked-key, or cross-user evidence.

## Alerts and thresholds

- Critical: any accepted invalid signature/replay, cross-owner row, plaintext push token, or disabled local revocation.
- High: oldest unprocessed webhook over 5 minutes, exhausted processing attempts, retention payload older than 8 days, or revoked device session link retained over 15 minutes.
- Warning: provider errors over 5% for 10 minutes or webhook backlog over 1,000 rows.

Use only bounded counts, ages, status, attempt number, safe reason code, and hashes. Never copy a webhook body/header, Clerk subject/session, contact value, fingerprint, token/hash/ciphertext, database URL, or secret into logs or tickets.

## Triage

1. Stop webhook/worker deployment changes; keep the API fail-closed.
2. Check process health, bounded identity metrics, provider status, and the latest deployment revision.
3. Query only aggregate inbox counts by `status`, oldest `created_at`, maximum `attempt_count`, old unredacted count, and revoked-device link count. Run queries through the approved migration/operations channel; do not select `payload`, identity IDs, session IDs, or push columns.
4. If signature validation is suspect, disable the endpoint at the edge, rotate the Clerk webhook signing secret in Clerk and the API secret store, restart only the API, and send a new provider test delivery.

## Recovery

- Provider outage: restore Clerk access, let bounded retries resume, then run provider-page and local-subject reconciliation until both return zero drift.
- Lost/out-of-order delivery: run the same reconciliation path; it reads current Clerk state and never replays stale contact data.
- Exhausted inbox row: repair the provider/database cause, reset only the selected row to `failed` with a safe code and bounded attempt under an approved incident change, then process it normally.
- Worker crash: restart the worker. Transaction-scoped claims roll back; no `processing` row should remain committed.
- Linked session: keep local device/push revocation intact, restore Clerk, run `retryRevokedSession`, and confirm the aggregate retained-link count reaches zero.
- Push key rotation: prepend one new encryption key, keep at most two required old decrypt-only keys, deploy API and worker together, rotate registrations naturally, then remove the old key only after ciphertext inventory proves it unused. Rotate the separate HMAC key only with an approved token re-registration plan.
- Retention: process/reconcile nonterminal old rows first; redact only terminal payloads older than seven complete days.

## Closure evidence

Record deployment revision, incident window, safe aggregate before/after counts, bounded metric recovery, reconciliation checkpoint hashes, successful signature fixture result, retained-link count zero, retention compliance, and test command references. Escalate until no Critical/High condition remains.
