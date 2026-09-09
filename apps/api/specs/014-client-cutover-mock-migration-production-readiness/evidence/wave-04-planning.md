# Wave 4 — Reconciled Financial Planning

Status: Wave 4 implementation and exact-SHA remote acceptance are complete through T067.

- Base and rollback SHA: `f86a61fc8d85f23e389111464723a46dae13155e` (accepted Wave 3 evidence SHA).
- Wave 4 implementation SHA: `09dd0f0968226c37b849dc35955f40a9cc54d86d`, committed with the required message `feat(cutover): complete planning wave`.
- Accepted exact-SHA workflow: Backend Foundation run `34310124533` ([run](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34310124533)), head SHA exactly `09dd0f0968226c37b849dc35955f40a9cc54d86d`.
- All 12 required jobs passed: `application`, `mobile`, `admin`, `secrets`, `sentinel-redaction`, `database`, all five `admin-e2e` viewport jobs, and `image`. Conditional `signed-release-evidence` was skipped as designed for the `main` push.
- No BE007 backend database object or migration was added. Mobile SQLite schema 12 adds only the missing local `planning_payment_matches` cache table.
- Protected user-owned paths remain excluded from Wave 4 edits and staging.

## Implemented scope and contracts

BE007 summary semantics now reserve only active payable obligations with due/partial/overdue schedule items inside the requested period. Received salary receipts no longer masquerade as the next expected occurrence. Closed obligations no longer leak into the owner aggregate. Budgets, obligations, savings goals, and per-budget categories use bounded 101-row probes, emit at most 100 rows, and mark the response `partial` when truncated. Budget categories are fetched in one owner-scoped parameterized query, so Mobile does not fan out per budget.

Production planning features import the explicit service selector. Test/demo selects the deterministic fixture provider; live mode selects `createLiveFinancialPlanningService`, which uses the shared Clerk-authenticated HTTP boundary, strict Zod response schemas, complete cursor traversal, safe integer parsing/aggregation, exact BigInt percentage rounding, and authoritative backend versions.

All 43 `FinancialPlanningService` methods are behaviorally exercised. BE007-backed reads and mutations are live. Reporting uses four fixed-count aggregate reads and is explicitly partial because BE007 exposes no bounded payment or movement history aggregate. Budget drafts and previews stay local, and budget confirmation re-reads the accepted server version before writing. A root budget write and its category replacement use stable independent idempotency keys, so retry replays the root and resumes the incomplete child write.

Planning payments and savings movements require an existing authoritative ledger transaction ID. The adapter never derives a transaction ID from a client operation key. Transaction-create payment previews, early settlement, correction movements without a replacement contract, payment-match acceptance without BE007 allocation data, and reversal of a movement without an authoritative server version fail explicitly as unavailable.

SQLite hydration treats drafts, dependent collections, payment matches, and conflicts as persisted state even when no root planning record exists. On restart, an obligation payment, payment match, or goal movement whose linked transaction is absent from `finance_transactions` is removed from the active FK-constrained table and its exact original payload is stored as a pending `planning_sync_conflicts` record. `keep_local` is unavailable because it would fabricate the missing ledger dependency; `keep_later` resolves the conflict, clears quarantine, and does not re-quarantine after another restart.

## Test-first receipts

- BE007 integration regressions initially failed for payable-only reserves, expected-receipt selection, closed-obligation filtering, and 101-row completeness. The corrected shared summary query and lifecycle/bound logic pass.
- Mobile live planning initially failed because the live service did not exist. Later regressions reproduced unsafe derived category/obligation totals and floating-point budget percentage drift; the shared safe-sum and BigInt percentage helpers now cover those paths.
- SQLite regressions initially lost draft-only, payment-match-only, and conflict-only stores and retained orphan ledger effects in active tables. Real `node:sqlite` restart tests now verify schema 12, exact quarantine payloads, unsupported local restoration, durable later resolution, and absence of re-quarantine.
- UI regressions switch the observable provider metadata to live mode and verify unsupported obligation payment, savings movement, and payment-match confirmation actions are absent while explicit unavailable state is rendered. Test/demo journeys remain unchanged.

## Seeded copy, shadow, retry, and rollback rehearsal

