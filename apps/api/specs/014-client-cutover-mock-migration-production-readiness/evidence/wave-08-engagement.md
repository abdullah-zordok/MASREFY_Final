# Wave 8 — Engagement

Status: T101–T112 complete. Wave 8 implementation commit `cefcd2a7a4bda17a303a5200b0212cf8a136ff7e` was pushed to `main`, and required workflow run `34472991580` completed successfully for that exact SHA.

- Base and rollback SHA: `4f360a2e588798278962807de894897ccb891e28` (accepted Wave 7 evidence SHA).
- No Phase 14-owned endpoint, DTO resource, database object, migration, worker, event or generic cutover store was added. Corrections stay within BE011's existing routes, repository/service boundary and accepted OpenAPI.
- Protected user-owned paths remain excluded from edits and staging. The assistant contract file remains byte-for-byte preserved.

## Implemented scope and contracts

BE011 exposes notification preferences before the parameterized notification route, so `GET /api/v1/notifications/preferences` reaches the correct handler. Closed OpenAPI page/detail/preference/category/error schemas now match real runtime instances. The repository translates camelCase preference commands only at the legacy SQL boundary, and the service returns an authoritative post-write preference matrix.

Mobile notification and support consumers now select Clerk-authenticated strict BE011 adapters. Unknown fields/states/actions fail closed; mark-all traverses every cursor; read mutations return an authoritative re-read; per-action expiry and complete preference fields are retained; device-only preferences and drafts survive remote reads; ticket history, statuses and attachment IDs/metadata are complete; unsupported create/delete/rating operations fail explicitly. All production notification consumers, including the protected-route response controller and voice outcome emitter, use the central selector rather than importing the fixture service. Native permission flow registers categories and the owner push device, persists an installation fingerprint in SecureStore, and uses only a SHA-256 token digest in idempotency metadata.

Admin communications use the shared authenticated client and strict BE011 schemas. Exact 401/403/409/429 errors, versions/reasons, cursor chains, messages, internal notes, attachments, categories/templates/campaigns and audience preview identity/counts/expiry are preserved without fabricated metrics, totals or timestamps. The MSW implementation is demo/test-only, validates and persists supported mutations, checks permissions/versions, rejects unsupported actions, and defines no catch-all API route.

## Test-first and rehearsal receipts

- The actual Nest route regression failed before route reordering because `preferences` was captured as `notificationId`; its three focused assertions now pass.
- BE011 real-instance tests failed on closed-schema/page/runtime drift before the OpenAPI and repository/service corrections.
- Mobile strict mapping tests failed before cursor traversal, complete preferences/history/attachments, explicit unsupported operations, native registration, authoritative readback, local-storage error preservation and token-safe idempotency were implemented.
- Admin repository/handler tests failed before shared-client selection, exact error/schema/page mappings and validated persistent MSW actions were implemented.
- Source-level shadow/cutover rehearsals passed: Mobile 6 suites / 35 tests and Admin 5 files / 36 tests. They verify stable server-derived cohorts, structural comparison bounds and retention/reselection of the accepted Wave 7 rollback version; they are not represented as a deployed rollout.
- Focused API policy/provider/owner/internal-note/quarantine/published-only rehearsal: 8 suites / 18 tests passed.

## Local verification receipts

