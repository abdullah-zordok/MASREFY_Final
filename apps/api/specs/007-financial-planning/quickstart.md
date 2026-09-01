# Phase 07 Financial Planning Validation Quickstart

All commands are local/non-production by default. Run from the repository root
unless the command explicitly changes directory. Never use production secrets or
push under this goal.

## 1. Baseline And Scope

```powershell
git branch --show-current
git rev-parse HEAD
git rev-list --left-right --count origin/main...HEAD
git status --short
git worktree list
```

Expected: branch `main`; Phase 06 commits are present; no Phase 07 worktree; only
Phase 07 changes plus the preserved unrelated `.agents/plugins/` path.

The checkout does not contain Spec Kit scripts, so `specify/plan/tasks` use the
checked-in templates and feature pointer directly. Verify the pointer:

```powershell
Get-Content apps/api/.specify/feature.json
```

Expected feature directory: `specs/007-financial-planning`.

## 2. Specification And Contract Checks

```powershell
rg -n "NEEDS[ ]CLARIFICATION[:]|T[K]TK|\?{3}|\[FEATURE[ ]NAME\]|\[Phase[ ]NN" apps/api/specs/007-financial-planning
rg -n "^- \[ \]" apps/api/specs/007-financial-planning/checklists
```

Expected: no unresolved specification marker and no unchecked quality item.

Validate YAML and operation uniqueness from `apps/api`:

```powershell
node -e "const fs=require('fs');const yaml=require('js-yaml');const d=yaml.load(fs.readFileSync('specs/007-financial-planning/contracts/openapi.yaml','utf8'));const ops=[];for(const [p,x] of Object.entries(d.paths)){for(const [m,o] of Object.entries(x)){if(['get','post','put','patch','delete'].includes(m))ops.push(o.operationId)}}if(new Set(ops).size!==ops.length)process.exit(1);console.log({paths:Object.keys(d.paths).length,operations:ops.length})"
```

Expected: YAML parses and every operation ID is unique.

## 3. Toolchain And Local Services

```powershell
node --version
npm --version
docker version
wsl --status
cd apps/api
npm ci
npm run supabase:start
```

Expected: Node 24, package install matches lockfile, Docker/Supabase are healthy.
If dependencies are already present, `npm ci` is optional unless lock state
changed.

## 4. TDD-Focused Gates

Run the narrow red test before its production change, capture the expected
missing behavior, then rerun after implementation. Representative commands:

```powershell
cd apps/api
npx jest --selectProjects unit --runInBand --testPathPatterns=planning
npx jest --selectProjects contract --runInBand --testPathPatterns=planning
npx jest --selectProjects integration --runInBand --testPathPatterns=planning
npx jest --selectProjects e2e --runInBand --testPathPatterns=planning
npx jest --selectProjects security --runInBand --testPathPatterns=planning
```

Expected after green: no Phase 07 failure or unexpected skip. Integration/E2E
tests requiring a live database must run with the local Supabase environment and
must not be treated as passing when gated off.

## 5. Database Reset, Lint, And pgTAP

```powershell
cd apps/api
npm run db:reset
npm run db:lint
npm run test:db
npm run migration:checksums
```

Expected: clean reset from zero; Phase 07 migrations apply in order; lint emits
no error; all pgTAP files including 029-032 pass; migration checksums match.

Manual inventory check:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in (
    'salary_profiles','salary_receipts','budgets','budget_categories',
    'obligations','obligation_schedule_items','obligation_payments',
    'obligation_payment_allocations','payment_matches','savings_goals',
    'savings_goal_movements')
order by tablename;
```

Expected: exactly eleven rows and RLS enabled; pgTAP separately proves forced
RLS, grants, policies, and function privileges.

## 6. Live Financial Scenarios

```powershell
cd apps/api
npm run test:planning:integration
npm run test:planning:recovery
```

Expected coverage:

- salary month-end/leap-year, link, correction, duplicate, and reversal;
- overlapping budgets, complete-set allocation, exact spend/refund/transfer and
  missing-FX state;
- schedule idempotency, residual, horizon, overdue, lifecycle;
- partial/multiple/prepayment, duplicate/stale/currency/ownership and reversal;
- match proposal/decision without confidence authority;
- savings contribution/withdrawal/adjustment/reversal and insufficient progress;
- summary isolation/version/payload and reconciliation;
- worker crash/reclaim/fence/poison/shutdown;
- migration failure/forward repair, N-1, backup/restore, and preserved ledger.

Expected: all scenarios pass with zero duplicate/partial effect or unexplained
reconciliation difference.

## 7. Performance And Query Plans

Use the local Supabase administrator connection only:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
$env:K6_DATABASE_URL=$env:DATABASE_URL
cd apps/api
npm run test:performance:planning
```

Expected dataset: >=100k ledger rows, 12 overlapping budgets, 100 obligations
with 24 schedule items, 50 goals. Expected thresholds:

- summary P95 <=400 ms, P99 <=800 ms, payload <=250 KiB;
- list/detail P95 <=300 ms, P99 <=600 ms;
- payment/movement P95 <=500 ms, P99 <=900 ms;
- required owner/period/status/due/link indexes are used;
- no N+1, unbounded result/horizon/allocation, error, or cross-user row.

## 8. Mobile And Admin Parity

```powershell
cd apps/mobile
npx jest --runInBand --testPathPatterns="financial-planning|BudgetJourney|ObligationJourney|PaymentJourney|SalaryJourney|SavingsJourney"
npm run typecheck
npm run lint
```

Expected: API parity/mapping and existing planning journeys pass; representative
SQLite data preserves IDs, versions, lifecycle, links, and safe integer money;
the active provider selection remains unchanged. Existing lint warnings are
recorded separately; no new error is accepted.

Admin contract tests must prove `planning.read` permits only safe summary reads
and that no planning mutation route/UI/provider was added.

## 9. Full API And Image Gates

```powershell
cd apps/api
npm run format:check
npm run verify
npm run test:db
npm run test:planning:integration
npm run test:planning:recovery
npm run test:performance:planning
npm run test:container
npm run test:release-image
```

Expected: every locally executable gate exits 0. The release image runs as the
pinned non-root user, contains API/worker/migration entry points, and has no
secret or source-only debug configuration.

## 10. Review And Completion Audit

Review the complete diff with clean-code, test-quality, security, and independent
review gates. Then run:

```powershell
git diff --check
git diff --stat 2eeb00bdc6687602c2fb807b88eeb1f71bfc5807..HEAD
git status --short --branch
rg -n "^- \[ \]" apps/api/specs/007-financial-planning
```

Expected before commit: no whitespace error, no unresolved locally executable
task/DoD item, no unrelated staged path, and all evidence links resolve.

Commit only scoped Phase 07 files directly on local `main`. Do not push, merge,
rebase, create a PR, branch, or worktree. Record remote workflow/registry/tag/
SBOM publication/signature/provenance gates as pending in `evidence/remote.md`.
