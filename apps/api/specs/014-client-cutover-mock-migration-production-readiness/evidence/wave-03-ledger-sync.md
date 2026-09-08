# Wave 3 — Lossless Ledger and Offline Sync

Status: local implementation, rehearsal, verification and review complete through T056. T057 exact-message commit, push and exact-SHA remote acceptance remain pending in this tree.

- Base and rollback SHA: `f4c58cf76c1e03fdd1b48b125a65358f291808d2` (accepted Wave 2 evidence SHA).
- Required implementation commit message: `feat(cutover): complete ledger sync wave`.
- Implementation SHA and remote workflow run are recorded here in a separate evidence commit only after the implementation SHA is pushed and all required jobs are green.

## Implemented scope and contracts

Production `createProductionCoreFinanceService` selects the explicit live composition outside demo/test. The live ledger service uses the shared Clerk-authenticated client for BE005 transaction list/detail/create/revise/delete/restore/refund/reversal/transfer operations. Home summary combines live BE004 accounts, BE005 account summaries and fully paginated BE005 transactions; it does not label a local calculation or nonexistent `/summary` endpoint as live.

BE005 summaries now carry `sourceAccountId` and nullable `destinationAccountId` in addition to sorted membership `accountIds`. The repository derives the two posting roles inside the existing page/detail/mutation queries, avoiding an N+1 lookup. Mobile maps these explicit roles and rejects malformed summaries. A real PostgreSQL regression deliberately chooses a source UUID that sorts after the destination UUID and proves role direction remains correct.

BE006 contracts now match the running API for UUIDv4 device IDs, bounded `after`/`limit`, `hasMore`/`nextPage`, owner/device-bound signed-v2 cursors, conflict timestamps and flat safe errors including `SYNC_CURSOR_NOT_ISSUED`. `createLiveCoreFinanceSync` recovers interrupted `sending` rows, uploads only dependency-ready mutations, applies receipts, bootstraps missing domains, advances deltas with acknowledgements, stores open conflicts and rejects cursor loops or incomplete receipt sets.

Owner-scoped SQLite hydration preserves drafts, queued/dependent mutations, ID mappings, cursors, tombstone JSON and unresolved conflicts. Direct sync SQL is rehydrated without a cache-wide delete/overwrite. Batch receipts are stored in the existing finance operation metadata so restart retries return the original operation result without a duplicate write. `AppShellProvider` triggers synchronization only after a restored authenticated live session and on authenticated app resume.

## Seeded copy, rehearsal and rollback proof

The deterministic fixture source was copied before the combined rehearsal:

- Source: `apps/mobile/src/test-utils/core-finance-fixtures.ts`.
- Disposable copy: `C:/Users/DELL/AppData/Local/Temp/masarifi-wave3-proof-86b0c6be744543238e7090e7da1b27f8/core-finance-fixtures.ts`.
- Source and copy SHA-256: `9E7029584159D6450F9A1D4CA544B07DA74A6B8E52F968463BD69CC3FCCD987B`; exact copy `True`.
- `src/test-utils/core-finance-fixtures.test.ts`: 1 suite/8 tests passed. It asserts 19 categories, 500 unique transactions, archived coverage, synthetic-data hygiene, and empty/partial/multi-currency/archived/offline/conflict/large scenarios.

Fresh combined Mobile rehearsal:

`npx jest --runInBand src/services/live/core-finance-service.test.ts src/storage/core-finance-repository.test.ts src/storage/sync-repository.test.ts src/storage/sync-sqlite-migration.integration.test.ts src/storage/sync-tombstones.test.ts src/storage/sync-queue.test.ts src/storage/sync-delta.test.ts src/storage/sync-database.test.ts src/storage/sync-conflicts.test.ts src/services/cutover/shadow-comparison.test.ts src/config/cutover.test.ts src/services/mocks/core-finance-transfer-refund.test.ts`

Result: 12 suites/141 tests passed. The actual live mapper shadow reconciles exact ledger values with zero tolerance; a one-minor-unit difference blocks. The suites cover online requests, offline/dependent queueing, bootstrap/delta pagination, interrupted upload recovery, conflict preservation/resolution, tombstone persistence, reconnect/restart, refund/transfer direction and N-1 cutover rollback. The native SQLite test applies migrations through schema 11, reopens the file, preserves `parent|[]|pending`, `child|["parent"]|pending`, and `conflict|pending`, and proves a different owner database has no sync queue.

The first combined run intentionally remained evidence: 11 suites/140 tests passed and the Wave 3 shadow case failed because its synthetic server summary had not been updated with the newly required posting-role fields. Adding those two contract fields to the fixture made the affected suite pass 6/6 and the complete rehearsal pass 141/141; production code was unchanged by this follow-up.

## Verification receipts

All results below are local and use no hosted production identity or provider.

