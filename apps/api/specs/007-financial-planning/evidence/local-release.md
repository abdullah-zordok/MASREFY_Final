# Phase 07 Local Release Gates

All commands ran from the repository workspace on 2026-09-01. Live database
tests used the reset local Supabase stack.

## API

| Gate | Fresh result |
|---|---|
| `npm run format:check` | PASS |
| `npm run verify` | PASS: typecheck, ESLint, performance-script syntax, all test projects, three production builds, migration checksums, dependency audit, and workflow-pin security |
| Unit project | PASS: 79 suites, 604 tests |
| Contract project | PASS: 44 suites, 143 tests |
| Integration project | PASS: 54 suites, 138 tests; live database enabled |
| E2E project | PASS: 34 suites, 58 tests; live database enabled |
| Builds | PASS: API, worker, and migration entry points |
| Dependency audit | PASS: 0 vulnerabilities |
| Workflow-pin security | PASS: 19 suites, 94 tests |

No API suite was skipped in the final release run.

## Mobile

| Gate | Fresh result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS with 0 errors and 79 existing `no-require-imports` warnings |
| Planning domain/API parity/import focus | PASS: 3 suites, 19 tests |
| Full serial Jest with controlled 2026-08-31 calendar and 5 s RTL async bound | PASS: 400 suites, 1,557 tests, 0 failures, 0 snapshots; 100.842 s |

The first uncontrolled run exposed six failures outside Phase 07: four report
assertions hard-coded to August while the host clock had advanced to September,
and two slow asynchronous transaction-form assertions under the default 1 s
bound. The controlled rerun used two temporary Jest setup files: a fixed
calendar date with a monotonic `Date.now()` (so idempotency keys remained
unique), and a 5 s React Testing Library async limit. Both setup files were
deleted after the passing run; no Phase 08+ test or production path was changed.

Known console noise remains limited to existing React `act(...)` and Expo
notifications warnings; it produced no test failure. The 79 lint warnings are
pre-existing require-style test/config imports and no new lint error exists.
