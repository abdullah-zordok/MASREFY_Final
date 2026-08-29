# Quickstart: SPEC-BE-004 Verification

Run from the repository root unless a command changes directory. No real Clerk
identity, OTP, hosted Supabase, or FX provider secret is required for local
deterministic verification.

## 1. Baseline and Scope

```powershell
git branch --show-current
git fetch origin main
git rev-list --left-right --count main...origin/main
git status --short
```

Expected before implementation: `main`, `0 0`, and only Phase 04 plus preserved
unrelated work. Reject any later-Spec table/route/client path.

## 2. Install and Static Gates

```powershell
npm --prefix apps/api ci
npm --prefix apps/api run format:check
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run perf:check
npm --prefix apps/api run build
npm --prefix apps/api run migration:checksums
```

Expected: zero errors, no new dependency, and all checksums verified.

## 3. Clean Database and pgTAP

Prerequisite: Docker Desktop and Supabase CLI available.

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
```

Expected:

- all migrations apply in order from clean state;
- second seed application changes zero deterministic rows;
- preference currency FK is validated;
- all five tables force RLS and have minimum grants;
- owner/non-owner/anonymous/Admin/worker matrices pass;
- immutable rates and category/account constraints reject invalid operations.

Do not report database-backed Jest skips as passing when this environment is not
running.

## 4. Focused Application Tests

```powershell
npm --prefix apps/api run test:unit -- --testPathPatterns=reference
npm --prefix apps/api run test:contract -- --testPathPatterns=reference
npm --prefix apps/api run test:integration -- --testPathPatterns=reference
npm --prefix apps/api run test:e2e -- --testPathPatterns=reference
npm --prefix apps/api run security:scope
```

Expected: DTOs/ETags/events/OpenAPI/client mapping, owner lifecycles, Admin exact
permissions, audit/outbox atomicity, unavailable opening/FX, and no cross-user
access all pass.

## 5. Full Local Gate

```powershell
npm --prefix apps/api run verify
npm --prefix apps/api run test:container
```

Expected: all locally executable suites pass; skips are listed with reason.

## 6. Performance and Query Plans

Run the Phase 04 performance runner after seeding production-like rows:

```powershell
npm --prefix apps/api run test:performance:reference
```

Expected:

- indexed SQL P95 <=50 ms and complete reference/category/account data access
  P95 <=100 ms;
- account HTTP P95/P99 <=300/600 ms and <=150 KiB compressed;
- warm shared-reference cache hit >=95%;
- no unbounded/N+1/active sequential scan on large owner tables;
- cold cache, invalidation, and cache loss remain authorized and correct.

Retain redacted `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence without user
names, notes, last four, or raw rates.

## 7. Recovery and Rollback

1. Reapply seed and prove no duplicate/change.
2. Inject a migration failure before route enablement, apply a forward correction,
   and verify checksums/order.
3. Inject audit and outbox failure into category/account/Admin mutations and prove
   zero partial resource effect.
4. Clear the process cache and prove authorized DB fallback.
5. Leave FX provider configuration absent and prove `FX_UNAVAILABLE` without fake
   metadata or readiness failure for core finance.
6. Start the previous image against additive Phase 04 schema and run health/read
   smoke checks.
7. Reconcile row counts, seed hashes, FK validity, policies, grants, audit/resource
   pairs, and outbox/resource pairs.

Rollback is the previous immutable image plus forward corrective SQL. Never drop
referenced codes, categories, accounts, rates, audit, or outbox history.

## 8. Security and Operations Review

- Review OWASP traceability and all negative RLS/permission cases.
- Verify logs/errors/metrics contain no names, notes, last four, raw rates,
  provider refs, Admin reasons, JWTs, secrets, or stack traces.
- Trigger seed drift, permission denial, audit/outbox failure, latency, cache
  invalidation, and FX unavailable alerts and confirm each has an owner/runbook.
- Confirm no feature flag can bypass auth, RLS, audit, or financial boundaries.

## 9. Completion and Remote Evidence

After every locally executable gate passes, commit and push the Phase 04 diff
directly to `main`. Record remote CI, image/dependency/secret scan, SBOM,
signature, and provenance outcomes. Do not mark missing remote/provider evidence
as passing. SPEC-BE-002's separate Apple/OTP/hosted-provider blockers remain
upstream evidence and are not recreated by Phase 04.
