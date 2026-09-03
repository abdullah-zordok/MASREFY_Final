# Local Feature Gates

Fresh/current evidence retained for Phase 08:

| Gate                                | Command                                                                                                | Result                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| API format on changed TS/JS/YAML/MD | `npx prettier --check @files`                                                                          | PASS; all matched changed files use Prettier style.                       |
| Git whitespace                      | `git diff --check`                                                                                     | PASS; no whitespace errors.                                               |
| Admin Phase 08 Playwright           | `npx playwright test tests/e2e/imports-parsers.spec.ts tests/e2e/accessibility.spec.ts --grep "imports | parser                                                                    | tracking"` | PASS; 14 passed, 31 skipped by viewport policy. |
| Tracking CSV corpus                 | `npm run test:performance:tracking`                                                                    | PASS; 10,000 rows in 57.8 ms, 577,817 bytes, 0 heap growth.               |
| Tracking performance                | `npm run test:performance:tracking`                                                                    | PASS; 2,716 checks, intake/read/duplicate P99 27/11/10 ms.                |
| Tracking stress                     | `npm run test:stress:tracking`                                                                         | PASS; 17,996 checks, intake/read/duplicate P99 31/10/10 ms.               |
| Outbox performance and resilience   | `npm run test:outbox`                                                                                  | PASS; 167,100 checks; steady claim P99 28 ms, unchanged 100 ms threshold. |
| Mobile full serial Jest             | `.\node_modules\.bin\jest.cmd --runInBand`                                                             | PASS; 406 suites and 1,666 tests passed.                                  |
| Mobile quality boundaries           | `npm run check:frontend-quality`                                                                       | PASS.                                                                     |
| Admin typecheck                     | `npm run typecheck`                                                                                    | PASS.                                                                     |
| Admin lint                          | `npm run lint`                                                                                         | PASS; 0 errors, 1 pre-existing unrelated warning.                         |
| Admin unit/component                | `npm test`                                                                                             | PASS; 70 files, 787 tests.                                                |
| Admin production build              | `npm run build`                                                                                        | PASS; 82 routes generated.                                                |

Fresh API verification after the final formatting pass:

- Command: `npm run verify`.
- Result: PASS.
- Counts:
  - unit: 89 suites, 678 tests passed;
  - contract: 45 suites, 154 tests passed;
  - integration: 6 suites passed, 50 skipped; 16 tests passed, 138 skipped;
  - e2e: 22 suites passed, 13 skipped; 32 tests passed, 29 skipped;
  - security workflow pins: 19 suites passed, 1 skipped; 87 tests passed,
    8 skipped.
- Additional API verify gates: typecheck, lint, performance syntax check, build,
  migration checksums, and `npm audit --audit-level=high` passed. `npm audit`
  reported one moderate `qs` advisory, below the configured high-severity gate.

Fresh database-backed evidence:

- `npm run db:reset`: PASS from an empty local Supabase database.
- `npm run db:lint`: PASS with 0 findings.
- `npm run test:db`: PASS; 36 pgTAP files and 1,304 assertions.
- Live API integration: PASS; 56 suites and 154 tests.
- Live API E2E: PASS; 35 suites and 61 tests, including Phase 08
  rollback/forward, recovery, migration concurrency, and backup/restore.

The first full Mobile serial run had one 30-second timeout in
`BudgetJourney.test.tsx` even though its rendered tree contained the requested
control. The isolated suite then passed 13/13 in 4.6 seconds and the complete
serial rerun passed 406/406 suites and 1,666/1,666 tests in 350.95 seconds.
