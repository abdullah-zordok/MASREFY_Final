# Engagement migration and recovery

Apply Phase 11 migrations in timestamp order after a backup. Validate on a clean database, reapply to prove idempotent deployment tooling, and run pgTAP, checksum, query-plan, API N-1/worker N compatibility, and privacy reconciliation checks.

These migrations create persistent data and have no destructive down migration. If deployment fails, keep the old API/worker version, repair forward with a new migration, and restore from the verified backup only for corruption. Reconcile delivery leases, campaign uniqueness, orphan attachments, internal-note grants/publication, and published-content visibility before reopening traffic.
