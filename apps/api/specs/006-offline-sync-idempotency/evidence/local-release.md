# Local Release Evidence

Date: 2026-08-31
Target: local `main`, no push/tag/PR.

## Passed gates

| Area | Result |
| --- | --- |
| API format/type/lint | Prettier check passed; TypeScript passed; ESLint passed with `NODE_OPTIONS=--max-old-space-size=1536`. |
| API unit | 67 suites, 500 tests passed. |
| Contract | Sync contract: 5 suites/12 tests passed. Full contract: 37 suites/131 tests passed after aligning the stale Phase 04 expectation with the committed Gulf-first Mobile order. No runtime client code changed. |
| Integration | 6 suites, 16 tests passed without live opt-in; 40 suites/95 tests were correctly environment-gated. Live sync: 5 suites, 11 tests passed. |
| E2E | 22 suites, 32 tests passed; 11 suites/22 tests were correctly provider/environment-gated. Focused sync: 5 passed, 3 skipped behind live/provider gates. |
| Database/migration/recovery | Clean reset and DB lint passed; 28 pgTAP files/746 assertions passed; live sync 5 suites/11 tests, sync recovery 3/3, migration/checksum/concurrency/backup-restore 4/4 passed. |
| Security | 16 suites, 81 tests passed; 1 suite/8 external/provider tests remained gated. Dependency audit reported 0 vulnerabilities. |
| Performance | Final rerun: 100,000 resources; delta P95 67 ms; 100-operation batch P95 39 ms; max payload 159,531 bytes; 1,081 checks and zero failures; both required indexes retained. |
| Build/container/image | API, worker, and migration build passed. Full container suite passed twice (8 suites/20 tests). Release image built successfully and is Linux/amd64, non-root `65532:65532`, digest `sha256:3acea540dee32e76c35dc2c3b4a5d86b2fb70960462c3b62fa1893b7943d55fd`. |
| Mobile focused | Fresh final run: 10 suites, 19 tests passed, including native SQLite v9 -> v10 migration and conflict UI policy. Typecheck passed; lint had 0 errors and 77 pre-existing warnings. |
| Mobile full | Correct serial invocation `npx jest --runInBand`: 398 suites/1,548 tests passed. Typecheck passed; lint completed with 0 errors and 77 pre-existing warnings. The generated ignored Android prebuild was present, so native privacy assertions also passed. |
| Workflow | YAML/security pin coverage passed as part of the security suite. |

## Baseline gate repair

The first full `verify` run found a stale Phase 04 contract expectation. Git
history and `docs/CLIENT_REMEDIATION_PLAN.md` prove the executable Gulf-first
order is `SAR/AED/KWD/QAR/BHD/OMR`; only the old test expectation was updated.
The targeted test and all 37 contract suites then passed. No Mobile runtime or
unrelated client behavior changed.

The migration suite also exposed its Phase 05-only private-function inventory.
Adding the exact 19 Phase 06 functions to that exhaustive expected list made the
targeted test and all four migration/recovery suites pass.

## Final outcome

After Windows restart, WSL and Docker recovered. The complete `npm run verify`
pipeline passed, including 67 unit suites/500 tests, 37 contract suites/131
tests, integration/e2e gates with their explicit provider opt-ins skipped,
build, checksums, dependency audit, workflow/security suites, and zero failures.
