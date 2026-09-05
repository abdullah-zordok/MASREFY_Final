# Internal Ledger Contracts

## Database command boundary

All financial state changes enter through private security-definer functions
owned by `masarifi_migration`, with a fixed safe `search_path`, explicit request
context checks, and grants only to `masarifi_api`:

- `private.post_transaction`
- `private.transfer_funds`
- `private.post_opening_transaction`
- `private.revise_transaction`
- `private.refund_transaction`
- `private.reverse_transaction`
- `private.soft_delete_transaction`
- `private.restore_transaction`

The API opens one `PoolClient` transaction, sets verified request context, claims
idempotency, calls one command, appends existing audit/outbox records, completes
idempotency, and commits. The account-creation service uses the same client for
the SPEC-BE-004 account insert and Phase 05 opening command.

## Lock and version order

1. Acquire the transaction-scoped advisory lock for the authenticated user.
2. Lock affected accounts in ascending UUID order.
3. Lock an existing transaction row when revising/deleting/restoring/reversing or
   refunding it.
4. Compare `expectedVersion` before any posting write.
5. Derive the next ledger version as one greater than the maximum owner balance
   projection version while the owner lock is held.
6. Append postings/revision, update projections, and return the version.

This minimal per-owner lock is intentionally stronger than per-account locking;
it eliminates transfer deadlocks and lost updates. Upgrade only if measured
owner-level contention breaches Phase 05 performance thresholds.

## Posting rules

- Income: positive confirmed amount on the destination account.
- Expense: negative confirmed amount on the source account.
- Transfer: negative source and positive destination amounts; currency must be
  identical. Optional fee is an additional negative source posting or a paired
  source/fee-account movement when a fee account is supplied.
- Opening: one posting equal to the requested nonzero opening balance.
- Refund: positive amount against the original expense account, capped by
  original expense less prior active refunds.
- Reversal: append the exact inverse of every active posting in the original
  effect, including fee postings.
- Revision/delete/restore: append only the delta required to transform the prior
  active effect; never update or delete a posting.

For every transaction, active postings must match its kind and declared amount,
accounts, currency, fee, and relationship. Account projections equal the sum of
immutable postings by clearing state.

## Mutation eligibility

- `MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS` is an optional bounded manifest of
  unique `CURRENCY:positiveMinor` pairs. For a configured currency, a command
  whose absolute active effect reaches the threshold requires the existing Clerk
  factor age to be within `MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS`; malformed
  configuration fails startup and missing/stale factor evidence fails closed.
- A stale expected version fails with `VERSION_CONFLICT` and returns the current
  version without any side effect.
- Reversed transactions cannot be revised, deleted, restored, or reversed again.
- Only confirmed expenses can be refunded.
- A transaction with active refunds or reversal relationships cannot be deleted.
- Delete is soft and creates a fixed 30-second undo deadline.
- Restore succeeds only before that deadline and only from deleted state.
- The latest protected deletion revision retains the sorted pre-delete effect;
  restore appends that exact effect and never infers it from timestamps.
- Account ownership, active status, currency equality, positive amounts, safe
  integer bounds, category applicability, and relationship ownership are checked
  inside the same database command that writes postings.

## Reconciliation worker

`ledger.reconcile` accepts a deterministic cursor and `batchSize` (default 100,
maximum 500). It compares stored projections to grouped immutable postings under
owner-safe database context, emits mismatch evidence, advances the cursor, and
terminates after the configured batch. It neither changes balances nor creates
adjustment transactions.

## Access boundary

Customers may read only their transaction headers, postings through protected
detail responses, balances, and account summaries. Customers cannot directly
insert/update/delete ledger tables. Admin/support roles receive neither raw
ledger reads nor financial mutations in Phase 05; the existing aggregate
transaction count remains unchanged. Direct authenticated/PostgREST table access
is revoked and RLS remains deny-by-default.

`private.reassign_category_transactions` is executable only by `masarifi_api`,
revalidates caller/owner, an unmerged custom source, and an active compatible
custom target, and can update only `transactions.category_id` under the existing
ledger command guard.
