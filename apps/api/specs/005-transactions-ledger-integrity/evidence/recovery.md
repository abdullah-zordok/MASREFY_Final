# Phase 05 Migration and Recovery Evidence

Date: 2026-08-30 (Asia/Riyadh)
Target: disposable local Supabase database and Docker runtime

## Executed results

- `npm run db:reset`: PASS. All migrations through
  `20260830080300_phase05_ledger_access.sql` applied in order from an empty local
  database and containers restarted successfully.
- `ledger-recovery.e2e-spec.ts`: 5 tests PASS. The suite verified immutable
  migration order/checksums, accepted the released Phase 04 migration prefix as
  N-1 compatible, removed Phase 05 resources inside a transaction, reapplied the
  four Phase 05 migrations, and rolled the rehearsal back without changing the
  working database.
- The production migration runner rejected an injected divide-by-zero migration
  as `MIGRATION_APPLY_FAILED`; neither its table nor history row remained. The
  corrected forward migration then committed exactly one table and history row.
  The probe was removed after verification. No down migration was used.
- The N-1 Phase 04 account select contract returned the expected owner row and
  columns against the Phase 05 schema.
- `backup-restore.e2e-spec.ts` plus the recovery suite: 6 tests PASS. The local
  Supabase data dump restored every seeded outbox row while definitions, grants,
  storage buckets, and the PGMQ queue remained unchanged. Restore now uses
  `ON_ERROR_STOP=1`; a duplicate or partial restore cannot be reported as pass.
- The ledger incident rehearsal created an opening entry, backed up its
  projection, injected confirmed-balance drift, detected it, leased the alert,
  restored the projection, revoked financial-write execution, proved the write
  failed with SQLSTATE `42501`, released the retained alert, reclaimed it after
  the simulated worker restart, and reconciled successfully. The surrounding
  transaction rolled back every fixture and temporary privilege change.
- A final bounded worker-role reconciliation checked 202 performance accounts;
  mismatches were exactly 0. The command ran in a transaction and rolled back its
  `reconciled_at` updates.

## External gates not counted as pass

- Managed production backup/PITR restore duration and approved RPO/RTO require
  the protected hosted Supabase environment and release approval.
- Launching the previous signed production digest and switching real traffic is
  a protected deployment action. Local N-1 schema/query compatibility passed;
  immutable digest, CI, signature, provenance, and attestation evidence remains
  gated on the final main/tag workflow.
- Previously documented SPEC-BE-002 Apple registration, protected Phone OTP
  identities, hosted canonical-schema proof, provider outage/rotation, deployed
  webhook secret/URL, and old protected tag evidence remain external-only and
  are not reclassified as Phase 05 failures or passes.
