# Recovery evidence

| Scenario | Rehearsal / safe outcome |
| --- | --- |
| Clean migration and checksum | clean reset, migration apply, schema compatibility, checksum verification, lint, and pgTAP passed before final host WSL failure; CI reruns from empty state |
| Failed migration | transaction rollback and additive forward-fix convention retained; immutable checksum gate rejects history edits |
| N-1 image / route disable | additive schema remains compatible; `MASARIFI_ADMIN_ROUTES_ENABLED=false` hides privileged routes while workers/recovery remain available |
| Backup/restore, RPO/RTO | existing backup/restore E2E and Phase 01 operational target retained; CI runs migration/backup suites on the final schema |
| Bootstrap | advisory lock, route-disabled requirement, two-person inputs, drift hash, repeat safety, and recovery are in the bootstrap runbook |
| Worker crash/retry | claims use status/age, `FOR UPDATE SKIP LOCKED`, bounded batches, idempotent handlers, and reconciliation-safe terminal states |
| Clerk outage | local database authorization remains fail closed; delivery/session failures return safe codes and invitation cleanup is audited |
| Storage outage | export cannot become ready before upload and HEAD validation; partial object cleanup/retry is safe |
| Support/alert reconciliation | emergency revoke and immutable-evidence reconciliation procedures name owner, closure evidence, and rollback |
| Deletion/retention reconciliation | per-handler outcomes, cooling-off, and immediate hold rechecks prevent untracked irreversible work |

No destructive rollback or invented legal-retention policy is part of the recovery plan.
