# Tracking and import operations

This runbook covers SPEC-BE-008. Never inspect or copy raw payloads into logs,
tickets, metrics, or chat. Use IDs, bounded reason codes, aggregate counts, and
the audited Admin projections only.

## Hostile or unsupported input

Confirm the API returned `UNSAFE_IMPORT` or `VALIDATION_FAILED`, the unsupported
record contains only its fingerprint and reason code, and no Storage reference
was created. Do not rename or convert the customer file server-side. Ask for the
documented normalized JSON or UTF-8 CSV format.

## Import backlog and stuck workers

1. Stop only the tracking worker cleanly and let its active batch finish.
2. Inspect aggregate counts from `private.tracking_operational_metrics()` under
   the worker role. Do not select payload columns.
3. A `processing` session is reclaimable only after `lease_until`; restart the
   worker and confirm the next claim has a new token and attempt number.
4. A stale completion must fail with `IMPORT_LEASE_STALE`. Never clear a live
   claim token manually.
5. For a terminal failed session, use the MFA- and reason-protected Admin retry
   endpoint with its current version. Reuse the same idempotency key only for an
   identical retry request.

## Raw retention and Storage outage

Missing objects are successful idempotent deletes. A purge claim moves the row to
`purging` with a five-minute lease and fence token. On a Storage outage, an expired
lease is reclaimed with a new token; only its matching completion can mark the row
`purged`. If object registration fails after upload, the API performs a
compensating delete and durably queues any failed cleanup; investigate repeated
failures as a Storage incident, using only opaque object IDs.

## Parser regression and rollback

Disable the affected parser rule for new claims, add a fictional corpus case that
reproduces the failure, and publish only after every enabled case passes. Roll
back by activating a previously published immutable version through the Admin
endpoint with recent MFA, reason, expected rule version, and idempotency key.
In-flight items retain their selected version.

## Review and duplicate backlogs

Review and duplicate decisions are owner actions. Admin projections may diagnose
redacted state but must not impersonate the owner or write ledger rows. Confirm
that acceptance uses `LedgerService`, the stable `import:<session>:item:<item>`
external reference, and one SPEC-BE-006 idempotency claim.

## Reconciliation and correction

Run the bounded reconciliation worker until session counters converge. It may
repair reconstructable counts and stale attempts; it must never create a second
transaction. Duplicate corrections use the owner duplicate decision and existing
ledger revise/create commands. Escalate any direct Phase 08 ledger table write.

## Migration, restore, and emergency disable

Apply the ordered tables, functions, and access/seed migrations after a verified
backup. Run reset, database lint, pgTAP, migration inventory, rollback/forward,
and backup/restore tests. Roll application images back only while the additive
schema remains compatible; database rollback is restore-based. To pause intake,
disable tracking preferences or remove API traffic at the edge—do not drop tables,
policies, grants, history, or raw-retention metadata.

Escalate cross-owner visibility, grant drift, parser executable content, repeated
lease exhaustion, ledger duplication, unbounded payload growth, purge lag over an
hour, or any unexplained audit/outbox/history gap. Preserve request, operation,
audit, session, item, and parser-version IDs only.
