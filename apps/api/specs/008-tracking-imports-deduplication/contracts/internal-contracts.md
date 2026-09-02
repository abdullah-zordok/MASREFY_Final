# Internal Contracts

## Ledger acceptance

All accepted items invoke the existing ledger command service. The command uses:

- `source = "tracking-import"`;
- `externalRef = "import:<session UUID>:item:<item UUID>"`;
- a stable hashed idempotency key scoped to the owner and item;
- integer-safe `amountMinor`; unsafe or out-of-contract values enter review;
- only fields accepted by the SPEC-BE-005 transaction command.

The tracking transaction completes only after ledger success is known. A retry
reuses the same source, external reference, and idempotency key. It treats the
existing transaction as success only when the normalized command hash matches.
Conflicts become review items and are never silently overwritten.

`merge_details` permits only the existing ledger update contract's editable text,
category, and occurrence fields. It cannot change ownership, account ownership,
currency, or immutable audit/history.

## SPEC-BE-006 idempotency and replay

HTTP commands use the existing idempotency request/replay contract and Phase 08
scopes. Worker claims use UUID lease tokens, explicit worker IDs, bounded leases,
compare-and-set completion, deterministic retry delay, and a maximum attempt count.
Expired leases are reclaimable. Completing with the wrong, expired, or superseded
token fails closed.

Phase 08 produces canonical outbox events; it does not add a sync domain. Existing
transaction synchronization observes ledger changes caused by accepted items.

## Admin authorization

Routes use the existing exact permissions:

| Surface | Read permission | Mutation permission |
|---|---|---|
| imports overview/sessions | `imports.read`, detail uses `imports.detail.read` | failures use `imports.failures.manage` |
| low confidence | `imports.read` | `imports.confidence.manage` |
| duplicates | `imports.read` | `imports.duplicates.manage` |
| unsupported | `imports.read` | `imports.unsupported.manage` |
| institutions/senders | `parsers.coverage.read` | `parsers.senders.manage` |
| parser rules/versions | `parsers.rules.read` | `parsers.rules.manage`, `parsers.versions.manage` |
| parser corpus | `parsers.rules.read` | `parsers.tests.run` |
| merchant/category rules | `parsers.rules.read` | `parsers.merchants.manage`, `parsers.categories.manage` |
| runtime settings | `settings.imports.read` | `settings.imports.manage` |

Sensitive mutations also require recent MFA, a 10–500 character reason, expected
version, and an idempotency key. A hard-coded confirmation token is not a contract.

## Privacy and support

Privacy export returns user-owned preferences, rules, decisions, history, and
feedback in bounded canonical JSON, excluding raw payloads, private attempts,
leases, parser internals, and admin audit data. Privacy deletion removes or
anonymizes owner records in dependency order while preserving ledger/audit records
under their existing retention rules.

The existing support `import-summary` purpose returns only bounded counts, status,
timestamps, and safe reason codes. It never returns raw payload, object references,
message bodies, rules, tokens, amounts, merchant text, or parser evidence.

## Raw payload lifecycle

Accepted text is written once to a generated private object path, content-hashed,
and referenced by a private database row. A database transaction records the
session/item metadata. Failed orchestration reconciles orphaned objects by hash and
age. Retention jobs claim expired rows, delete the object idempotently, then mark
the row purged. Backup/restore evidence excludes expired raw bodies and verifies
referential metadata plus restoration of non-expired test objects.
