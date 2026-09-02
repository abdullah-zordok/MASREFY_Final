# US4 — Tombstone Evidence

- Live `tombstones.integration.spec.ts`: an archived account emitted one ordered delete change with an ISO `deletedAt`, no snapshot, and an immutable outbox payload.
- pgTAP `025_sync_outbox.test.sql`: cursor uniqueness/atomicity, allowlist, spoof rejection, snapshot/tombstone derivation, and payload immutability passed.
- `sync-tombstones.test.ts`: a server delete mapped to a pending local transaction creates an explicit `delete_vs_local_edit` conflict and does not mark the local row deleted.
- Repeated/missing-row SQLite tombstone updates are harmless SQL updates; cursor advancement remains inside the same transaction.

Result: PASS. Deletes do not require a current-row snapshot and cannot silently discard pending Mobile work.
