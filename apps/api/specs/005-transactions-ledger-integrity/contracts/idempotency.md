# Temporary Idempotency Contract

## Boundary

Phase 05 implements only the lookup/claim/complete subset needed to make financial
writes replay-safe. The resource remains owned by SPEC-BE-006. Sync cursors,
client mutation logs, conflict resolution, tombstones, cleanup scheduling, and
offline replay are excluded.

## Storage

`private.idempotency_keys` contains:

| Column | Contract |
|---|---|
| `actor_id` | verified Clerk customer subject text |
| `scope` | stable operation scope such as `transactions.create` |
| `key_hash` | SHA-256 of the raw `Idempotency-Key`; raw keys are never stored |
| `request_hash` | SHA-256 of the normalized, validated command payload |
| `state` | `claimed`, `completed`, or `failed` |
| `response_status` / `response_body` | exact successful replay envelope |
| `resource_ref` | safe created or revised resource reference |
| `locked_until` | bounded in-progress lease |
| `expires_at` | retention boundary for the future owner |

The unique key is `(actor_id, scope, key_hash)`. Direct customer/Admin access is
revoked; only the API role can execute the private lookup, claim, and completion
functions. Both hash columns are text constrained to
`sha256:` followed by exactly 64 lowercase hexadecimal characters. Responses
are bounded JSON objects and cannot contain raw credentials or idempotency keys.
Raw keys use the existing platform-safe `[A-Za-z0-9._:-]` alphabet and are 8 to
128 characters long, preserving compatibility with earlier API contracts.

## Request normalization

The API validates and transforms the DTO first, then recursively sorts plain
object keys while preserving array order. Optional fields are represented
consistently and unknown fields are rejected. Node's built-in `JSON.stringify`
and `crypto.createHash('sha256')` produce the canonical request hash; no new
dependency is introduced.

## State machine

1. After DTO normalization, perform a non-mutating private lookup. A completed
   matching hash returns the stored status/body before version, rate-limit, or
   recent-auth business gates.
2. If lookup reports no completed response, begin the same PostgreSQL
   transaction used for the ledger mutation.
3. Claim `(actor_id, scope,key_hash,request_hash)` under row lock. A new key
   enters `claimed`; only then does the command continue.
4. A race that completed after lookup returns the stored response from claim
   without executing audit, outbox, or posting writes again.
5. A matching active claim returns `IDEMPOTENCY_IN_PROGRESS`.
6. A mismatched request hash returns `IDEMPOTENCY_KEY_REUSED`.
7. Before commit, completion stores the exact response status/body and resource
   reference in the same transaction.
8. Any command failure rolls back the claim and all financial side effects.

No visible write path exists before the migration, permissions, functions, and
tests for this contract are installed.

## Stable errors

| Code | HTTP | Meaning |
|---|---:|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | financial write omitted or malformed the header |
| `IDEMPOTENCY_KEY_REUSED` | 409 | same actor/scope/key has a different request hash |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | matching claim is still active |
| `IDEMPOTENCY_REPLAY_UNAVAILABLE` | 503 | stored replay state is internally inconsistent |

## Compatibility handoff to SPEC-BE-006

SPEC-BE-006 may add consumers and lifecycle columns through additive migrations,
but must preserve the unique key, hashes, stored response semantics, and existing
Phase 05 replay behavior. Phase 05 does not rename or generalize this contract.
