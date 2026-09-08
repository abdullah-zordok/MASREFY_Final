# Phase 14 Rollback Plan

## Per-Wave Preconditions

1. Record the current accepted `main` SHA, client/config/image version, database migration checksum set, and pending-operation counts.
2. Prove the accepted version can read current server responses and existing Mobile SQLite data after the additive owner-namespace and SQLCipher correction, including the legacy global-store migration path.
3. Capture redacted baseline counts/hashes and current domain reconciliation.
4. Confirm rollback configuration selects only an already accepted live adapter/image in production.

## Rollout Sequence

| Stage | Reads | Writes | Exit gate |
|---|---|---|---|
| Shadow | Live plus accepted baseline; user sees accepted result | Accepted path only | Strict contract match, zero financial difference, safe redacted telemetry |
| Internal | Live result for server-derived internal cohort | Existing accepted write path unless separately enabled | Functional, security, performance, and provider gates pass through observation window |
| Bounded write | Live result and live writes for stable bounded cohort | Domain API with original idempotency/version identities | No duplicate/lost effects; reconciliation exact; rollback rehearsal passes |
| Full | Live for all eligible production traffic | Live domain API | Full observation window and all wave gates pass |

## Immediate Stop Conditions

- Any financial/report mismatch, rounding, dropped field, duplicate effect, or Last Write Wins.
- Cross-user access, incorrect Admin authority, secret/PII disclosure, mock/debug selection, or exploitable Critical/High finding.
- Contract/schema drift, unknown-state coercion, fabricated value, local data loss, failed retry/reconnect, or non-idempotent replay.
- Owning performance, provider, availability, audit, alerting, recovery, or observation threshold breach.

## Rollback Procedure

1. Freeze cohort advancement and record the safe reason code, affected wave/version, redacted counts, and correlation identifiers.
2. Select the recorded `rollbackVersion` for the affected client/config/image; do not change database state or operation IDs.
3. Stop new writes only where the owning domain's accepted fail-closed procedure requires it; allow safe reads/manual entry that remain valid.
4. Reconcile server ledger/domain state with client acknowledgements and pending queues.
5. Resume pending/retried operations using their original idempotency keys and expected versions.
6. Verify the rollback version can bootstrap/delta-sync all new server records and tombstones without loss or duplication.
7. Run focused security, contract, data-preservation, and reconciliation gates; retain redacted evidence.
8. Correct forward in the owning Spec or adapter, repeat shadow/internal/bounded stages, and never rewrite pushed history.

## N-1 and Data Compatibility

- N-1 clients must ignore only fields the owning contract marks forward-compatible; unknown business states and financial fields remain explicit failures.
- Mobile-owned SQLite corrections are additive/idempotent, preserve the legacy global store, establish owner isolation and encryption before live acceptance, and are never reversed destructively during client rollback.
- Server commits remain authoritative; rollback never deletes newly committed customer data.
- Drafts, pending mutations, conflicts, sync cursors, device IDs, PIN/biometric material, and device-only preferences retain their existing ownership and encryption.

## Recovery Evidence

Per-wave evidence records the exact rollback build/config, before/after local record and pending counts, domain reconciliation, replay outcome, observation interval, commands, and pushed SHA. Local database restore tests use only a disposable instance. Provider PITR/cross-region, physical-device, registry, signer, and store rollback remain external until executed by the responsible environment owner.