The deterministic planning fixture was copied before the combined rehearsal:

- Source: `apps/mobile/src/test-utils/financial-planning-fixtures.ts`.
- Disposable copy: `C:/Users/DELL/AppData/Local/Temp/masarifi-wave4-proof-9a9fd0c1199c4a0698b7e4d01095d79c/financial-planning-fixtures.ts`.
- Source/copy SHA-256: `EC4BEFD3BCD5CA1581C2E5C50EC37AB2C42D943C4D1C7E726D34315ADC013541`; exact copy `True`.

`src/services/cutover/shadow-comparison.test.ts` compares strict live BE007 savings mapping against the deterministic baseline with zero financial tolerance. Exact state produces `match`; a one-minor-unit difference produces `HASH_MISMATCH` and `FINANCIAL_MISMATCH` and blocks.

The live contract test injects a category-write outage after a successful budget root create. Retrying with the same client key sends the same root key and stable `:categories` child key, then completes without another logical root. It also re-reads the budget version and refuses a stale preview before any PUT.

Cutover policy advances Wave 4 through shadow/internal/bounded-write with `f86a61f` as the accepted N-1 rollback target and keeps billing unavailable.

## Verification receipts

All results below are local and use no hosted production identity or provider.

| Gate | Result |
|---|---|
| API BE007 summary unit | 1 suite / 6 tests passed |
| API planning integration with local Supabase | 9 suites / 41 tests passed |
| API planning logic | 21 suites / 117 tests passed |
| API planning security | 2 suites / 5 tests passed |
| API planning recovery | 1 suite / 4 tests passed |
| API OpenAPI validation | 1 suite / 3 tests passed |
| API planning performance | Passed against local Supabase |
| Mobile live planning contract | 1 suite / 21 tests passed |
| Mobile live service + repository + real SQLite focus | 3 suites / 33 tests passed |
| Mobile live unsupported-action UI + shadow/cutover focus | 4 suites / 21 tests passed |
| Mobile full Jest | 432 suites / 1,979 tests passed; exit 0 with `--forceExit` after the known open-handle warning |
| Mobile typecheck | Passed |
| Mobile ESLint | Passed with 0 errors and 78 pre-existing warnings |
| Mobile frontend-quality boundaries | Passed; 953 files checked |
| Expo dependency validation | Dependencies are up to date |
| Production web export | 125 static routes / 184 files at `C:/Users/DELL/AppData/Local/Temp/masarifi-phase14-wave4-final-9a73318f12f54b6fb741851f141d0c18` |
| Production source/bundle scan | 0 direct feature mock imports; 0 database URL, Stripe secret, or Supabase secret matches |
| Retained planning fixture bundle signature | 1 file, expected because the selector packages the explicit demo/test provider; production fixture mode is rejected |

## Reviews

- Independent API security review: PASS. Owner scoping, RLS coverage, parameterization, 100/101 bounds, partial-state signaling, and bigint-text mapping were verified.
- Independent Mobile live/security review: PASS.
- Independent threat/architecture review: PASS after safe derived arithmetic was corrected.
- Test-quality review: PASS. All 43 methods are invoked behaviorally, corruption instances are fresh, selector state is observable, and SQLite coverage uses the real engine/migrations.
- Clean Code/SOLID/DRY/KISS/YAGNI review: PASS after reusing the existing safe-money helpers rather than introducing another abstraction.
- Codex Security diff scan `c93b38da-c1d3-4bb6-8f5c-81168d01800d`: complete, 34 in-scope review rows closed, 2 protected rows excluded, 0 findings, no warnings; immutable snapshot digest `codex-security-snapshot/v1:sha256:3e3643fcdf0cb67fc073ac95b7231e3bbbe87ccb924aed7e7dd7b1838e5bd82b`.

## External limits

Hosted Clerk/Supabase owner/cross-owner execution, physical iOS/Android SQLCipher upgrade/restart/background behavior, deployed shadow/cohort observation, signed builds, and N-1 binary rollback remain open in [external gates](external-gates.md). Local deterministic fixtures and mocked owner HTTP responses are not represented as hosted proof.

The preserved assistant file matched SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A` before evidence staging. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, and that file remain excluded from every Wave 4 stage/commit.
