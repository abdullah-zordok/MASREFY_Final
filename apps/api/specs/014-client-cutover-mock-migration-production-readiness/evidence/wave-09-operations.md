# Wave 9 — Operations

Status: local implementation and verification for T113–T122 are complete. T123 remains open until the implementation commit is pushed and required CI succeeds for its exact SHA.

- Base and rollback SHA: `74a5c527e869b7c204d44801da9b91f78ffc9a48` (accepted Wave 8 evidence SHA).
- No Phase 14 endpoint, DTO resource, database object, migration, worker, event, dependency or generic cutover store was added.
- Billing, Stripe, checkout, paid entitlements and subscription management remain inactive; every Mobile metadata contract requires `billingAvailable: false` and the related free-only literals.

## Implemented contracts

BE013 OpenAPI now validates real incident status/severity and update bodies without invalid closed-schema composition. Feature percentage cohorts are a stable SHA-256 bucket derived from the authenticated Clerk subject in the existing evaluator/meta context. Security-invariant flag keys are always disabled with `invariant_blocked`; no new cohort service or persistence was added.

Mobile production selection consumes the strict Clerk-authenticated `/api/v1/meta` contract. It validates API/server/version fields and every free-only capability literal, uses a 30-second cache with ETag revalidation, and throws explicit unavailable errors instead of fabricating fallback metadata. The cache is bound to the authenticated session through a SHA-256 token digest, preventing cohort metadata reuse after token changes; a focused regression test covers this boundary. `AppShellProvider` refreshes metadata after authenticated restore and foreground resume. The live mapper participates in redacted structural shadow comparison and the cutover policy retains the accepted Wave 8 rollback version.

Admin system-health, recovery, providers, queues, jobs and schedules use strict BE013 resources. Exact IDs, cursor/filter totals, `operations.jobs` P95 budget, evidence scope/age and server values are preserved; absent freshness, timestamps, totals, impact and timelines remain unknown rather than synthesized. Job actions use exact operation permissions. Governance uses strict BE003 Admin/invitation/role/permission resources and strict BE013 setting/flag/maintenance resources with actor-scoped cache/state, complete bounded cursors, exact redaction, multi-field settings, percentages, targeting rules, schedules, versions and reasons. Incident lookup traverses bounded cursors and only supported contain/monitor/resolve mutations map to BE013 PATCH status values. The obsolete mock-only system-health refresh route is removed.

## Local verification receipts

| Gate | Result |
|---|---|
| API operations unit | 5 suites / 40 tests passed |
| API operations contract/OpenAPI instance | 8 suites / 13 tests passed |
| API operations security | 2 suites / 4 tests passed |
| API cache/performance/stress | Cache 1/1; performance 2/2; stress 2/2; `perf:check:operations` passed with query-plan output |
| API recovery | 3 suites / 3 tests passed when run alone. An earlier overlapping run failed while the performance process temporarily revoked database roles; recovery was rerun serially after that process finished, as required |
| API integration and E2E | Full integration: 93 suites / 239 tests passed; full E2E: 41 suites / 70 tests passed |
| API static gates | Typecheck and ESLint passed |
| Mobile Wave 9 focus | Platform metadata/AppShell focus passed; final cutover/metadata focus: 2 suites / 19 tests passed |
| Mobile full Jest | 435 suites / 2,030 tests passed with a 30-second runner timeout; known open handles required `--forceExit` |
| Mobile static gates | Typecheck passed; ESLint reported 0 errors and 78 pre-existing warnings; every frontend-quality boundary passed across 958 files |
| Mobile live production export | 125 routes / 184 files exported to `C:\Users\DELL\AppData\Local\Temp\masarifi-phase14-wave9-final-986574a804de4826bf4af342cbaf9772` |
| Admin operations focus | 8 suites / 72 tests passed before the full run; final security/live-contract focus: 2 files / 12 tests passed |
| Admin full Vitest | 81 files / 865 tests passed |
| Admin static gates | Typecheck and ESLint passed |
| Admin valid live production build | 82 routes generated with `NEXT_PUBLIC_CLIENT_MODE=live`, mocks disabled, HTTPS API URL and structurally valid non-secret Clerk configuration |
| Admin Playwright performance | 1/1 passed |
| Admin full Playwright | 590-case matrix completed with 310 passed, 280 intentionally skipped and 0 failed. Each of the five projects ran against a fresh dev server to avoid cumulative Next.js development-server heap exhaustion; the one cold mobile chunk-load infrastructure failure passed alone and the full mobile project rerun then completed 59 passed / 59 skipped / 0 failed |

## Production scans and external limits

The fresh Mobile export has zero matches for secret-shaped values, server secret variables, direct OpenAI/OpenRouter/Supabase/PostgreSQL endpoints, local PostgreSQL hosts or the obsolete system-health refresh route. It contains exactly one live API host and one `/api/v1/meta` caller. Source scanning finds no production operations consumer importing a mock service; the only Mobile app mock import is the explicit foundation capture/demo route.

The valid Admin production build contains no dummy Clerk secret value in static client output and no `sb_secret_*`, service-role value, database URL, direct OpenAI/OpenRouter/Supabase endpoint or obsolete system-health refresh route. Clerk SDK bundles retain public validation/environment symbol names, and demo/test MSW chunks remain packaged behind the production-rejected central mock provider; neither is recorded as a credential or reachable production fallback.

## Security review

The first immutable Wave 9 diff scan (`a50130d4-2254-4dd1-8364-eb8dbbc358fd`) found one medium-severity, high-confidence cross-session cohort-cache issue. The cache was repaired at the shared lookup boundary and protected by a token-change regression test. A final stable-tree immutable scan (`5de78c1d-f13e-464e-a896-5d8d2e247c19`) completed all 39 review items with zero findings and no warnings. Its sealed snapshot digest is `codex-security-snapshot/v1:sha256:9591602ad7d5e52a1f4ebc9fa95a0a4f8ae36596901f1533287543b9eee1bd4a`.

Hosted Clerk/Supabase/Admin MFA, real provider dashboards/alerts, deployed percentage cohorts/observation/rollback, physical-device minimum-version/maintenance behavior and hosted backup/PITR/regional DR remain open in [external gates](external-gates.md). Local fixtures and disposable-database recovery are not represented as hosted or physical proof.

Pre-commit preservation requirement: `apps/mobile/src/services/contracts/assistant-notifications-service.ts` must remain SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, the assistant file and `apps/admin-web/public/mockServiceWorker.js` remain excluded from staging.

## Remote acceptance

Accepted on `main` at exact SHA `86a64c4c3f70bd9f8cd2d388144be470f90c7ff7` by required workflow run `34593905513`. Application, database, Admin, Mobile, sentinel redaction, secret scanning, image build and all five Admin Playwright projects completed successfully; signed release evidence was correctly skipped for the non-tag push.
