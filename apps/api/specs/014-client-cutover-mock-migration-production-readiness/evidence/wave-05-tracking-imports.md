# Wave 5 — Tracking and Imports

Status: Wave 5 is accepted through T077. Implementation commit `943ba40734a1a142c30d68a3c34d189ac4349b96` is pushed to `main`, and all 12 required jobs passed in Backend Foundation run `34323754467` for that exact SHA; the conditional signed-release-evidence job skipped as expected.

- Base and rollback SHA: `c4c5dcb6ef68984f69898ecc40d7af68cbf85695` (accepted Wave 4 evidence SHA).
- Required implementation commit: `feat(cutover): complete tracking imports wave`.
- No Phase 14 database object or migration was added.
- Protected user-owned paths remain excluded from Wave 5 edits and staging.

## Implemented scope and contracts

The production Mobile tracking selector now receives the registered Clerk token provider before use. The live BE008 adapter rejects missing tokens, walks complete cursor chains, rejects repeated cursors and malformed/unknown states, preserves authoritative versions and retention values, and maps review decisions exhaustively. `report_wrong` and `ignore` use the BE008 rejection path and never create a ledger transaction. `processMockEvent` is unavailable in the live provider.

Tracking status is owner-derived from existing BE008 tables: last detection, last accepted transaction, current-month count, pending review count, active keyword/sender counts, and server update time. Per-account and global automatic-tracking gates continue through the existing BE004/BE008 database functions; the local pgTAP account-gate suite is included in the clean 1,804-test database result.

The Admin import/parser repository uses the shared authenticated client, strict live schemas, full cursor traversal before local page slicing, exact totals, server operation IDs/timestamps, and authoritative versions. Missing legacy user/app/parser labels remain absent and render as an em dash. Platform-specific overview is explicitly unavailable because BE008 exposes only the combined aggregate. Parser-rule test action is explicitly unavailable because its BE008 response does not satisfy the existing client result contract. The import-failure list is explicitly unavailable because BE008 omits the optimistic-concurrency version required for safe Admin actions.

BE008 OpenAPI now carries strict schemas for complete preference, status, keyword, sender, review, import-session, overview, institution, parser-rule, and parser-version resources. Mutation envelopes require the server occurrence timestamp used by Admin audit receipts.

## Test-first and rehearsal receipts

- Mobile regressions cover every review action, no-direct-ledger behavior, strict status/duplicate/event mapping, full history/review/keyword/sender cursors, retention preservation, server timestamps, token registration, unavailable mock processing, and missing undo history.
- Admin regressions cover full cursor traversal, exact totals, complete session/detail/envelope fields, combined-only overview, absent legacy columns, sanitized projections, server idempotency/audit values, enabled-derived test-case state, and explicit failure-list unavailability.
- The Wave 5 cutover/shadow/retention/account-opt-out/duplicate/undo set passed: 8 suites / 63 tests. It includes server-derived cohorts, accepted rollback selection, mismatch blocking, duplicate/retry behavior, account opt-out rechecks, retention, and no-direct-ledger assertions.
- The parser corpus fixture was copied before rehearsal from `apps/api/test/fixtures/tracking/parser-corpus.json` to `C:/Users/DELL/AppData/Local/Temp/masarifi-wave5-proof-b2e9c6e9fa634423b4f9b42870a5d743/parser-corpus.json`. Both SHA-256 values are `F5076507F9B5CF2B9D46BE7102B76B6B21DBCB25981FB960AB0726827392D8BB`.

## Verification receipts

All results below are local and use no hosted production identity, native capture source, or deployed parser corpus.

| Gate | Result |
|---|---|
| API full unit | 117 suites / 879 tests passed |
| API full contract | 76 suites / 225 tests passed |
| API tracking contract | 2 suites / 11 tests passed |
| API OpenAPI drift | 1 suite / 3 tests passed |
| API tracking integration with disposable local Supabase | 1 suite / 3 tests passed |
| API tracking security | 1 suite / 2 tests passed |
| API tracking recovery | 1 suite / 3 tests passed |
| API tracking performance and stress | Passed against disposable local Supabase |
| Full local pgTAP after clean reset | 58 files / 1,804 tests passed |
| API build, typecheck, lint, database lint, and migration checksums | Passed |
| API dependency audit | Exit 0 at the High threshold; one Moderate `qs` advisory remains upstream |
| API repository-wide format check | One unchanged pre-existing warning in `test/security/workflow-pins.spec.ts`; every Wave 5 file passes Prettier |
| Mobile live auth/tracking focus | 2 suites / 24 tests passed |
| Mobile full Jest | 432 suites / 1,991 tests passed; exit 0 with the known `--forceExit` open-handle warning |
| Mobile typecheck | Passed |
| Mobile ESLint | Passed with 0 errors and 78 pre-existing warnings |
| Mobile frontend-quality boundaries | Passed; 953 files checked |
| Admin import repository focus | 1 file / 23 tests passed |
| Admin full Vitest | 80 files / 851 tests passed |
| Admin typecheck and ESLint | Passed |
| Admin live production build | 82 pages generated with mocks disabled and valid non-secret build configuration |
| Admin import/parser Playwright matrix | 12 passed / 28 intentionally viewport-inapplicable skipped across five projects |
| Admin performance Playwright | 1 passed |
| Production source scan | 0 direct feature mock imports and 0 database/provider secret or client-authority matches in Wave 5 production paths |
| Production bundle scan | 0 secret/client-authority matches; the pre-existing guarded Admin demo/test MSW chunk remains packaged but production configuration rejects activation |
| Exact-SHA remote acceptance | Backend Foundation run `34323754467` completed successfully for `943ba40734a1a142c30d68a3c34d189ac4349b96`; all 12 required jobs passed and conditional `signed-release-evidence` skipped |

## Reviews

- Clean Code/SOLID/DRY/KISS/YAGNI review: PASS after retaining the existing selector/client boundaries and adding no new abstraction or dependency.
- Test-quality review: PASS. Regressions assert behavior, request shapes, pagination, fail-closed mapping, and absence of ledger calls rather than implementation details.
- Security review: PASS. Owner/admin authorization stays server-owned; SQL is parameterized and owner-scoped; response parsing is strict; sensitive import payload fields remain withheld; no secret or client role/scenario authority was added.
- Diff review: PASS after removing residual status/duplicate defaults, making outcome mapping exhaustive, and explicitly disabling revisionless Admin failure actions.

## External limits

Hosted Clerk/Supabase owner and cross-owner execution, physical Android/iOS capture/permission/background behavior, a deployed sanitized parser corpus, signed builds, deployed shadow/cohort observation, and N-1 binary rollback remain open in [external gates](external-gates.md). Local deterministic fixtures and mock-mode browser tests are not represented as hosted proof.

The preserved assistant file matched SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A` before evidence staging. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, and that file remain excluded from every Wave 5 stage/commit.
