# Local release evidence

Fresh on 2026-08-29 against the final application worktree:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run perf:check` | Pass |
| `npm run test:unit` | 40 suites / 251 tests pass |
| `npm run test:contract` | 26 suites / 105 tests pass |
| `npm run test:integration` | 6 suites / 16 tests pass; live suites intentionally await a database |
| `npm run test:e2e` | 9 suites / 11 tests pass; live suites intentionally await a database |
| `npm run build` | API, worker, and migration builds pass |
| `npm run migration:checksums` | Pass |
| `npm run security:dependencies` | 0 vulnerabilities |
| `npm run security:workflow-pins` | 13 suites / 67 tests pass |
| `git diff --check` | Pass |

The final local `test:container` and clean-database rerun cannot start because the host WSL service is stuck and cannot be restarted without host elevation/reboot. The repository CI runs both gates on a clean Linux host and is the authoritative final runtime evidence.
