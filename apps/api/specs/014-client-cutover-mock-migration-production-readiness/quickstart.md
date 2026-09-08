# Phase 14 Validation Quickstart

This guide validates the artifact package and names the commands used during implementation. It does not claim that provider, device, hosted, or release gates have passed.

## Preconditions

From the repository root:

```powershell
git fetch origin --prune
git branch --show-current
git rev-parse main
git rev-parse origin/main
git status --short
```

Expected before a wave: branch `main`; local and remote SHAs equal; all pre-existing user-owned changes still present and recorded; no other active task owns the checkout.

## Artifact Checks

```powershell
rg -n --glob '!quickstart.md' --glob '!evidence/artifact-analysis.md' "NEEDS CLARIFICATION|\bTBD\b|\bTODO\b" apps/api/specs/014-client-cutover-mock-migration-production-readiness
rg -n "^- \[ \]" apps/api/specs/014-client-cutover-mock-migration-production-readiness/checklists/requirements.md
git diff --check -- apps/api/specs/014-client-cutover-mock-migration-production-readiness apps/api/.specify/feature.json
```

Expected: no unresolved clarification/placeholder or unchecked specification-quality item; no whitespace error. The two excluded files describe the scanner and its historical analysis, so their literal search terms are not findings. Task checkboxes are intentionally excluded until implementation.

## Focused Wave Checks

Each wave uses its focused API/domain tests plus client contract/selector tests. Existing API commands include:

```powershell
npm --prefix apps/api run test:contract
npm --prefix apps/api run test:openapi
npm --prefix apps/api run test:sync:logic
npm --prefix apps/api run test:planning:logic
npm --prefix apps/api run test:ai:unit
npm --prefix apps/api run test:reports:contract
npm --prefix apps/api run test:engagement:contract
npm --prefix apps/api run test:operations:recovery
```

Client focused tests use exact test paths recorded in `tasks.md` and each wave evidence file. Every changed nontrivial mapper leaves one focused regression that fails before the fix and passes after it.

## Client Gates

```powershell
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run check:frontend-quality
npm --prefix apps/mobile test -- --runInBand

npm --prefix apps/admin-web run typecheck
npm --prefix apps/admin-web run lint
npm --prefix apps/admin-web run build
npm --prefix apps/admin-web run test
npm --prefix apps/admin-web run test:e2e
```

Run production builds with explicit live configuration and with each forbidden/missing configuration to prove failure. Playwright's mock-enabled local server is demo/test evidence only and must not be counted as production live evidence.

## Disposable Database Gates

These commands mutate/reset the configured local Supabase project. Run them only after verifying the target is the disposable repository-local instance and no user data is present:

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run migration:checksums
```

Set `MASARIFI_LIVE_DATABASE_TESTS=1` and `DATABASE_URL` only for the designated disposable test database. A skipped live suite is reported as skipped, never passed.

## Full Local Release Gates

```powershell
npm --prefix apps/api run verify
npm --prefix apps/api run test:performance:operations
npm --prefix apps/api run test:stress:operations
npm --prefix apps/api run test:cache:operations
npm --prefix apps/api run test:release-image
```

Add every domain-specific performance/stress/recovery command from the accepted owner quickstarts. The operations commands are explicit because the current main workflow does not run them.

## Delivery Gate

For each wave, review `git diff` and `git diff --cached`, stage only owned paths/hunks, commit directly to `main`, push without force, and record:

```powershell
git rev-parse HEAD
git rev-parse origin/main
gh run list --commit (git rev-parse HEAD) --limit 20
```

Do not begin the next wave until every required workflow for that SHA is successful. A forward-fix commit repeats the same gate.

## External Follow-Up

Use `evidence/external-gates.md` for Clerk/OTP, hosted Supabase, Android/iOS production builds, physical devices, APNs/FCM, SMTP, OpenRouter, Storage/scanner, hosted dashboards/alerts, backup/PITR, registry, signing/provenance, and store approvals. Each open item must name the missing access and exact follow-up procedure.
