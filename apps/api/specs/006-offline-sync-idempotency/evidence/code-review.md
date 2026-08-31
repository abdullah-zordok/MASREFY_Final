# Independent Code Review

Date: 2026-08-31
Scope: complete Phase 06 production diff, migration, Mobile adapters, tests, and
release wiring. The review was performed independently from implementation and
then each finding was traced and dispositioned in the owning layer.

## Findings fixed

| Severity | Finding | Disposition |
| --- | --- | --- |
| Critical | Device IDs were not sufficiently bound to the authenticated owner/session. | UUID-v4 validation, active `user_devices` ownership, and JWT `sid` binding are enforced before sync access. |
| Critical | Worker-side conflict creation depended on request JWT context. | Conflict creation now uses the fenced worker/database path and explicit owner identity. |
| Critical | Bootstrap pagination lacked a stable snapshot/page boundary. | Repeatable-read reads, deterministic keysets, signed continuation state, and payload budgeting were added. |
| Critical | Conflict resolution could split the ledger decision from audit/outbox state. | Resolution now locks and delegates to `private.revise_transaction` in one transaction, with exactly one audit/outbox effect. |
| Critical | One hash-mismatched operation could abort unrelated batch operations. | The offending operation receives a terminal receipt while unrelated operations continue; response input order is preserved. |
| Critical | Mobile merge did not fully protect version/tombstone/ID-mapping state. | Version-gated upserts, explicit resource state, owner-safe mappings, pending-edit preservation, and tombstone conflicts were added. |
| Critical | Legacy floating money conversion could silently round ambiguous values. | Currency-scale exact conversion is used; ambiguous legacy amounts remain intact and are quarantined for review. |
| Critical | Cleanup could remove data still needed by checkpoints. | Cleanup is bounded with `SKIP LOCKED` and retains active cursor/outbox, conflict, receipt, and lease dependencies. |
| Important | Mutation envelopes did not encode resource/schema/dependency contracts. | `resourceType`, schema version 1, `dependsOn`, duplicate/cycle checks, and deterministic topological execution were added. |
| Important | Reconciliation existed only as an operator concept. | `private.check_sync_reconciliation()` is invoked by `sync-state.cleanup` and fails on checkpoint/outbox/conflict drift. |
| Important | Outbox snapshots were overly broad. | Every sync-visible resource now uses an explicit allowlist; broad row-to-JSON capture was removed. |
| Important | Cursor/no-store/error/worker terminal behavior was incomplete. | Signed owner/device/domain cursors, `private, no-store`, stable safe errors, and deterministic terminal retry exhaustion were completed. |

## Review boundaries

- No Admin sync client was added.
- Mobile runtime cutover remains intentionally outside Phase 06; this phase owns
  the SQLite schema, repository, adapter, and HTTP contract only.
- Performance evidence exercises the core database protocol and authenticated
  HTTP behavior is covered separately by contract/e2e tests.

Outcome: every actionable in-scope finding was fixed and rerun through the
focused unit, contract, live integration, pgTAP, Mobile, security, and
performance suites. No unresolved in-scope correctness or security finding
remains.
