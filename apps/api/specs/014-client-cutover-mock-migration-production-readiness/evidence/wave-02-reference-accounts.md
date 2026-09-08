# Wave 2 — Reference Data and Accounts

Status: Wave 2 implementation and exact-SHA remote acceptance complete through T045.

- Base SHA: `3c1ed617aadcd55844db0210a199521892cb9cd1` (`main` and `origin/main` at handoff).
- Implementation SHA: `4fa062691d9977c5d70062b9ada0a2c45cf4505c`.
- Remote CI workflow run URL/ID: `https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34266115054` (`34266115054`), exact head SHA matched the implementation SHA.
- Required remote job results: `admin`, `sentinel-redaction`, `mobile`, `secrets`, `application`, `database`, all five `admin-e2e` viewport jobs, and `image` succeeded. Conditional `signed-release-evidence` was skipped as designed.
- Evidence delivery: this record is delivered in the separate `docs(cutover): record wave 2 remote acceptance` commit; its exact SHA and CI run are verified after push before T046.

## Implemented scope and contracts

Production `createProductionCoreFinanceService` selects `createLiveCoreFinanceService`; retained `createMockCoreFinanceService` serves demo/test selection only. Accounts/categories use the shared authenticated HTTP client. `createLiveReferenceService` strictly consumes `/api/v1/reference/currencies`, `/api/v1/reference/countries`, and `/api/v1/exchange-rates`; exchange responses must match the requested base/quote pair. Reference reads are `OFF-NONE`: BE004 specifies no TTL, so offline/unavailable remains explicit.

BE004 account mapping preserves all seven account types, active/archived/closed state, tracking, dates, ordering, totals inclusion, card terms, lifecycle and pagination. BE005 `/api/v1/accounts/:id/summary` supplies the screen's confirmed integer balance, with account, currency and ledger-version correlation. BE004 `/api/v1/credit-card-payoff` supplies strict payoff/non-payoff results. Closed accounts remain visible and read-only. Opening balance is accepted at creation and omitted from PATCH; existing edit forms hide it because BE004 does not return the historical amount. The legacy compatibility model retains a zero local-ledger baseline, which must not be presented as that historical amount.

Category usage/count/version preconditions are server-authoritative. Stable system UUID-to-`systemKey` mappings and local favorite preservation apply to both live and SQLite paths. Merge consumes the actual `{ source, targetId }` response. The OpenAPI merge response was corrected; no fabricated `currentVersion` field was added. Audit claim that `includeInactive` was absent was disproved against HEAD: the existing BE004 list operation already declares it. Added regression checks its boolean schema and the live `includeInactive=true&limit=100` request shape; no duplicate or speculative query parameter was introduced.

Review fix round 1 strengthens those claims: live `openedAt`/`closedAt` dates must round-trip through UTC as the same YYYY-MM-DD value; impossible dates fail and valid leap days remain valid. Live category lists now read stored overrides from the existing owner-scoped `finance_categories` rows via `CoreFinanceRepository.readPersistedCategories`. Full inactive-inclusive refreshes cache complete mapped rows with `persistCategories` in one transaction using deferred existing foreign keys; pending/sending/conflict category edits are not overwritten. Nested category creation/update refreshes the complete list first so remote parents exist locally. Successful category creation/update persists the favorite through the existing `persistCategory` method. A local persistence failure after server success remains an ambiguous retry with the original operation identity. There is no new schema, preference store, storage abstraction or backend resource; reference reads still have no offline-cache fallback.

Ambiguous account/category mutations retain the operation ID and original version/usage preconditions per intent, bounded to 256 pending intents in process. Success and definitive failure clear state. Eviction/restart ends this guarantee; durable replay is Wave 3.

## SQLite, shadow and rollback proof

`storage/sync-delta.test.ts` uses real `node:sqlite`, applies actual Mobile migrations 1 through 11, and verifies account/category/conflict preservation. Mapping preserves closed/card fields and local favorites/system mappings, derives opening sign from signed postings, and prevents incoming updates from overwriting pending transactions or unresolved conflicts. Unknown enum/boolean values and invalid scalar values fail before account writes. Added native SQLite rejection cases cover uppercase three-letter currency, statement/payment days 1..28, monthly interest basis points 0..10000, positive safe minimum payment, nonnegative safe credit limit, strict real YYYY-MM-DD dates, null booleans and exact positive safe integer versions. Rejection leaves account, cursor and ID mapping tables empty.

