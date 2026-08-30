# Phase 05 Definition of Done

Date: 2026-08-30 (Asia/Riyadh)
Branch: `codex/spec-be-005`
Base: `dfed012743ca0c3c5f760e7b2439dbc0dae9c825`
Status: complete; exact main and immutable `backend-v0.5.0` release gates pass

No skipped, stale, unavailable, or external-only check is counted as a pass.
Exact commands and counts are retained in `local-release.md`; focused financial,
authorization, atomicity, concurrency, reconciliation, recovery, and performance
procedures are retained beside this file.

## Functional requirements

| Requirement | Result | Executed evidence |
|---|---|---|
| FR-001 | PASS | Posting/revision immutability and protected projections: pgTAP 020-022 plus live financial-invariant reconstruction. |
| FR-002 | PASS | `20260830080000_phase05_idempotency_bridge.sql` precedes every ledger migration; clean reset and migration inventory pass. |
| FR-003 | PASS | Mandatory scoped claim/lookup/complete for all eight write paths; unit, contract, live replay, and pgTAP 019 pass. |
| FR-004 | PASS | Canonical same-request replay precedes business gates; mismatches are side-effect-free. All-route matrix and live stale-version replay pass. |
| FR-005 | PASS | Income, expense, transfer/fee, opening, refund, reversal, revision, delete, and restore golden/live cases append postings only. |
| FR-006 | PASS | Owner advisory lock and deterministic UUID row locks; opposite-transfer/same-account stress completes without deadlock or partial state. |
| FR-007 | PASS | Service and database-race paths enforce exact expected version and return sanitized `currentVersion`; stale-write tests pass. |
| FR-008 | PASS | Failure injection at posting, projection, revision, audit, outbox, and completion boundaries proves one transaction rollback. |
| FR-009 | PASS | Strict DTO allowlists and database ownership/status/currency/category/safe-integer constraints; cumulative overflow maps safely and rolls back. |
| FR-010 | PASS | Same-currency distinct-account transfer and optional fee are atomic; cross-currency/same-account/foreign fee cases fail closed. |
| FR-011 | PASS | Nonzero account opening shares the account transaction and replays exactly; zero creates no ledger row; injected failures leave neither resource. |
| FR-012 | PASS | Multi-version/four-account revision retains every posting/snapshot while summaries expose only current nonzero effects. |
| FR-013 | PASS | Concurrent cumulative refunds/full reversals and the delete/restore cap exploit regression enforce the original amount and uniqueness. |
| FR-014 | PASS | Delete appends inverse effect; restore appends protected prior effect; database server time enforces one nonextendable 30-second window. |
| FR-015 | PASS | Owner-only keyset list/search/detail/account summary are bounded and versioned; 100-row query-count/payload and performance gates pass. |
| FR-016 | PASS | Every fixed Admin/support role and a promoted customer are denied raw ledger rows and writes; aggregate Admin contract is unchanged. |
| FR-017 | PASS | Anonymous, authenticated direct-table, worker, foreign owner, and Admin denials pass at API, functions, RLS, and grants. |
| FR-018 | PASS | Reconciliation compares confirmed/pending posting truth in bounded timeout-controlled batches, detects drift, and contains no repair mutation. |
| FR-019 | PASS | Safe event schemas and fixed-cardinality command/read/lock/posting/projection/reconciliation metrics, dashboards, alerts, and leakage tests pass. |
| FR-020 | PASS | DTO/OpenAPI/internal/idempotency/event/job/function/Mobile/Admin drift and executable mapping contracts pass 32/119. |
| FR-021 | PASS | Ordered checksummed forward migrations, Phase 04 prefix compatibility, failed-then-forward-fix, retry, backup/restore, and N-1 app contract pass. |
| FR-022 | PASS | Unit 56/446, contract 32/119, pgTAP 22/606, integration 41/100, E2E 29/46, security 16/86, local performance 56,687 checks, immutable-tag performance 24,299/24,299 checks, and container 7/19 all pass with zero live skips. |
| FR-023 | PASS | Diff inventory contains only the temporary idempotency bridge from SPEC-BE-006 and no Mobile/Admin/later-Spec implementation. |

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC-001 | PASS | Migration order, clean reset, checksums, pgTAP 019, and write-route contract. |
| AC-002 | PASS | Clean PostgreSQL 17 reset/lint, pgTAP 22/606, live ownership/invariant suites. |
| AC-003 | PASS | Golden posting, randomized reconstruction, command lifecycle, and reconciliation evidence. |
| AC-004 | PASS | `atomicity.md` and live boundary fault-injection rollback assertions. |
| AC-005 | PASS | Canonical replay/mismatch/in-progress/expired/ambiguous/restart coverage in unit and live concurrency suites. |
| AC-006 | PASS | `concurrency.md`; same-account/opposite-transfer/refund/reversal/version/serialization cases have zero lost or partial effects. |
| AC-007 | PASS | `security.md`; complete live owner/nonowner/anonymous/client/worker/Admin matrix. |
| AC-008 | PASS | Runtime OpenAPI, internal contracts, representative client mapping, and zero client-source diff. |
| AC-009 | PASS | `reconciliation.md`; confirmed/pending drift detected once per incident, retry/restart works, no repair occurs. |
| AC-010 | PASS | `performance.md`; 100k/200k data, bounded plans/payloads and all P95/P99 thresholds pass. |
| AC-011 | PASS | OWASP/security suites, type/lint, dependency audit, nonroot/read-only container checks, independent review, and immutable-tag Trivy HIGH/CRITICAL scan show no open exploitable Critical/High finding. |
| AC-012 | PASS | `recovery.md`; clean upgrade, failure/forward fix, checksums, N-1, write disable, queue/worker replay, backup restore, reconciliation. |
| AC-013 | PASS | Platform and ledger runbooks plus executable observability contract cover metrics, owners, dashboards, alerts, rollback, and incident closure. |
| AC-014 | PASS | `remote.md`: exact main run 33311567050 and immutable tag run 33313879571 pass; image `sha256:5bf639c...`, Trivy, CycloneDX SBOM, Cosign signatures/attestations, and SLSA provenance are retained with artifact IDs and hashes. |
| AC-015 | PASS | Scope inventory below; no Phase 06 resource beyond idempotency and no client/later-Spec feature. |