| Gate | Result |
|---|---|
| Mobile Wave 3 focused rehearsal | 12 suites/141 tests passed after the recorded stale-fixture correction |
| Mobile full Jest | 430 suites/1,948 tests passed; known React `act`, Expo and post-success open-handle warnings remained non-failing |
| Mobile live/selector/app-shell regression | 3 suites/27 tests passed |
| Mobile typecheck | Passed |
| Mobile lint | Passed with 0 errors and 80 existing warnings |
| Mobile frontend-quality boundaries | Passed |
| `npx expo install --check` | Passed: dependencies are up to date |
| Mobile production Expo web export | Passed; `C:/Users/DELL/AppData/Local/Temp/masarifi-phase14-wave3-1539e45438364e7b8727654c485586b1`, 184 emitted files |
| Mobile secret/provider scan | Passed; no credential or forbidden provider/service-role value was found. Retained Clerk SDK validator strings are not credentials |
| API BE005/006 unit/contract/security/openapi | 32 suites/232 tests passed; 1 suite/8 tests skipped by its declared environment gate |
| API BE005/006 integration on disposable local PostgreSQL | 17 suites/43 tests passed |
| API BE005/006 E2E | 11 suites/22 tests passed |
| API focused OpenAPI instance/drift | 3 suites/10 tests passed; final ledger contract/client mapping set passed 6 suites/16 tests |
| API ledger and sync performance | Both runners passed |
| API typecheck, lint and focused Prettier | Passed |
| API `npm audit --audit-level=high` | Exit 0; no High/Critical advisory. One upstream `qs` moderate advisory remains |
| Mobile focused ESLint/Prettier and root `git diff --check` | Passed after the final fixture correction |
| Post-review API ledger unit/contract/security/openapi | 14 suites/157 tests passed; 1 suite/8 declared skips |
| Post-review API ledger integration/E2E | Integration 10 suites/32 tests; E2E 7 suites/14 tests passed |
| Post-review API ledger performance/typecheck/lint/Prettier | Passed |

Local database commands used `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` and `MASARIFI_LIVE_DATABASE_TESTS=1` against the verified disposable local Supabase/PostgreSQL instance. No Phase 14 backend database object or migration was introduced.

## Review and security receipts

- Test-first role-mapping correction: the Mobile summary test, BE005 OpenAPI instance test and real PostgreSQL integration test failed before explicit source/destination fields were added, then all passed. This fixes the root contract error instead of relying on UUID sort order.
- Independent review then found that income uses a destination posting internally while the public summary contract requires its sole account as `sourceAccountId`. The new real-database mutation/list/detail regression failed with `sourceAccountId: undefined` and the account in `destinationAccountId`. One shared transaction-kind projection now maps income to source and keeps destination transfer-only across mutation, list, detail, account-summary and linked-original paths. The focused integration suite passed 5/5 and the OpenAPI instance suite passed 5/5 before the broader post-review gates above.
- Clean Code Guard and Test Guard found no blocking abstraction, duplication, unsafe boundary, mock-internal assertion or missing real-boundary coverage. The fix reuses existing ledger queries, schemas, repository metadata and sync abstractions; no dependency or speculative helper was added.
- First complete Wave 3 scan `6cade571-3aee-47c2-a170-90abd353315e` covered the pre-role-fix snapshot with zero findings.
- Post-transfer-role scan `b253d151-3690-46a3-9716-23090d68d170` covered digest `codex-security-snapshot/v1:sha256:d61a3bcb6be517809820d00542cf9a21c1859a679b64738ee51c2f3caccdebdf`: 24/24 items, complete coverage, zero findings.
- Final post-independent-review scan `703278df-6698-4d70-b854-e9ebf804d6a9` covered digest `codex-security-snapshot/v1:sha256:c7c2ce8bb4892ff6e1d4d85d0cb02580779e896d7be5ff4fccb71b326c814adb`: 24/24 review items closed, complete coverage, zero candidates/findings. Report: `C:/Users/DELL/AppData/Local/Temp/codex-security-scans-TaGUje/MASREFY-_Final/f4c58cf76c1e03fdd1b48b125a65358f291808d2_20260908T225832Z_5yhg6udx/report.md`. Usage: 1,855,417 total tokens in one thread.
- Protected user-owned paths were explicit exclusions. Two independent architecture workers in the first scan returned no usable result before bounded interruption, so the parent completed the source-backed threat model sequentially. The final scan predates only this evidence receipt update; no production or test code changed afterward.

## External limits

Hosted Clerk/Supabase, real cross-owner/device execution, physical iOS/Android SQLCipher/background/restart behavior, signed builds and deployed shadow/cohort/observation/rollback evidence remain open in [external gates](external-gates.md). Local fixtures and disposable databases are not represented as external proof. Billing remains unavailable, no BE012/provider work was added, and `billingAvailable: false` remains required.

The preserved assistant file must still match SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A` immediately before staging. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/` and that file remain excluded from every Wave 3 stage/commit.