| Gate | Result |
|---|---|
| API engagement unit | 8 suites / 37 tests passed |
| API engagement contract | 10 suites / 22 tests passed |
| API engagement integration | 11 suites / 13 tests passed |
| API engagement security | 13 suites / 24 tests passed |
| API engagement performance | 2 suites / 4 tests passed |
| API engagement stress | 1 suite / 2 tests passed |
| API engagement recovery | 1 test passed / 1 conditional live-database test skipped |
| API OpenAPI drift | 1 suite / 3 tests passed |
| API typecheck, ESLint, build and migration checksums | Passed |
| API dependency audit | Exit 0 at the High threshold; one Moderate `qs` advisory remains upstream |
| Mobile focused engagement and cutover | 18 suites / 73 tests passed; the final engagement-service regression suite passed 10/10 and the selector cleanup's two voice suites passed 17/17 |
| Mobile full Jest | 435 suites / 2,021 tests passed. Jest emitted its known post-run open-handle warning and was stopped after all results were printed; the later selector-only cleanup is covered by the focused 17/17 receipt and typecheck |
| Mobile typecheck and ESLint | Passed; ESLint reports 0 errors and 78 pre-existing warnings |
| Mobile frontend-quality boundaries | Passed; 957 files checked |
| Mobile dependency audit | Exit 0 at the High threshold; 32 Moderate upstream advisories remain below the release threshold |
| Mobile production export/credential scan | 125 routes exported after `expo export --clear` to `C:\Users\DELL\AppData\Local\Temp\masarifi-phase14-wave8-clear-final2-20260910`; no legacy API host, direct OpenAI/Supabase endpoint, production assistant-mock module or mock-handler import. The only service-role and `sk_live_` matches are scanner/Clerk validation literals, not values or embedded credentials |
| Admin full Vitest | 81 files / 854 tests passed |
| Admin typecheck and ESLint | Passed |
| Admin live production build | 82 pages generated with mocks disabled and valid non-secret live configuration |
| Admin Playwright communications matrix | 12 passed / 8 expected desktop-action skips across five viewports; desktop-only action/permission selection passed 4/4 |
| Admin dependency audit | Build passed; audit reports current High findings in the existing Vite/Cloudflare/vinext/image/react-server-dom development/build graph. No Wave 8 dependency was added; coordinated remediation remains part of final closeout review |

## Reviews and external limits

Clean Code/SOLID/DRY/KISS/YAGNI guard review and test-quality review cover all Wave 8 production/test changes. The patch reuses the existing BE011 resources, selectors, shared Admin client, repositories and native platform service; it adds no dependency or speculative abstraction. The review removed obsolete live “mock” wording, stopped swallowing local preference failures, requires authoritative notification readback, and hashes push-token material before idempotency metadata.

Durable Codex Security scan `2aeb9c99-aa41-4b73-9ddc-131afc15c5a1` sealed the original immutable working-tree snapshot `codex-security-snapshot/v1:sha256:b1b0c716d3cb93dc8fc42ee91307df2b1f2403bae99f04e9271f079fa5a35caf`. It reviewed all 25 allowed inventory items, explicitly excluded the two protected user-owned items surfaced by the workbench, validated and suppressed the token-suffix/data-minimization and admin-browser pagination candidates, and reported zero findings. Final stable scan `482a5b8a-3700-47ad-bfb5-ac0493dbff26` sealed snapshot `codex-security-snapshot/v1:sha256:b9168ce86e2d55d463931a7012547e5182477d9947fdf90b3e82d1b4c2849590`, reviewed all 29 allowed inventory items, explicitly excluded both protected items, suppressed the privileged/self-impact pagination candidate, reported zero findings, and completed without a changed-tree warning.

Hosted Clerk/Supabase owner/Admin execution, real APNs/FCM and SMTP delivery, hosted private Storage/scanner, physical-device behavior, deployed shadow/cohort observation and N-1 binary rollback remain open in [external gates](external-gates.md). Local fixtures and source-level cutover tests are not represented as hosted, provider, physical-device or deployed proof.

Pre-commit preservation receipt: `apps/mobile/src/services/contracts/assistant-notifications-service.ts` SHA-256 must remain `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`. `.agents/plugins/`, `apps/api/pnpm-lock.yaml`, `apps/api/pnpm-workspace.yaml`, `apps/api/supabase/`, and the assistant file remain excluded from staging.

## Remote acceptance

T112 accepted: `feat(cutover): complete engagement wave` at `cefcd2a7a4bda17a303a5200b0212cf8a136ff7e` is on `origin/main`, and [Backend Foundation run 34472991580](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34472991580) completed with `success` for that exact SHA. No force push or history rewrite was used.
