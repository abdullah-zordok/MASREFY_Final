# Phase 05 Verification Quickstart

Run commands from `apps/api` unless a command says otherwise. Never represent an
environment-gated skip as a pass; record the missing environment or protected
identity beside the command result.

## Prerequisites

- Node.js 24 and the repository lockfile.
- Docker Desktop and Supabase CLI for live database/container gates.
- A clean disposable local Supabase project; never target production.
- The standard SPEC-BE-001 database environment variables for live Jest suites.

```powershell
npm ci
npm run typecheck
npm run lint
```

## Fast TDD loop

```powershell
npm run test:unit -- --testPathPatterns=ledger
npm run test:contract -- --testPathPatterns=ledger
```

Each behavior is added red-first. For any unexpected failure, isolate the
smallest reproducer and fix the shared root cause before rerunning the narrow
test and then its owning suite.

## Database gates

```powershell
npm run supabase:start
npm run db:reset
npm run db:lint
npm run test:db
npm run migration:checksums
npm run test:integration -- --testPathPatterns=ledger
npm run test:e2e -- --testPathPatterns=ledger
```

pgTAP files `019` through `022` must prove table/constraint/index/trigger shape,
idempotency and command atomicity, RLS/grants/authorization, and reconciliation/
rollback invariants. Live concurrency tests must cover duplicate replay, stale
versions, simultaneous same-account writes, opposite-direction transfers, and
an injected failure with zero residual financial/audit/outbox/idempotency rows.

## Performance and query plans

```powershell
npm run perf:check
npm run test:performance:ledger
```

The seeded run uses 100,000 owner transaction headers and 200,000 postings. It
must retain approved index plans without sequential scans on bounded owner-page
paths; keep list/account-detail P95 <=300 ms, create P95 <=350 ms, transfer P95
<=500 ms, and critical database mutation P95 <=150 ms; meet the specification's
P99/payload ceilings; and show no deadlock or lost update in the declared
contention profile.

## Full local release candidate

```powershell
npm run verify
npm run test:container
npm run test:release-image
```

From the repository root, review `.github/workflows/backend-foundation.yml` and
confirm the Phase 05 jobs run clean reset, pgTAP, live ledger tests, migration and
backup/restore, performance, container, image scan, SBOM, signature, and
provenance gates. The signed evidence job is tag-protected and can only be marked
passed from its actual CI result.

## Recovery rehearsal

Use `docs/runbooks/ledger-reconciliation-recovery.md` and the shared
`docs/runbooks/migration-and-recovery.md` against disposable state:

1. back up a populated Phase 05 database;
2. restore into an empty target;
3. run bounded reconciliation and compare transaction/posting/projection,
   audit, outbox, and idempotency counts;
4. demonstrate application rollback compatibility with the previous image;
5. correct schema defects only through a new forward migration.

Close the gate only with zero reconciliation mismatches, no partial command
effects, matching migration checksums, and an explicit record of every skipped
external-only identity/provider/tag gate.