## Success criteria

| Criterion | Result | Evidence |
|---|---|---|
| SC-001 | PASS | Every duplicate/concurrent/restart/ambiguous-response fixture yields one effect and the completed replay. |
| SC-002 | PASS | Golden, randomized, concurrent, restore, migration, and 100k/200k projections reconcile 100 percent. |
| SC-003 | PASS | All service-precheck and database-race stale versions reject without overwriting the winner. |
| SC-004 | PASS | Immutable-tag create P95/P99 17/32 ms and transfer 16/28 ms; every latency and payload ceiling passes. |
| SC-005 | PASS | Complete live authorization matrix exposes no cross-owner/Admin/anonymous/worker read or write. |
| SC-006 | PASS | Every seeded confirmed/pending discrepancy appears within one bounded cycle with alert/event evidence and no repair. |
| SC-007 | PASS | N-1 application, failed migration, backup/restore, rollback, and replay procedures preserve all committed history/outcomes/balances. |

## Owned resource inventory

- Tables: `public.transactions`, `public.transaction_postings`,
  `public.account_balances`, `audit.transaction_revisions`.
- Temporary SPEC-BE-006 contract only: `private.idempotency_keys` and
  `lookup_idempotency_key`, `claim_idempotency_key`,
  `complete_idempotency_key`.
- Ledger functions: `post_transaction`, `transfer_funds`,
  `revise_transaction`, `refund_transaction`, `reverse_transaction`,
  `soft_delete_transaction`, `restore_transaction`,
  `post_opening_transaction`, `reconcile_account_balance`, plus minimum private
  helpers for current account IDs and Admin exclusion.
- Protected schema: posting/revision immutability, projection/header guards,
  posting-shape constraints, indexes, forced RLS, security-invoker
  `v_account_balance_summary`, minimum grants, and checksum entries.
- HTTP: bounded transaction list/search/detail/create/revise/refund/reverse/
  delete/restore, transfer creation, and account summary/opening handoff.
- Worker/operations: `ledger.reconcile`, statement timeout, metrics, dashboards,
  alerts, discrepancy/write-disable/forward-fix/rollback/restore runbooks.
- Atomic evidence: audit revisions/security records and outbox events
  `transaction.created`, `transaction.revised`, `transaction.deleted`,
  `transaction.restored`, `transaction.reversed`, `transaction.refunded`,
  `transfer.created`, `balance.changed`, `ledger.reconciliation_failed`.

## Definition of Done checklist

- [x] Spec, plan, tasks, research, data model, contracts, checklists, analysis,
  Constitution, and Master Plan are mutually consistent with no open critical
  decision.
- [x] The idempotency prerequisite precedes writes and is forward-compatible;
  no other Phase 06/later behavior exists.
- [x] All owned resources satisfy FR-001 through FR-023.
- [x] Every locally executable test class passes; zero skip/external gap is
  counted as pass.
- [x] Financial invariants reconcile, alternate writes are denied, and every
  accepted security/atomicity/concurrency review finding is closed.
- [x] Mobile/Admin compatibility passes without source implementation changes.
- [x] Metrics, alerts, dashboards, runbooks, rollback, restore, and
  reconciliation procedures are implemented and exercised.
- [x] Implementation `db5066e` plus local-evidence `82a61ba` were verified and
  pushed to `origin/codex/spec-be-005` without rewriting history.
- [x] Exact main/tag CI, immutable image, SBOM, vulnerability scan, signature,
  provenance, and attestations pass; identifiers and hashes are retained in
  `remote.md`.

## Scope and preservation inventory

The implementation adds four ordered migrations, pgTAP 019-022, one concrete
ledger module, ledger test/runbook/spec artifacts, and the minimum account-
opening/platform/release-pipeline integrations named by the plan. Existing
Mobile and Admin source directories have no diff. No dependency, sync cursor,
client mutation, tombstone, cleanup job, cross-currency execution, later-Spec
resource, or unrelated application feature was added.

`git diff --check` and migration checksum verification pass. The isolated
worktree is the only checkout used for writes. The primary checkout at
`D:\MY Work\0Part_Time\MASREFY _Final` retains its pre-existing modified and
untracked state; it was never cleaned, reset, moved, staged, committed, or used
for Phase 05 edits.

## Explicit external-only evidence

The following previously documented SPEC-BE-002 gaps remain external-only and
are neither Phase 05 blockers nor passes: Apple Team ID/iOS registration; two
protected Phone/OTP identities and the full three-user matrix; hosted canonical-
schema proof; provider rotation/outage rehearsal; deployed webhook secret/URL;
and protected historical release evidence. Managed production PITR timing and a
real traffic rollback require protected infrastructure/approval and are not
substituted for the passing local backup/N-1 procedures.