`services/cutover/shadow-comparison.test.ts` calls actual live account/category adapters and checks complete normalized account/card/category/usage equality. Changing the tracking value blocks with `HASH_MISMATCH`; integer financial differences block with `FINANCIAL_MISMATCH`. Hash/count metadata is bounded and redacted. `config/cutover.test.ts` covers Wave 2 read shadow, internal/bounded writes and retention/reselection of the accepted Wave 1 rollback version. Separate sync tests prove local pending-work preservation. These are source-level rehearsals, not a combined deployed rollback/device exercise. There is no production shadow caller or hosted evidence sink in Wave 2.

## Review and security receipts

- Pre-fix scan `11a63a9a-f2e3-4f0f-81ac-7ecec0d41a43`: four findings — retry identity, unresolved-conflict overwrite, wrong exchange-rate pair, and system identity/favorite loss.
- Final handoff scan `fe7c4770-9996-41ce-aa70-eab3bec97d7c`: all 32 snapshot items reviewed; zero findings and complete coverage. Parent-led local review and existing independent receipts were used. Threat Analysis Credits were checked once and not granted; no recheck was performed here.
- Independent review fixes retained: live BE005 balances; stable retry keys; opening balance creation-only; system identity/favorite preservation; closed visibility/action restrictions; active transfer categories; known BE004 HTTP errors; removal of invented error fields; actual mapper shadow comparison; response pair binding; unresolved-conflict protection.
- Final audit follow-up: existing query parameter verified; historical opening field hidden; sync scalar/date/boolean/version rejection strengthened. The final handoff scan predates these small follow-up edits; focused regressions and local self-review cover them, without claiming a new scan ID.
- Finish self-review also found an unhandled rejection in the live payoff UI. A failing offline-payoff regression reproduced it; the screen now catches rejection and displays the existing localized safe error. No provider error content is exposed and there is no error-triggered fallback calculation.
- Independent review round 1 found two Important gaps in that first finish tree: calendar-invalid live account dates and favorites surviving only in process. Both were reproduced and fixed. Tests prove stored custom `true` and system `false` overrides survive provider recreation and refresh, changes persist, nested creation with a previously uncached remote parent satisfies native SQLite foreign keys, and pending local category edits remain preserved.
- Final reviewer found one remaining Important gap: account/category rows with an unresolved queue status of `conflict` could still be replaced by an incoming sync delta. Native SQLite regressions failed before the fix (2 failed, 46 passed), then passed all 48 tests after the shared unresolved-mutation guard was extended from `pending`/`sending` to `pending`/`sending`/`conflict`.
- Fresh final diff scan `433e088e-3e03-4e48-a27c-1596268f1956` reviewed the immutable Wave 2 snapshot digest `codex-security-snapshot/v1:sha256:8b9cd74e64cd3eec8e96dfc89b5d0652bbe723de968f4b897934a781dbd6ff0b`: 37/37 review items, complete coverage, zero findings. Report: `C:/Users/DELL/AppData/Local/Temp/codex-security-scans-TaGUje/MASREFY-_Final/3c1ed617aadcd55844db0210a199521892cb9cd1_20260908T185227Z_vry_v8vr/report.md`.

## Prior verification supplied in the handoff

These are exact recorded outcomes from the pre-finish tree. They are retained as prior evidence, not represented as fresh reruns. The handoff did not supply full command invocations for every row.

| Gate | Recorded result |
|---|---|
| Mobile focused live/sync services | 5 suites, 60 tests passed |
| Mobile focused account UI | 5 suites, 46 tests passed |
| Mobile full Jest | 429 suites, 1,841 tests passed; existing post-success open-handle warning |
| Mobile lint | 0 errors, 80 existing warnings |
| Mobile typecheck | Passed |
| Mobile `check:frontend-quality` | Every boundary scan passed across 947 files |
| `npx expo install --check` | Dependencies up to date |
| Mobile dependency audit | No High/Critical issue; 32 upstream moderate advisories remain |
| Production-shaped Expo web export | Passed, 125 static routes; output below |
| API reference unit/contract/security | 17 suites, 108 tests passed |
| API reference integration, local Supabase/Postgres | 7 suites, 19 tests passed |
| API reference E2E, local Supabase/Postgres | 5 suites, 9 tests passed |
| API reference performance | Passed |
| API OpenAPI drift | 1 suite, 3 tests passed |
| API lint/typecheck/focused Prettier | Passed |
| `git diff --check` | Passed |

