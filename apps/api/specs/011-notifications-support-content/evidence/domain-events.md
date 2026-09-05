# Consumed Domain Event Inventory

Phase 11 consumes existing contracts only after their owning transaction commits.
It does not modify the following registries:

- Ledger: `transaction.created`, `transfer.created`, `transaction.refunded`,
  `transaction.reversed`, `transaction.revised`, `transaction.deleted`,
  `transaction.restored`, `balance.changed`, and reconciliation failure.
- Planning: the 32 names in `PLANNING_EVENT_NAMES`, covering salary receipts,
  budgets, obligations, payment matching, savings, reminders and reconciliation.
- Tracking/imports: the 13 versioned names in `TRACKING_EVENT_NAMES`.
- AI: the nine versioned names in `AI_EVENT_TYPES`; payload text remains forbidden.
- Reports: the six names in `REPORT_EVENTS`.

The source registries use their existing envelope/version conventions. Engagement
maps an explicit allowlisted subset to safe templates and rejects unknown versions,
payload keys, and every SPEC-BE-012+ shaped fixture. A future owner can extend the
public registry seam only after publishing its own contract.

