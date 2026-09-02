# Phase 08 Verification Quickstart

Run from the repository root with Docker/Supabase available.

```powershell
npm --prefix apps/api ci
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run lint
npm --prefix apps/api run typecheck
npm --prefix apps/api run test
npm --prefix apps/api run test:contract
npm --prefix apps/api run test:e2e
npm --prefix apps/api run test:migration
npm --prefix apps/api run test:performance
npm --prefix apps/api run test:stress
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run test
npm --prefix apps/admin run lint
npm --prefix apps/admin run typecheck
npm --prefix apps/admin run test
```

Use the actual script names from `package.json` when a grouped root command exists;
the tasks file records the authoritative commands after implementation.

Required evidence includes clean rollback/forward migration, restore/recovery,
RLS/grants, hostile payloads, parser corpus, duplicate/idempotent decisions, worker
crash/reclaim, ledger-command-only acceptance, OpenAPI/client contract, local
performance/stress, privacy/support redaction, and remote workflow success.

Live provider credentials/endpoints, hosted environment identities, and live alert
routing remain explicitly external. Their absence must not skip local normalized,
manual, CSV, database, worker, client, recovery, security, or contract gates.
