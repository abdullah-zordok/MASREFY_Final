# Phase 11 Validation Quickstart

Run from the repository root unless a command says otherwise. Do not use or stage
the protected untracked `.agents/plugins/`, `apps/api/pnpm-lock.yaml`,
`apps/api/pnpm-workspace.yaml`, or `apps/api/supabase/` paths.

## 1. Baseline

```powershell
git fetch --prune origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: branch `main`; both revisions equal the recorded base or later verified
Phase 11 commit; only the protected paths plus scoped Phase 11 work are present.

## 2. Artifact gates

```powershell
rg -n "NEEDS CLARIFICATION|TBD|TODO" apps/api/specs/011-notifications-support-content
git diff --check
```

Expected: no unresolved production decision or placeholder; no whitespace error.
Run SpecKit analysis before implementation and SpecKit convergence afterward.

## 3. Database

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run migration:checksums
```

Expected: migrations apply from a clean database; Phase 11 pgTAP structure,
constraints, functions, grants, owner/non-owner/Admin/worker/anonymous RLS,
internal-note/draft/file isolation, and checksum assertions pass.

Then run the documented rollback/forward-reapply harness and N-1 image tests.
Never reverse/drop private customer state as a production rollback.

## 4. Focused API and worker suites

```powershell
npm --prefix apps/api run test:engagement:unit
npm --prefix apps/api run test:engagement:contract
npm --prefix apps/api run test:engagement:integration
npm --prefix apps/api run test:engagement:security
npm --prefix apps/api run test:engagement:recovery
```

Expected: preferences/DST/templates/actions, providers/retry/dedupe/outage,
campaigns, tickets/notes, attachments/scanning, feedback/abuse, content/cache,
OpenAPI/job/event/DTO, RLS/BOLA/BFLA, migration/replay/recovery all pass.

## 5. Provider-independent scenarios

Run deterministic Expo, APNs, FCM, email, and scanner adapters through success,
retryable failure, terminal failure, malformed response, timeout, ambiguous
acceptance, revoked token, outage, and recovery. Snapshot the outbound payload and
prove it contains only event ID, safe title/body, and route key. Scan test fixtures
must include benign files, EICAR, MIME/magic/hash/size mismatch, decompression
limits, and deletion failure. No test prints tokens, credentials, or file bytes.

Real credentials/devices are optional external evidence only. A deterministic
acceptance is never labeled genuine provider delivery.

## 6. Performance and stress

```powershell
npm --prefix apps/api run test:performance:engagement
npm --prefix apps/api run test:stress:engagement
```

Expected: notification/ticket P95/P99 <=400/800 ms; relevant database query P95
<=50 ms with intended indexes; Admin pages <=500/1000 ms; payload bounds pass;
100k-user campaign expands asynchronously in bounded batches; provider/scanner
slowdown and retry storms preserve bounded memory/connections and domain latency.

Retain `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and P50/P95/P99 evidence.

## 7. Client parity

Use the repository's existing Mobile and Admin commands recorded in their package
scripts. At minimum run typecheck, lint, all focused notification/support/content
Jest tests, Admin communications Vitest tests, production build, and focused
Playwright/accessibility/RTL checks. Expected: live adapters pass contract drift,
owned no-ops are gone, drafts persist safely on failure, forbidden fields are
rejected, and production provider selection is unchanged.

## 8. Full local release gates

```powershell
npm --prefix apps/api run verify
npm --prefix apps/api run test:container
npm --prefix apps/api run security:dependencies
```

Also run full Mobile/Admin suites, secret scan, SAST, dependency/image CVE scan,
SBOM generation, migration/recovery, and alert/runbook validators used by the
Backend Foundation workflow. Zero exploitable Critical/High, cross-user access,
note/draft/file leak, unsafe payload, duplicate logical effect, or failing local
gate is allowed.

## 9. Reviews, delivery, and remote evidence

1. Run SpecKit convergence and complete every valid new task.
2. Run clean-code, test-quality, security, and verification reviews; rerun all
   materially affected checks.
3. Commit only scoped reviewed files in narrow Phase 11 commits directly on main.
4. Push normally to `origin/main`; monitor every resulting workflow and fix all
   locally actionable failures forward.
5. Record implementation/closeout SHAs, exact counts/results, CI run, provider/
   device external gates, and explicit confirmation that SPEC-BE-012+ is absent.
