# Data Model: Offline Sync, Idempotency & Conflict Resolution

**Feature**: SPEC-BE-006
**Date**: 2026-08-31
**Storage rule**: four Phase 06 server tables; the existing private outbox is the
immutable change log.

## Entity Map

```text
public.profiles
  |-- private.idempotency_keys
  |-- public.client_sync_state -- public.client_mutations
  |                                  |
  |                                  `-- public.transaction_conflicts
  |
  `-- Phase 04/05 owner rows -- private.outbox_events.payload.sync
```

`device_id` is an authenticated-client identifier, not a foreign key to a
Phase 06-owned device table. All public rows carry `user_id` so RLS can enforce
ownership without trusting request payloads.

## `private.idempotency_keys` (evolved)

Phase 05 already created this table. Phase 06 adds fencing and cleanup support;
it does not create a second idempotency store.

| Column            | Type          |      Required | Rule                                      |
| ----------------- | ------------- | ------------: | ----------------------------------------- |
| `id`              | `uuid`        |           yes | primary key                               |
| `actor_id`        | `text`        |           yes | authenticated Phase 02 profile subject    |
| `scope`           | `text`        |           yes | stable command namespace                  |
| `key_hash`        | `text`        |           yes | SHA-256 of trimmed idempotency key        |
| `request_hash`    | `text`        |           yes | SHA-256 of canonical request material     |
| `state`           | `text`        |           yes | `claimed`, `completed`, `failed`          |
| `lease_token`     | `uuid`        |  claimed only | changes on every successful claim/reclaim |
| `locked_until`    | `timestamptz` |  claimed only | bounded processing lease                  |
| `response_status` | `integer`     | terminal only | stored HTTP status                        |
| `response_body`   | `jsonb`       | terminal only | stored response envelope                  |
| `resource_ref`    | `jsonb`       |            no | stable resource reference                 |
| `expires_at`      | `timestamptz` |           yes | default creation + 30 days                |
| timestamps        | `timestamptz` |           yes | created/updated/completed                 |

Constraints and indexes:

- unique `(actor_id, scope, key_hash)`;
- request-hash mismatch is always `IDEMPOTENCY_KEY_REUSED`;
- partial cleanup index on `expires_at` for terminal rows;
- lease token is required while `state = 'claimed'` and cleared on terminal
  completion;
- stale claim completion must fail unless its supplied fence still matches.

State transitions:

```text
missing -> claimed(token A) -> completed
                    |       -> failed
                    `-- lease expires -> claimed(token B)
