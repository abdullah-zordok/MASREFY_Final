# Baseline Evidence

**Captured**: 2026-08-30
**Base revision**: `dfed012743ca0c3c5f760e7b2439dbc0dae9c825`
**Branch**: `codex/spec-be-005`
**Worktree**: `D:\MY Work\0Part_Time\MASREFY Backend Worktrees\backend-spec-be-005`

The base revision matched released `origin/main`. The primary checkout contained
unrelated modified/untracked work, so it was not edited, cleaned, reset, moved,
or included in this Spec. The user-required isolated worktree conflicts with the
Backend Constitution main-only rule and remains the single explicit process
deviation; it does not waive any product, verification, push, tag, or release
gate.

## Dependency and baseline commands

- `node --version` -> `v24.16.0`.
- `npm --version` -> `11.17.0`.
- `npm ci` from `apps/api` -> 831 packages installed; audit reported 0
  vulnerabilities.
- Fresh `npm run verify` from `apps/api`:
  - typecheck, lint, performance-script syntax, build, migration checksums,
    dependency audit, and workflow pin checks passed;
  - unit: 48 suites / 287 tests passed;
  - contract: 30 suites / 112 tests passed;
  - integration: 6 suites / 16 tests passed; 25 suites / 54 tests were explicit
    environment-gated skips;
  - E2E: 13 suites / 18 tests passed; 9 suites / 14 tests were explicit
    environment-gated skips;
  - security: 14 suites / 71 tests passed.

The skipped live database/provider/container/protected-identity paths are not
recorded as passes. Phase 05 adds and executes its locally available live gates
before release.
