# Internal Sync Contracts

## Registered Domains

The implementation owns one static registry. It is not a plugin framework.

| Domain         | Owner table                 | Resource type | Commands                         |
| -------------- | --------------------------- | ------------- | -------------------------------- |
| `accounts`     | `public.financial_accounts` | `account`     | create, update, archive, restore |
| `categories`   | `public.categories`         | `category`    | create, update, archive, restore |
| `transactions` | `public.transactions`       | `transaction` | create, update, delete, restore  |

Every handler delegates to the existing Phase 04/05 command service or database
command function. Sync does not duplicate finance invariants.

## Canonical Hashing

- Reuse `apps/api/src/ledger/idempotency.ts` canonical JSON hashing.
- Batch request hash includes authenticated actor, device ID, ordered mutation
  array, and normalized request body.
- Per-operation payload hash includes domain, operation, resource ID,
  base version, and canonical payload.
- Object key order does not affect hashes; array order does.
- Raw idempotency keys and payloads are never logged.

## Idempotency Claim Result

```ts
type ClaimResult =
  | { kind: 'claimed'; leaseToken: string }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'reused' };
```

The database owns the comparison and lease transition. Completion requires the
same actor/scope/key hash, request hash, and lease token. Existing Phase 05
same-transaction calls use the compatibility wrapper; new sync processing
passes the lease token explicitly.

## Mutation Receipt Algorithm

For each item, in input order:

1. Validate the registered domain/operation and payload size.
2. Insert or read `(user_id, operation_id)`.
3. If the stored hash differs, return `IDEMPOTENCY_KEY_REUSED` for that item.
4. If terminal, replay its stored result/error.
5. Otherwise return its current state; the mutation worker applies it.

The batch endpoint stores each receipt independently. One rejected/conflicting
item does not roll back unrelated receipts. A retried batch produces the same
ordered receipts from durable rows.

## Worker Claim/Complete Contract

- Claim at most a configured bounded batch with one short transaction using
  `FOR UPDATE SKIP LOCKED`.
- Claim only `received` rows whose `next_attempt_at` is null or due, plus
  `processing` rows with an expired lease.
- Increment attempt count and assign `locked_by`, `locked_until`, and a fresh
  lease token.
- Execute each command outside the claim transaction.
- Complete only when the lease token still matches.
- Retry transient failures with capped exponential backoff and jitter.
- After the configured maximum, set `rejected` with
  `SYNC_RETRY_EXHAUSTED`; never leave an unbounded hot loop.
- Domain validation failures and ownership/version conflicts are not retried.

## Conflict Contract

An update/delete whose `baseVersion` differs from the authoritative transaction
version creates one conflict row and completes the mutation as `conflict` in the
same database transaction. The snapshots are owner-safe and immutable.

Resolution rules:

- `server`: retain server row and mark conflict resolved;
- `client`: apply validated client snapshot through the existing transaction
  command boundary against the recorded server version;
- `merged`: apply the validated resolution payload through that same boundary;
- `duplicate`: acknowledge the client intent as already represented;
- `keep_both`: forbidden for financial transaction conflicts.

Applying a client/merged resolution creates normal audit and outbox records.
Resolution itself is idempotent under the request idempotency key.

## Cursor Codec

The external cursor is an opaque base64url payload plus HMAC-SHA256 signature. A
regular sync cursor's decoded payload contains only:

```json
{ "v": 2, "t": "s", "d": "transactions", "p": "42", "s": "scope-hmac" }
```

Bootstrap continuations use `"t": "b"` and add the UUIDv4 keyset field `"a"`.
The scope HMAC binds every signed-v2 cursor to the authenticated user, UUIDv4
device, and registered domain without exposing those identifiers. Malformed,
tampered, wrong-version, wrong-type, wrong-domain, or wrong-scope values return
`SYNC_CURSOR_INVALID`. A position older than retained history returns
`SYNC_CURSOR_EXPIRED`; acknowledging a valid cursor not issued to that device
returns `SYNC_CURSOR_NOT_ISSUED`.

## Transaction Boundaries

- owner mutation + audit + outbox sync metadata: one transaction;
- mutation receipt insert: one short transaction per bounded batch chunk;
- mutation claim: one short transaction;
- command execution + mutation completion/conflict: one transaction per item;
- ack upsert and cursor validation: one transaction;
- cleanup: bounded batches, never an unbounded delete.

## Trust Boundary

Controllers obtain `user_id` from the authenticated principal and `device_id`
from the validated header. They never accept owner IDs from payloads. Repository
queries still include owner predicates even where RLS provides defense in depth.
