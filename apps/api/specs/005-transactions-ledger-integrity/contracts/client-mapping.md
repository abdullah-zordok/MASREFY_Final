# Mobile And Admin Compatibility Mapping

Phase 05 publishes backend contracts only. It does not cut over Mobile adapters,
add Admin financial screens, or implement SPEC-BE-006 sync behavior.

## Mobile domain mapping

| Existing Mobile field/operation | Phase 05 API source |
|---|---|
| `Transaction.id` | `TransactionSummary.id` |
| `type` | `kind` (`transfer`, `refund`, and `reversal` keep relationship IDs) |
| `title`, `merchant`, `paymentMethod`, `notes` | `title`, `merchant`, `paymentMethod`, `note` |
| signed Mobile `amountMinor` | backend kind plus positive declared amount; adapter applies the existing sign convention |
| `currencyCode` | wire `currency` |
| `accountId`, `destinationAccountId` | ordered `accountIds` and detail postings |
| `feeMinor` | `feeMinor` |
| `occurredAt` | `occurredAt` |
| Mobile epoch timestamps | parse the corresponding wire ISO-8601 timestamps; nullable timestamps stay null |
| Mobile `status` | `pending -> pending`, `confirmed -> posted`, `reversed -> reversed`, `deleted -> deleted`; linked refund/reversal rows retain their own `type` and `originalTransactionId` |
| `version` | transaction `version` |
| `deletedAt`, `undoExpiresAt` | matching nullable response fields |
| list/get | `GET /transactions`, `GET /transactions/:id` |
| create income/expense | `POST /transactions` |
| transfer | `POST /transfers` |
| refund/reversal | linked transaction command endpoints |
| update/delete/undo | PATCH, DELETE, and restore endpoints with expected version and idempotency key |
| account balance projection | account summary `confirmedMinor`, `pendingMinor`, `ledgerVersion` |

`note` maps to Mobile `notes`. Mobile-only `reviewStatus`, `syncStatus`,
`obligationId`, `adjustmentSign`, `createdAt`, and `updatedAt` remain locally
owned/defaulted by the future adapter and are never inferred from absent wire
fields. The representative executable contract test fixes these conversions
without adding or cutting over a client adapter.

The adapter must retain the server operation/idempotency key across retry. Cursor
sync, merge/conflict policy, and offline mutation storage remain SPEC-BE-006.

## Admin mapping

The current Admin contract exposes `transactionsCount` only. Phase 05 preserves
that aggregate and returns no transaction rows, postings, balances, notes, or
merchant data to Admin/support principals. Future Admin ledger access requires a
separate owned spec, explicit permission, purpose-bound support scope, audit, and
field-level data minimization.
