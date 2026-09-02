# Mobile Offline Sync Contract

## Additive SQLite Migration

Upgrade schema version 9 to 10 without deleting or rewriting existing data.

### `sync_state`

| Column                                           | Purpose                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `domain TEXT PRIMARY KEY`                        | registered domain                           |
| `cursor TEXT NOT NULL`                           | last applied and acknowledged opaque cursor |
| `last_synced_at TEXT`                            | ISO timestamp                               |
| `bootstrap_completed INTEGER NOT NULL DEFAULT 0` | durable bootstrap marker                    |

### `sync_mutation_queue`

| Column                                     | Purpose                                       |
| ------------------------------------------ | --------------------------------------------- |
| `operation_id TEXT PRIMARY KEY`            | stable UUID created once                      |
| `domain TEXT NOT NULL`                     | registered domain                             |
| `operation TEXT NOT NULL`                  | server command                                |
| `resource_id TEXT`                         | local/server ID                               |
| `base_version INTEGER`                     | optimistic base                               |
| `payload TEXT NOT NULL`                    | canonical JSON                                |
| `status TEXT NOT NULL`                     | pending, sending, applied, conflict, rejected |
| `attempt_count INTEGER NOT NULL DEFAULT 0` | local retry count                             |
| `next_attempt_at TEXT`                     | retry time                                    |
| `last_error_code TEXT`                     | stable code only                              |
| timestamps                                 | creation/update                               |

Index pending work by `(status, next_attempt_at, created_at)`.

### `sync_resource_ids`

| Column                               | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `domain TEXT NOT NULL`               | registered domain             |
| `local_id TEXT NOT NULL`             | existing local primary key    |
| `server_id TEXT`                     | server identifier after apply |
| `version INTEGER NOT NULL DEFAULT 0` | last applied server version   |
| `deleted_at TEXT`                    | tombstone state               |
| `updated_at TEXT NOT NULL`           | mapping update time           |

Primary key `(domain, local_id)` and unique non-null `(domain, server_id)`.

## Push/Pull Order

1. Restore expired local `sending` rows to `pending`.
2. Send up to 100 due queue entries with the same operation IDs.
3. Persist receipts; never create replacement operation IDs on retry.
4. Pull deltas per domain from the stored cursor, at most 500 per request.
5. In one SQLite transaction, apply the ordered changes/tombstones, update ID
   mappings, and advance the local cursor.
6. Ack only after the local transaction commits.
7. Repeat while `hasMore`; apply retry backoff for transient failures.

Bootstrap follows the same atomic apply rule and sets its marker only after all
requested domain snapshots and cursors commit. It merges by mappings and server
IDs; it does not wipe local pending work.

## Repository Adapter

The existing `CoreFinanceRepository` remains the UI-facing store. A small sync
adapter reads/writes the three metadata tables and reuses existing account,
category, transaction, and `finance_sync_conflicts` methods. No parallel finance
repository or state manager is introduced.

Local writes enqueue their mutation in the same SQLite transaction as the local
domain change whenever the repository supports an explicit transaction. The
queue retains terminal receipt metadata until the 30-day cleanup policy.

## ID Mapping

- Never rewrite existing SQLite primary keys.
- A locally created row keeps its `local_id`; after server apply, store the
  returned `server_id` in `sync_resource_ids`.
- Incoming changes resolve by server ID first, then by the operation's mapping.
- A duplicate mapping is an integrity error and pauses that domain; it is not
  repaired by deleting user data.

## Tombstones and Conflicts

- A delete change marks the existing local row with its supported archive/delete
  representation and updates the mapping tombstone; missing local rows are safe
  no-ops with the mapping still recorded.
- Financial conflicts are copied into existing `finance_sync_conflicts` for UI
  resolution. `keep_local`, `keep_server`, and validated merge map to server
  `client`, `server`, and `merged`. Mobile `keep_both` is disabled for financial
  transaction conflicts.
- Pulling a conflict never overwrites a local pending edit silently.

## Retry and Recovery

- Retry network/5xx/429 failures with capped exponential backoff and jitter.
- Do not retry stable validation, unsupported operation, ownership, or exhausted
  server failures without user action.
- On `SYNC_CURSOR_EXPIRED`, bootstrap only the affected domain and preserve local
  pending mutations/conflicts.
- Process restart is safe because cursor, queue state, operation IDs, and
  mappings are durable.
