# Quickstart Validation: SPEC-BE-013

Run from the repository root on synchronized `main`. Commands assume Node.js 24, Docker, Supabase CLI, k6, and project dependencies are installed. Do not add or stage the protected user-owned paths listed in the Spec.

Phase 13 opened from synchronized `main` at `2e2bf13f409e4a891fc3d8072cf07a26d7685392` after the client-remediation and Free-only governance gates completed. The baseline divergence was `0 0`.

Preserve these unrelated user-owned paths exactly as found:

- `apps/mobile/src/services/contracts/assistant-notifications-service.ts`
- `.agents/plugins/`
- `apps/api/pnpm-lock.yaml`
- `apps/api/pnpm-workspace.yaml`
- `apps/api/supabase/`

## 1. Preflight

```powershell
git fetch origin --prune
git branch --show-current
git rev-list --left-right --count main...origin/main
git status --short
node --version
docker version
supabase --version
k6 version
```

Expected: branch `main`; divergence `0 0`; Node 24; only known Phase 13 plus preserved user-owned paths are present.

## 2. Specification and Contract Checks

```powershell
rg -n "NEEDS CLARIFICATION|stripe|billing|subscription|payment|entitlement|checkout|promotion" apps/api/specs/013-performance-caching-observability-operations
npm --prefix apps/api run test:contract -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:openapi
```

Expected: no unresolved clarification; excluded words occur only in explicit negative requirements/tests; operations contracts and OpenAPI drift pass.

## 3. Clean Database and pgTAP

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run migration:checksums
```

Expected: ordered Phase 13 migrations apply on a clean database; lint and all pgTAP tests pass; checksum manifest matches.

## 4. Database Security and Behavior

```powershell
npm --prefix apps/api run test:integration -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:e2e -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:security -- --runInBand --testPathPatterns=operations
```

If `test:security` is represented by the Jest security project rather than a package script, run:

```powershell
npm --prefix apps/api exec -- jest --selectProjects security --runInBand --testPathPatterns=operations
```

Expected: registration/ownership, concurrent claims, retries/dead letters/cancel, provider redaction, incident/settings/flags/maintenance lifecycles, RLS/grants, permissions/MFA/reason/audit, forged context, and arbitrary-execution rejection pass.

## 5. API and Worker

```powershell
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test:unit -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:contract -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:integration -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run test:e2e -- --runInBand --testPathPatterns=operations
npm --prefix apps/api run build
```

Expected: all commands pass; graceful shutdown drains operations work; no duplicate worker execution or unsafe persisted error occurs.

## 6. Performance and Cache

```powershell
npm --prefix apps/api run perf:check
npm --prefix apps/api run test:performance:operations
npm --prefix apps/api run test:stress:operations
npm --prefix apps/api run test:cache:operations
```

Expected:

- operational reads P95 <=300 ms and P99 <=750 ms under the documented local profile;
- due-job claim P95 <=100 ms for 10,000 schedules;
- no response exceeds 100 items or 720 points;
- production-like plans use the owned indexes;
- cold/warm and invalidation checks pass;
- zero sensitive cache keys/values and zero duplicate claims;
- no Redis or new cache dependency.

Then run every existing domain performance/stress command listed in `package.json` to validate Specs 001-011 without billing metrics.

## 7. Backup, Restore, DR, and Rollback

```powershell
npm --prefix apps/api run test:operations:recovery
npm --prefix apps/api run test:migration
npm --prefix apps/api run test:release-image
```

Expected: corruption rejection, isolated restore, RLS/application verification, domain reconciliation, outbox/worker replay, migration rollback/forward correction, and N-1 image compatibility pass; measured RPO <=900 seconds and RTO <=7,200 seconds. Hosted encrypted-backup/PITR evidence remains external until obtained from the configured environment.

## 8. Admin

```powershell
npm --prefix apps/admin-web run typecheck
npm --prefix apps/admin-web run lint
npm --prefix apps/admin-web test
npm --prefix apps/admin-web run build
npm --prefix apps/admin-web run test:e2e
```

Expected: existing layouts render live Phase 13 schemas through repositories; no direct fixture import; no Stripe provider, subscription queue/settings, or working billing action is exposed by operations capability data.

## 9. Mobile

```powershell
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile test -- --runInBand
```

Expected: strict safe-meta parsing passes; billing/paid/checkout/subscription/promotion remain false; only safe maintenance/resolved flags/AI allowance are accepted; the protected assistant notification contract remains unchanged.

## 10. Security, Container, and Operations Assets

```powershell
npm --prefix apps/api run security:dependencies
npm --prefix apps/api run security:sast
npm --prefix apps/api run security:workflow-pins
npm --prefix apps/api run test:release-image
git diff --check
```

Validate that every operations alert references an existing runbook section and that metric labels contain no identifier dimensions. Run the repository's secret scanner and container vulnerability scan through the standard workflow or their local equivalents.

Expected: zero high/critical release-blocking finding; non-root healthy image; every alert actionable.

## 11. Full Local Gate

Run the complete existing API, database, Admin, and Mobile gate set after affected checks pass. Capture exact command, exit code, timestamp, commit SHA, and artifact path in `evidence/local-verification.md`. Do not convert unavailable hosted evidence into a pass.

## 12. Reviews and Traceability

Perform Clean Code review, test review, security diff scan, and independent code review. Resolve every material finding with tests, then map FR-001..FR-050 and AC-001..AC-024 to code and evidence. Analyze and converge until no locally actionable gap remains.

## 13. Commit, Push, and Remote Gate

```powershell
git status --short
git diff --check
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: complete SPEC-BE-013 operations hardening"
git push origin main
gh run list --branch main --limit 5
```

Use path-scoped staging only. Inspect every staged path and exclude all preserved user-owned paths. Wait for the exact final SHA's required GitHub Actions run to complete successfully. Confirm final divergence `0 0` and record the run URL/SHA in closeout evidence.

## Stop Conditions

Stop only for a genuine external-only requirement: a secret/OTP, provider approval, hosted backup/PITR console evidence, unavoidable physical action, or new concurrent same-main work. Complete every local item first and record the external dependency accurately.
