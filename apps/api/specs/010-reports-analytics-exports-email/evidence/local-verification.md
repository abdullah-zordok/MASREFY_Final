# Local Verification

Date: 2026-09-04
Scope: SPEC-BE-010

## Passed

- `npm run verify`: exit 0. TypeScript, ESLint, k6 syntax, build, migration
  checksums, dependency high-severity threshold, and security workflow-pin checks
  passed. Jest totals were 103/103 unit suites (773 tests), 54/54 contract
  suites (172 tests), 13 integration suites passed with 62 live-database suites
  skipped (43 passed, 159 skipped), 23 E2E suites passed with 14
  environment-dependent suites skipped (33 passed, 32 skipped), and 26 security
  suites passed with one environment-dependent suite skipped (106 passed, 8
  skipped).
- Phase 10 focused suites: unit 10 suites/69 tests, contract 6/15, security 4/11,
  SMTP 4/14, recovery 1/3, and stress 1/1 passed. The focused integration run
  passed 4 suites and skipped 4 live-database suites (13 passed, 9 skipped).
- Phase 10 source/test Prettier check and `git diff --check`: exit 0.
- Repository-wide `npm run format:check`: exit 0 after mechanically formatting
  three tracked baseline files and excluding the protected, untracked
  `pnpm-lock.yaml` from formatting. API typecheck remained green; the two
  affected live-database specs loaded successfully and skipped because the
  database is unavailable.
- `npm audit --audit-level=high`: exit 0 with one Moderate `qs` advisory and no
  High/Critical advisory.
- Diff secret-pattern scan: zero candidate credential/private-key hits. Diff path
  scan: zero SPEC-BE-011+ or notification-owned paths.

## Pending executable gates

Docker Desktop 4.88.1 currently recreates inaccessible Unix-socket reparse
points before its Linux engine starts. Consequently clean Supabase reset/lint,
latest pgTAP/RLS, live query/load measurements, migration/rollback/restore, and
container image/scan/SBOM checks have not run against the final sources. These
are release blockers, not waived or simulated passes.
