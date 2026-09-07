# Phase 13 local verification

Date: 2026-09-07

Base: `ddec10683e88a3fd5e471f1d627e5ed3676a14f3` on synchronized `main`

Profile: Windows 11, Node 24.16.0, npm 11.17.0, Docker Engine 29.7.2, local Supabase/PostgreSQL 17

All fixtures are synthetic and redacted. No hosted-success claim is derived from local execution.

## API and database

| Gate | Result |
|---|---|
| `npm run format:check` | PASS |
| `npm run verify` with the local database and live-database suites enabled | PASS: typecheck, lint, k6 syntax, 117 unit suites/877 tests, 70 contract suites/203 tests, 89 integration suites/221 tests, 41 E2E suites/70 tests, API/worker/migration builds, checksums, dependency threshold, 42 security suites/143 tests |
| clean `npm run db:reset` | PASS through `20260906130000_phase13_operations.sql` |
| `npm run db:lint` | PASS, zero errors across `public`, `private`, and `audit` |
| `npm run test:db` | PASS: 58 files / 1,804 pgTAP assertions |
| `npm run migration:checksums` | PASS after the final checksum update |
| `npm run security:sast` / `npm run security:scope` | PASS; scope project 9 passed / 4 pre-existing conditional skips |
| `npm run test:container` | PASS: 10 suites / 22 tests |

`npm audit --audit-level=high` passed its configured release threshold. It reports one transitive moderate `qs` advisory; no High/Critical dependency issue is present.

## Performance and cache

`perf:check:operations`, `test:performance:operations`, `test:stress:operations`, and `test:cache:operations` passed. The runner used the real operations controller/service/repository and local database, seeded 10,000 schedules plus 10,000 provider observations, and asserted all required EXPLAIN index names. Load recorded 2,419 successful requests at p95 26.438 ms / p99 33.020 ms; stress recorded 10,480 at p95 66.958 ms / p99 73.776 ms. Full figures and the Specs 001-011 cross-domain inventory are in `performance.md`.

## Recovery and release image

- The live recovery project passed 3 suites / 3 tests, including independent Supabase SQL dump, destructive test-row deletion, `psql` restore, corruption rejection, forced-RLS verification, and durable worker replay.
- The N-1 backend image built from `ddec10683e88a3fd5e471f1d627e5ed3676a14f3`, started against the upgraded database, became healthy, and returned HTTP 200 from `/health/live`; image ID `sha256:3476c9212a85e8f87dd2c5b189bb9135e48748f0b5a4aea4970ac2529294a80d`.
- The current image built and passed all container contracts; image ID `sha256:584c3ad3727b7b05cdca5e8cac486b04a23c7666f11dda6555def62eefe6e54d`.
- Trivy 0.70.0 with `HIGH,CRITICAL`, `--ignore-unfixed`, and exit code 1 reported 0 vulnerabilities and exited 0.

Hosted encrypted backup retention, PITR, cross-region DR, production credential rotation, traffic switching, and provider-console evidence are external/manual required. They are not represented as passed.

## Admin and Mobile

| Surface | Result |
|---|---|
| Admin typecheck/lint | PASS |
| Admin Vitest | PASS: 73 files / 800 tests |
| Admin production build | PASS: 82 routes; production mock mode is hard denied |
| Admin Playwright | PASS: 311 passed / 284 viewport-conditioned skips across the 595-case matrix |
| Mobile typecheck/lint | PASS; lint retains 79 pre-existing warnings and zero errors |
| Mobile quality boundaries | PASS across all repository boundary scripts |
| Mobile Jest in band | PASS: 419 suites / 1,722 tests |
| Mobile native/participant/final-consistency gate | EXTERNAL/MANUAL: Android native, iOS native, participant study, and final end-to-end consistency are correctly reported `blocked without current exception` by the repository gate |

The first unconstrained parallel Mobile runs each exposed a different timing-sensitive legacy UI test; both focused reruns passed and the required deterministic `npx jest --runInBand` full run passed all 1,722 tests. The Admin matrix initially exposed one dev-toolbar selector leak; scoping the accessibility assertion to the main content fixed the root cause and the full rerun passed. Remote closeout then exposed invalid nested paragraph markup in the shared communication text component; the inline-root regression, 7/7 focused unit tests, and the three implicated tablet suites (15 passed / 9 expected skips) passed before the five viewports were isolated into successful remote matrix jobs.

## SpecKit and scope

The final analyze/converge pass checked 50 functional requirements, 10 success criteria, 110 unique sequential tasks, 109 referenced paths, 20 OpenAPI paths, 24 operations, and all 56 Constitution MUST statements. Three initially missing evidence paths were the planned `verification.md`, `reviews.md`, and remote-CI document; local evidence is now present and `remote-ci.md` is created only after an immutable pushed commit exists. No locally actionable convergence task remains, so converge appended nothing.

The diff contains no Redis, Stripe/billing job/provider/metric, SPEC-BE-012 implementation, or SPEC-BE-014 implementation. Free-only capabilities remain literal false for billing, checkout, subscriptions, promotions, and paid entitlements.

## Preserved user-owned paths

- `.agents/plugins/`
- `apps/api/pnpm-lock.yaml`
- `apps/api/pnpm-workspace.yaml`
- `apps/api/supabase/`
- `apps/mobile/src/services/contracts/assistant-notifications-service.ts` (SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`)

These paths remain unstaged and outside Phase 13 ownership.