Local database configuration used: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `MASARIFI_LIVE_DATABASE_TESTS=1`. This is a disposable local Supabase/PostgreSQL instance, not hosted evidence. SQLite is Mobile-only local storage; no backend database or migration was introduced by Phase 14.

## Explicit production source/bundle/secret evidence

- `node scripts/check-frontend-quality-secrets.mjs .` from `apps/mobile`: PASS, `Frontend-quality secrets scan passed.`
- Source search excluding tests found `createMockCoreFinanceService` only in its defining selector module; no production `fixtureAccounts` import. `fixtureCategories` appears only in the still-unmigrated Wave 7 reports mock.
- Export scanned: `C:/Users/DELL/AppData/Local/Temp/masarifi-phase14-wave2-eafcef74e044483e81bf15315b5fc716` (125 static routes).
- Fresh final export scanned: `C:/Users/DELL/AppData/Local/Temp/masarifi-phase14-wave2-c05f50c198dd4ad3b5ea3fd4f9eb4f98` (125 static routes, 184 files). It reconfirmed the forbidden-secret results below; `service_role` appears only in the public-variable rejection regex, and retained mock modules remain unreachable behind the inlined live production selector.
- No bundle matches for `sk_live_*`, `sb_secret_*`, `SUPABASE_SERVICE_ROLE`, `CLERK_SECRET_KEY`, `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, `api.openai.com`, `openrouter.ai`, or `supabase.co`.
- The case-insensitive `service_role` token occurs only as `SERVICE_ROLE` in the public-variable rejection regex (`EXPO_PUBLIC_.*(?:API_KEY|SECRET|SERVICE_ROLE)`). A Clerk publishable key is public configuration, not a secret.
- Retained demo/test core-finance mock code is bundled. Production environment is inlined as `live`; selector tests prove the production factory selects live with no fallback. This is retained unreachable demo/test code, not physical bundle removal.
- This export predates the final opening-form, sync-validation, payoff-error and review-round-1 edits. Round 1 adds an import of the existing `CoreFinanceRepository` to the live category adapter; it adds no new provider dependency, credential or service selector. A final release export on the pushed SHA remains part of release acceptance. Fresh `rg --no-ignore` inspection of the old export enumerated 183 files and reconfirmed the findings above, including the emitted `EXPO_PUBLIC_CLIENT_MODE:"live"` beside the public-variable rejection regex.

## Finish verification

Red regression: `npm --prefix apps/mobile test -- src/storage/sync-delta.test.ts src/features/accounts/AccountForm.test.tsx` reproduced 17 failures and 41 passes across 2 failing suites before the fix. Failures were invalid snapshots accepted and historical opening balance displayed.

After the fix, the prescribed seven-suite regression plus `src/features/accounts/AccountForm.test.tsx` passed: 8 suites, 105 tests. A further historical live-account creation/edit/PATCH regression was added afterward; final fresh results are recorded below before local completion.

Final fresh results (2026-09-08):

| Command and working directory | Result |
|---|---|
| Root: `npm --prefix apps/mobile test -- src/services/live/account-service.test.ts src/services/live/category-lifecycle-service.test.ts src/services/live/reference-service.test.ts src/services/mocks/core-finance-selector.test.ts src/storage/sync-delta.test.ts src/services/cutover/shadow-comparison.test.ts src/config/cutover.test.ts` | 7 suites, 91 tests passed |
| Mobile: `npm test -- src/features/accounts/AccountForm.test.tsx src/features/accounts/AccountDetailScreen.test.tsx src/features/accounts/AccountListScreen.test.tsx src/features/accounts/account-presentation.test.ts src/features/accounts/AccountJourney.test.tsx src/storage/sync` | 12 suites, 76 tests passed before the additional payoff regression; existing React `act(...)` warnings in AccountDetailScreen |
| Mobile: `npm test -- src/features/accounts/AccountForm.test.tsx` | 1 suite, 15 tests passed, including creation with 850,000 minor units, a subsequent live edit with no historical-opening field and PATCH without opening balance |
| Mobile: `npm test -- src/features/accounts/AccountDetailScreen.test.tsx src/services/live/account-service.test.ts src/services/live/category-lifecycle-service.test.ts src/services/live/reference-service.test.ts src/services/mocks/core-finance-selector.test.ts src/storage/sync-delta.test.ts src/services/cutover/shadow-comparison.test.ts src/config/cutover.test.ts` | Final payoff correction: 8 suites, 98 tests passed; existing React `act(...)` warnings and expected redacted HTTP-failure logs |
| Mobile: `npm run typecheck`, `npm run lint`, `npm run check:frontend-quality` | Passed; lint 0 errors/80 existing warnings; all boundary checks passed, 947 files in the main scans |
| Mobile: `node scripts/check-frontend-quality-secrets.mjs .` | Passed: `Frontend-quality secrets scan passed.` |
| API: `npx jest --selectProjects unit contract security --runInBand --testPathPatterns=reference` | 17 suites, 109 tests passed |
| API: `npx jest --selectProjects contract --runInBand --testPathPatterns=openapi-drift` | 1 suite, 3 tests passed |
| API: `npx jest --selectProjects contract --runInBand --testPathPatterns=reference-openapi` | 2 suites, 9 tests passed after removing test-only non-null assertions flagged by lint |
| API: `npm run lint`, `npm run typecheck` | Passed after that test guard correction |
| Focused Prettier checks for finish-edited Mobile/API code | Passed |
| Root: `git -c core.safecrlf=false diff --check` | Passed |
| Root: preserved assistant `Get-FileHash -Algorithm SHA256` | Exact expected SHA-256 matched |

The added native SQLite table has 20 invalid-scalar cases. The additional payoff regression first failed (1 failed/6 passed) before the catch was added, then passed in the final suite above. An initial historical-live test failed because the Expo UUID test stub returned no operation ID; configuring a valid deterministic UUID corrected test setup without changing production behavior. No new full-Jest, Expo export, local PostgreSQL integration/E2E/performance, dependency audit or security-provider scan was claimed after the finish edits; their prior results remain listed separately.

Round 1 fresh verification: `npm test -- src/services/live/account-service.test.ts src/services/live/category-lifecycle-service.test.ts src/services/live/reference-service.test.ts src/services/mocks/core-finance-selector.test.ts src/storage/sync-delta.test.ts src/services/cutover/shadow-comparison.test.ts src/config/cutover.test.ts src/storage/core-finance-persistence.test.ts src/storage/database-owner.test.ts` from Mobile passed **9 suites, 123 tests**. This includes the prescribed Wave 2 suite and affected existing category persistence/database-owner checks. `npm run typecheck`, focused ESLint/Prettier for the eight touched Mobile files, `git diff --check`, and the preserved assistant hash check passed. Red proof: live account/category tests initially failed 4 cases with 27 passing; nested-child native SQLite initially failed 1 case with 45 passing before the transactional cache. Expected redacted HTTP-failure logs remain; unrelated Minor warning cleanup was not performed.

Final reviewer correction verification: the two new real-SQLite conflict tests failed before the guard correction with the server value replacing a conflicted local account and an archived delta tombstoning a conflicted local category. After the one-line shared status expansion, `src/storage/sync-delta.test.ts` passed **48 tests**. The prescribed Wave 2 regression then passed **7 suites, 148 tests**. Mobile typecheck, lint (0 errors/80 existing warnings), `check:frontend-quality`, `git -c core.safecrlf=false diff --check`, and the preserved assistant hash check all passed.

## Limits and follow-up

Hosted Supabase, real owner/non-owner and Clerk identities, physical iOS/Android SQLCipher and UI behavior, signed builds, deployed shadow cohorts/observation/rollback and evidence collection remain open in [external gates](external-gates.md). The handoff's local DB and SQLite proofs do not satisfy them. BE006 runtime synchronization and restart-durable mutation replay remain Wave 3. `listCurrencies` and `listCountries` currently have no non-test screen consumer. BE005 account summary consumes only the strict balance projection; full transaction mapping remains Wave 3. No BE012, billing provider or paid flow was added; `billingAvailable: false` remains required.

Preserved assistant file SHA-256 remains `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`. No preserved path was edited or staged by the finish work. The implementation commit, push, exact-SHA CI and remote evidence record complete T045; the separate evidence commit must also pass exact-SHA CI before T046 begins.
