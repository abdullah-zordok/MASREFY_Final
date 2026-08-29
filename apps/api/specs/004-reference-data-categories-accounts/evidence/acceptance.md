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
