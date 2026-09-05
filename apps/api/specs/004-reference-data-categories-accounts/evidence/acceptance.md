# Acceptance Evidence

Recorded 2026-08-29 for SPEC-BE-004.

## Passing gates

| Command or procedure | Fresh result |
| --- | --- |
| Scoped Prettier check over every Phase 04 changed supported file | Pass |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run perf:check` | Pass |
| `npm run test:unit` | 48 suites, 287 tests passed |
| `npm run test:contract` | 30 suites, 112 tests passed |
| Live `npm run test:integration` | 31 suites, 70 tests passed; 0 skips |
| Live `npm run test:e2e` | 22 suites, 32 tests passed; 0 skips |
| Phase 04 security scope | 1 suite, 4 tests passed |
| `npm run security:workflow-pins` | 14 suites, 71 tests passed |
| `npm run build` | API, worker, and migration builds passed |
| `npm run migration:checksums` | Pass |
| `npm run db:lint` | 0 findings |
| `npm run test:db` | 18 files, 464 assertions passed |
| `npm run test:performance:reference` | Pass at all recorded budgets and indexed plans |
| `npm run image:build` | Pass; image manifest `sha256:632037519ea00bd33dd455b7b68f796ba5d057d43303ec4724865de7050763ae` |
| `npm run test:container` | 5 suites, 11 tests passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run verify` | Pass end to end |
| `git diff --check` | Pass |

The default `verify` invocation intentionally reported 25 integration suites/54
tests and 9 E2E suites/14 tests skipped because it does not opt into a live
database. Those skips are not represented as passes; the separate live commands
above executed every suite/test and passed with zero skips.

## Formatting baseline resolution

The first `npm run format:check` reported 212 pre-existing files. After explicit
user approval, Prettier normalized the 107 files with substantive formatting
differences in the separate commit `adc2f70`; the remaining status noise is Git's
Windows `core.autocrlf` normalization and has no content diff. A fresh
`npm run format:check` now passes across the entire API tree, and `git diff
--check` passes for the Phase 04 diff.

## 2026-09-05 Category Usage Evidence

- Clean `supabase db reset`: PASS, including
  `20260905080000_client_category_usage.sql`.
- Schema lint at warning/fail-on-error: PASS, no schema errors.
- Full pgTAP: PASS, 51 files and 1,633 tests.
- Live category integration: PASS, 1 suite and 3 tests, including stale count,
  cross-owner hiding, two-row merge, and revision evidence.
- API and Mobile focused contract/UI results are recorded in the execution plan.
- Slice commits: `7a12dd42e754fc0294d12fa8663666837f822ac8` and inventory follow-up
  `e47eff88063fc74f35ab9dc7e0651eea59a0063a`, pushed to `main`.
- Remote Backend Foundation run
  `https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33987079570`:
  PASS, including application, database, Mobile, Admin, secrets, redaction,
  image/container, and vulnerability-scan jobs. The superseded first run exposed
  the missing migration-function inventory entries; the exact migration suite
  passed locally and remotely after the follow-up.

## 2026-09-06 Client Item #45 Account Evidence

- Clean reset and schema lint: PASS with migration
  `20260905081000_account_automatic_tracking.sql`.
- Account default/create/update/read, column-level grants, audit/outbox changed
  fields, OpenAPI, BOLA, and migration inventory checks: PASS.
- API full verify: 111 unit suites/819 tests, 63 contract suites/191 tests,
  86 live integration suites/216 tests, 38 E2E suites/67 tests, and
  40 security suites/139 tests all passed.
- Independent review found no release-blocking findings; remote CI remains pending.
