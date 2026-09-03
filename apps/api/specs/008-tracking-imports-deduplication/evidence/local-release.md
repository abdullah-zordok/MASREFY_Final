# Local Release Gates

Status: complete for every Phase 08-owned local gate.

Passing evidence obtained:

- API `npm run verify` passed fresh after the final formatting touch: typecheck,
  lint, performance syntax check, unit, contract, integration, E2E, build,
  migration checksums, high-severity npm audit, and security workflow pins.
  Counts: unit 89/678, contract 45/154, integration 6 suites passed and
  50 skipped with 16 passed and 138 skipped, E2E 22 suites passed and 13 skipped
  with 32 passed and 29 skipped, security workflow pins 19 suites passed and
  1 skipped with 87 passed and 8 skipped.
- Admin typecheck, lint, 70-file/787-test Vitest, and 82-route production build
  passed. Phase 08 imports/parsers/accessibility Playwright passed 14 tests with
  31 viewport-policy skips.
- Mobile typecheck, lint, frontend quality, and the clean full serial rerun
  passed 406/406 suites and 1,666/1,666 tests.
- Fresh Supabase `db:reset`, `db:lint`, and 36-file/1,304-assertion pgTAP passed.
- Live API integration passed 56/56 suites and 154/154 tests. Live API E2E
  passed 35/35 suites and 61/61 tests, including migration, recovery, and
  backup/restore coverage.
- Tracking normal/stress passed with intake P99 27/31 ms and zero errors. The
  10,000-row CSV corpus completed in 57.8 ms with zero measured heap growth.
- Outbox performance/resilience passed all 167,100 checks with steady claim P99
  28 ms under the unchanged 100 ms threshold.

Scoped non-gate observation:

1. Full repository-wide Admin Playwright is not green.
   - Command: `npm run test:e2e -- --reporter=line`.
   - Result: 127 failed, 181 passed, 272 skipped.
   - Phase 08 imports/parsers tests are passing; remaining failures are
     broad Admin routes from earlier/later specs such as AI, billing,
     governance, support, and visual preservation. SPEC-BE-009+ must not be
     implemented here to satisfy those unrelated failures. This broad suite is
     therefore evidence for other owner Specs, not a Phase 08 release gate.