token A completion after reclaim -> rejected
```

## `public.client_sync_state`

| Column              | Type          | Required | Rule                                              |
| ------------------- | ------------- | -------: | ------------------------------------------------- |
| `id`                | `uuid`        |      yes | primary key                                       |
| `user_id`           | `text`        |      yes | FK Phase 02 profile subject                       |
| `device_id`         | `text`        |      yes | 1..128 normalized client identifier               |
| `domain`            | `text`        |      yes | registered Phase 04/05 sync domain                |
| `last_cursor`       | `bigint`      |      yes | default 0; highest contiguous acknowledged cursor |
| `last_synced_at`    | `timestamptz` |       no | server time of successful ack                     |
| `last_ack_mutation` | `uuid`        |       no | most recently acknowledged operation              |
| timestamps          | `timestamptz` |      yes | created/updated                                   |

Constraints and indexes:

- unique `(user_id, device_id, domain)`;
- `last_cursor >= 0`;
- ownership RLS on `user_id`;
- ack update is monotonic (`greatest(stored, submitted)`) and rejects a cursor
  beyond the user's current server cursor.

## `public.client_mutations`

| Column            | Type          | Required | Rule                                                        |
| ----------------- | ------------- | -------: | ----------------------------------------------------------- |
| `id`              | `uuid`        |      yes | primary key; server receipt id                              |
| `user_id`         | `text`        |      yes | authenticated Phase 02 profile subject                      |
| `device_id`       | `text`        |      yes | submitting device                                           |
| `operation_id`    | `uuid`        |      yes | client-stable idempotency key                               |
| `domain`          | `text`        |      yes | registered domain                                           |
| `resource_id`     | `text`        |       no | client or server resource identifier                        |
| `operation`       | `text`        |      yes | domain-supported command                                    |
| `base_version`    | `bigint`      |       no | optimistic concurrency base                                 |
| `payload_hash`    | `text`        |      yes | canonical SHA-256                                           |
| `payload`         | `jsonb`       |      yes | validated command body                                      |
| `status`          | `text`        |      yes | `received`, `processing`, `applied`, `conflict`, `rejected` |
| `result`          | `jsonb`       |       no | stable success/conflict response                            |
| `error`           | `jsonb`       |       no | stable terminal/retry details                               |
| `attempt_count`   | `integer`     |      yes | default 0                                                   |
| `next_attempt_at` | `timestamptz` |       no | retry eligibility                                           |
| `locked_by`       | `text`        |       no | worker identity                                             |
| `locked_until`    | `timestamptz` |       no | processing lease                                            |
| `lease_token`     | `uuid`        |       no | worker fence                                                |
| `processed_at`    | `timestamptz` |       no | terminal timestamp                                          |
| timestamps        | `timestamptz` |      yes | created/updated                                             |

Constraints and indexes:

- unique `(user_id, operation_id)`; same operation with a different payload hash
  returns `IDEMPOTENCY_KEY_REUSED`;
- nonnegative `base_version` and `attempt_count`;
- partial worker index `(next_attempt_at, created_at)` for `received` rows;
- lookup index `(user_id, device_id, created_at, id)`;
- lease fields are populated together only during `processing`;
- terminal rows cannot transition back to a nonterminal state.

## `public.transaction_conflicts`

| Column               | Type          | Required | Rule                                                   |
| -------------------- | ------------- | -------: | ------------------------------------------------------ |
| `id`                 | `uuid`        |      yes | primary key                                            |
| `user_id`            | `text`        |      yes | authenticated Phase 02 profile subject                 |
| `transaction_id`     | `uuid`        |      yes | FK transaction                                         |
| `client_mutation_id` | `uuid`        |      yes | FK mutation receipt                                    |
| `server_version`     | `bigint`      |      yes | observed current version                               |
| `client_version`     | `bigint`      |      yes | submitted base version                                 |
| `conflict_fields`    | `text[]`      |      yes | sorted unique field names                              |
| `server_snapshot`    | `jsonb`       |      yes | owner-safe authoritative snapshot                      |
| `client_snapshot`    | `jsonb`       |      yes | submitted snapshot                                     |
| `status`             | `text`        |      yes | `open`, `resolved`, `rejected`                         |
| `resolution`         | `text`        |       no | `server`, `client`, `merged`, `duplicate`, `keep_both` |
| `resolution_payload` | `jsonb`       |       no | optional merged/client patch                           |
| `resolved_at`        | `timestamptz` |       no | terminal timestamp                                     |
| timestamps           | `timestamptz` |      yes | created/updated                                        |

Constraints and indexes:

- unique active conflict per `client_mutation_id`;
- indexes `(user_id, status, created_at, id)` and the transaction FK;
- financial transaction conflicts permit `server`, `client`, `merged`, or
  `duplicate`; `keep_both` is rejected;
- terminal resolution is idempotent when repeated with the same resolution and
  payload, and rejected when the terminal decision differs.

## Existing `private.outbox_events` Sync Metadata

The Phase 06 trigger enriches allowed owner events with this reserved object:

```json
{
  "sync": {
    "userId": "uuid",
    "domain": "transactions",
    "cursor": 42,
    "resourceId": "uuid",
    "resourceType": "transaction",
    "operation": "upsert",
    "version": 3,
    "snapshot": {},
    "deletedAt": null
  }
}
```

Rules:

- callers may not supply `payload.sync`;
- the trigger derives owner, domain, resource, version, and safe snapshot from
  authoritative rows;
- cursor allocation is monotonic per `(userId, domain)` under a transaction
  advisory lock;
- the same committed owner mutation and outbox insert publish the change;
- payload, including `sync`, is immutable after insert;
- delete events carry a tombstone and never require reading a deleted row;
- a partial unique expression index enforces `(userId, domain, cursor)`.

## Retention

- completed/failed idempotency rows: 30 days;
- terminal client mutations: 30 days after processing;
- resolved/rejected conflicts: 30 days after resolution;
- outbox sync rows: retain until at least 30 days and until no active client
  checkpoint needs them; cleanup is bounded and skips locked work;
- an expired cursor produces `SYNC_CURSOR_EXPIRED`, requiring bootstrap. It
  never silently returns an incomplete delta.

## Security Invariants

- public tables have explicit least-privilege grants and `ENABLE` plus `FORCE`
  RLS;
- users can see only their own sync state, mutations, and conflicts;
- server-managed columns cannot be altered by authenticated clients;
- mutation claim/complete, cursor allocation, cleanup, and conflict resolution
  functions are private, security-definer, have fixed empty `search_path`, fully
  qualify objects, and revoke execution from `PUBLIC`;
- logs and metrics use identifiers, hashes, counts, states, and latencies only;
  mutation payloads and snapshots are not logged.

## Account Tracking Projection

Account upsert snapshots carry `automatic_tracking_enabled` as a non-null
boolean. Deletion continues to emit only the existing account tombstone
identity/version with `snapshot = null`, so no account preference leaks after
deletion. Missing fields from older snapshots retain the compatible value true.
