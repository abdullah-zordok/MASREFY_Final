# Wave 7 — Reports

Status: Wave 7 is accepted through T100. The implementation and its CI forward-fix are pushed, and every required GitHub Actions job passed for the final exact SHA.

- Base and rollback SHA: `ec475d36e122596a16e21cda670dbbf8f67f1f07` (accepted Wave 6 evidence SHA).
- No Phase 14-owned endpoint, DTO resource, database object, migration, worker, event or generic cutover store was added. The owner corrections stay within BE010's existing reports service/repository and accepted OpenAPI.
- Protected user-owned paths remain excluded from edits and staging. The assistant contract file remains byte-for-byte preserved.

## Implemented scope and contracts

BE010 summary/category reads now use the exact timezone-resolved half-open interval instead of whole-month views. Income, expense, fee, refund, currency, transaction-count and original-category semantics remain aligned with the owner views; detail snapshots already used the exact interval. Summary metadata exposes the exact start/end/timezone range, and `anchorDate` is an optional owner query bound into the cache key. The existing report index covers the corrected query, so no schema or migration was added.

Mobile production report consumers now select the Clerk-authenticated strict BE010 adapter. It validates exact anchor/range/timezone/currency/evidence, preserves source partial state, exposes unsupported account scope/rich fields/non-category breakdowns/rich schedule settings as explicit unavailable states, and retains only drafts and immutable preview/attempt snapshots locally. Delivery state is server-owned; cold attempts without their local immutable snapshot fail closed rather than inventing report contents. The persistent repository binds its hydrated memory to the active owner-specific SQLite handle and clears/reloads when the app-shell changes owners.

Admin overview/analytics use the shared authenticated client and preserve exact owner financial values, currency, page/filter semantics and incomplete regions. Export requests/statuses are strict, polling inputs are bounded, and a completed download must carry a paired HTTPS URL and owner-provided expiry that is current, no longer than 15 minutes, and no later than the report retention expiry. The owner now clamps the Storage signing TTL to the attempt's remaining retention and returns the matching `downloadUrlExpiresAt`.

## Test-first and rehearsal receipts

- The new partial-range database test was observed failing on the old whole-month query before the owner correction; it covers summary/category/detail reconciliation and remains ready for the exact-SHA CI database job.
- Mobile strict mapping tests were observed failing before implementation and cover query scope, range/timezone, source partial reasons, unsupported rich fields and breakdowns, local drafts, server-owned delivery, cold attempts, pagination limits, unknown fields and malformed JSON.
- Admin tests were observed failing before export-link expiry/poll bounds were implemented. They cover exact financial values/currency, query/page semantics, explicit partial regions, exact request/ledger/schema fields, malformed links and bounded polling.
- Source-level shadow/cutover tests preserve zero-tolerance financial comparison, stable server-derived cohorts and the accepted Wave 6 rollback target. These tests are not represented as a deployed rollout.

## Local verification receipts

| Gate | Result |
|---|---|
| API reports unit | 10 suites / 70 tests passed |
| API reports contract | 6 suites / 15 tests passed |
| API reports security | 4 suites / 11 tests passed |
| API reports SMTP/unit integration selection | 4 suites / 14 tests passed |
| API OpenAPI drift | 1 suite / 3 tests passed |
| API build, typecheck, lint and migration checksums | Passed |
| API dependency audit | Exit 0 at the High threshold; one Moderate `qs` advisory remains upstream |
| API database-backed reports integration/recovery/performance/stress | Attempted with live-database mode; unavailable locally because Docker Desktop did not expose `127.0.0.1:54322` (`ECONNREFUSED`). Exact-SHA remote CI must supply the authoritative clean Supabase result before Wave 8 |
| Mobile focused reports | 32 suites / 81 tests passed |
| Mobile full Jest | 434 suites / 2,009 tests passed; exit 0 with the known forced open-handle warning |
| Mobile typecheck, report boundary and full frontend-quality boundaries | Passed; 956 files checked |
| Mobile ESLint | Passed with 0 errors and 78 pre-existing warnings |
| Mobile dependency audit | Exit 0 at the High threshold; 32 Moderate upstream advisories remain below the release threshold |
| Mobile production export/credential scan | 125 routes exported to `C:\Users\DELL\AppData\Local\Temp\masarifi-phase14-wave7-409381acfc7647d0bca96cae16e4885f`; zero embedded server credential or provider endpoint matches and zero production report-mock imports |
| Admin focused overview/cutover | 6 files / 56 tests passed |
| Admin full Vitest | 80 files / 858 tests passed |
| Admin typecheck and ESLint | Passed |
| Admin live production build | 82 pages generated with mocks disabled and valid non-secret build configuration |
| Admin dependency audit | Build passed; audit reports High findings in current development/build dependencies (`vinext`/`image-size`, `react-server-dom-webpack`, Vite/Cloudflare toolchain). No Wave 7 dependency was added; remediation requires coordinated dependency upgrades and remains for final closeout review |

## Reviews and external limits

Clean Code/SOLID/DRY/KISS/YAGNI and test-quality review pass: the patch reuses existing repositories, selectors, local persistence, shared Admin client and owner report resources; no dependency or speculative abstraction was added. Security scan `62d2057e-718f-4dae-819f-f9fdaef81ec2` reviewed all 23 inventory rows and found two Low issues in its immutable snapshot: overlong signed-link retention and warm cross-owner Mobile cache state. Both were fixed at the shared source and covered by focused regressions (API 2 suites / 7 tests; Mobile 2 suites / 6 tests). Final stable-patch scan `2fd17f15-e151-4dbb-817e-172064fd94e2` reviewed 23/23 rows at content digest `codex-security-snapshot/v1:sha256:7edcf71e3a053ff3adca3c52686908b59cec28c9848add9e70fee237d366dd20` with zero findings and no target-change warning.

Hosted Clerk/Supabase owner/Admin execution, real SMTP receipt, private hosted Storage, physical-device persistence, deployed shadow/cohort observation and N-1 binary rollback remain open in [external gates](external-gates.md). Local fixtures and source-level cutover tests are not represented as hosted or physical proof.

Pre-commit preservation receipt: `apps/mobile/src/services/contracts/assistant-notifications-service.ts` SHA-256 must remain `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, and the assistant file remain excluded from staging.

## Remote acceptance

- Wave implementation commit: `069499dd5aa0883332058c367af81c6db15f185a` (`feat(cutover): complete reports wave`).
- Its exact-SHA run `34449410712` passed every application, mobile, admin, database, security, image-independent and four of five viewport jobs, then failed only because the test-only Admin export handler still emitted a September 4 signed-link expiry that the new strict client correctly rejected.
- The one-file forward fix `f158666f38a35cf34c7a20510586dd4eaadda3e5` makes only the mock attempt and signed-link expiries current and bounded; the formerly failing desktop-1440 test passed locally before push.
- Final exact-SHA Backend Foundation run `34452034138` completed successfully at `https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34452034138`: 12 jobs passed, including the authoritative database, all five Admin viewports, application, mobile, Admin, secrets, sentinel-redaction and container image jobs. `signed-release-evidence` was skipped by workflow conditions after all required jobs passed.
- `main` and `origin/main` both resolved to the final accepted SHA before this evidence checkpoint. No force push or history rewrite was used.
