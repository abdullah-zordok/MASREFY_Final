# Wave 1 Identity Evidence

## Scope and versions

- Rehearsal time: `2026-09-08T06:25:41+03:00`.
- Baseline and rollback SHA: `24d3cacefd39726b36e314b3a3988d11e0cfb50a`.
- Clients: Mobile and Admin; `billingAvailable` remained `false`.
- Identity data came from deterministic, non-production Clerk bridge/token fixtures. No real identity, OTP, token, email, phone, or device identifier was retained.

## Local cutover and rollback rehearsal

| Proof | Result |
|---|---|
| Mobile `shadow -> internal -> bounded-write -> full` | Passed in `src/config/cutover.test.ts`; out-of-order wave/stage, client-derived cohort, and invalid rollback versions were rejected. |
| Admin `shadow -> internal -> bounded-write -> full` | Passed in `src/core/config/cutover.test.ts` with the same fail-closed transition checks. |
| Rollback selection | Both clients retained `24d3cac` through full Wave 1 and successfully reselected it as the accepted N-1 policy. No database state or operation identity was changed. |
| Redacted shadow comparison | Mobile and Admin emitted only bounded counts, 64-character SHA-256 hashes, allowlisted difference codes, duration, and version/cohort metadata. Fixture identifiers, labels, and amounts were absent from serialized evidence. |
| Clerk token/identity | Token refresh occurred on every request; synthetic sessions were rejected; the root provider synchronized Clerk load/sign-in/sign-out/account changes into the app shell; Admin role/scenario headers and query authority were absent in live mode; Admin query state was remounted per Clerk actor. |
| Revocation and sign-out | Device revocation retained its caller idempotency key and paginated through every device page. Current/all Clerk sign-out scopes remained distinct. Mobile sign-out removes credentials, clears process-wide private query state, and hides the in-memory owner view even when Clerk rejects the provider request, while retaining owner-namespaced onboarding, pending destination, PIN, and privacy-lock state. |
| Owner isolation and migration | Owners opened deterministic distinct encrypted namespaces. Session restoration and database lifecycle work are serialized and stale session generations/handles cannot publish or execute after another owner's transition. Existing PIN/privacy-lock records move into the first verified owner namespace before the legacy keys are removed. A claimed legacy export must match every table count and commit an owner-specific completion marker inside the encrypted database before cleanup. Schema-migration failure retains both copies; interrupted main/WAL/SHM cleanup is detected and retried on the next open. An unclaimed legacy database is never assigned to the first signer and remains an external ownership gate. |
| Admin authorization | `/api/v1/admin/access/me` returned only active-profile/active-role context. Effective permissions and Clerk provider active-session count were server-derived. Bearer requests rejected absolute/non-local paths, ambiguous/retryable write outcomes reused a bounded SHA-256-indexed idempotency key, and unknown Admin routes failed closed. `RECENT_AUTH_REQUIRED` remained exact and MFA status remained `enabled|missing`. The attributed BE003 migration resets its temporary owner role and revokes deployment-principal membership. |
| Admin operation availability | Only foundation self-context and security overview have accepted current mappings. Foundation navigation/attention/search/options, every users/access operation, and remaining security operations return explicit `provider_unavailable` without a network request; no Phase 14 endpoint was added. |

Commands executed successfully:

```text
npm --prefix apps/mobile test -- src/config/cutover.test.ts src/services/cutover/shadow-comparison.test.ts src/services/live/auth-service.test.ts src/state/app-shell-live.test.ts src/storage/database-owner.test.ts
# 5 suites, 15 tests; 4.230 s wall time before the added row-count mismatch case

npx --prefix apps/admin-web vitest run src/core/config/cutover.test.ts src/core/api/shadow-comparison.test.ts src/tests/identity-live-contract.test.ts
# 3 files, 14 tests; 4.954 s wall time before the added explicit rollback assertion

npm --prefix apps/api test -- test/contract/security/admin-self.contract-spec.ts test/contract/security/openapi-security.contract-spec.ts test/integration/security/admin-self.integration.spec.ts test/integration/security/admin-users.integration.spec.ts test/security/admin-self.security.spec.ts
# 4 suites passed, 1 live-database suite skipped; 5 passed and 4 skipped; 6.799 s wall time

npm --prefix apps/mobile test -- src/storage/database-owner.test.ts src/config/cutover.test.ts src/state/app-shell-live.test.ts
# 3 suites, 10 tests after rollback and exact row-count assertions

npx --prefix apps/admin-web vitest run src/tests/identity-live-contract.test.ts src/features/foundation/repository.test.ts src/features/users/repository.test.ts src/features/access/repository.test.ts src/features/security/repository.test.ts src/components/admin/shell-state.test.ts src/components/admin/AdminShell.test.tsx
# 7 files, 164 tests
```

The BE003 live-database suite was skipped because no disposable `DATABASE_URL` was configured and local Docker was stopped. Static contract/security and injected repository proofs passed; this skip remains recorded for the Wave 1 verification gate.

## Open external observations

| Gate | Status | Missing action |
|---|---|---|
| Deployed server-derived cohort and observation interval | Open | Deploy the accepted Wave 1 SHA to the protected non-production environment, advance the server-owned cohort through each stage, and retain redacted timestamps/metrics. |
| Real Clerk Phone/Google identities, OTP retry, session revocation, recent authentication, and MFA | Open | Identity environment owner must execute the matrix with protected test identities and record redacted identity/session references. |
| Physical iOS/Android owner migration and SQLCipher verification | Open | Mobile QA owner must run the supported-device matrix on signed development builds and record before/after counts without user data. |
| Ownership claim for an unclaimed legacy plaintext database | Open | Identity/data migration owner must establish the prior local owner's Clerk identity before setting the owner hash; automatic first-signer import is prohibited. |

These external items are not acceptance passes and do not claim deployed production evidence.

## Wave verification gate

Executed on `2026-09-08` from the exact Wave 1 working tree:

| Surface | Command/result |
|---|---|
| API contracts/unit | Fresh `npm run test:contract`: 72 suites, 207 tests passed in 48.305 s. Fresh `npm run test:unit`: 117 suites, 879 tests passed in 154.999 s under the parallel verification load. Focused Clerk/security/self-context and migration-role checks passed; migration checksums were regenerated and verified. |
| API identity/security | Focused BE003 contract/integration/security command: static suites passed; the live-database suite remained skipped because Docker was stopped and no disposable `DATABASE_URL` was configured. Identity/performance scripts passed syntax validation. |
| Mobile focused identity/storage | Final database/sign-out regression run passed 2 suites and 18 tests. Broader Clerk/runtime/auth/app-shell/storage/provider runs passed. Coverage includes fail-closed provider errors, known-only OTP mapping, full device pagination, Clerk lifecycle synchronization, provider-failure local sign-out, owner separation, stale-handle rejection, exact claimed-legacy row counts, atomic export completion marking, post-export migration failure, residual sidecar retry, and unclaimed-legacy retention. |
| Mobile full test | Fresh isolated `npm test`: 427 suites and 1,780 tests passed in 53.883 s. A preceding resource-contended parallel run timed out in two unrelated five-second UI tests; both passed immediately in isolation before the clean full rerun. Jest reported the existing open-handle warning after the complete passing summary. |
| Mobile static/build gates | `npm run typecheck` passed; `npm run lint` passed with 0 errors and 80 warnings; `npx expo install --check` reported dependencies up to date; `npm run check:frontend-quality` passed every boundary scan. Production-shaped `npx expo export --platform web` bundled successfully and generated 125 static routes at `C:\Users\DELL\AppData\Local\Temp\masarifi-phase14-619532eddaf84ed788d7337c337dd087`; no secret value was used. `npm audit --audit-level=high` passed the high-severity gate and reported 32 upstream moderate advisories. |
| Admin full test | Fresh isolated `npm test`: 80 files and 845 tests passed in 22.00 s. A preceding resource-contended parallel run timed out in seven unrelated mock UI waits; all 18 affected tests passed immediately in isolation before the clean full rerun. |
| Admin static/build | `npm run typecheck` and `npm run lint` passed. Fresh `npm run build` with valid non-secret live API/Clerk configuration compiled and generated 82 pages plus the Clerk proxy. Production dependency audit (`npm audit --omit=dev --audit-level=high`) reported zero vulnerabilities. |
| Admin identity browser | `npx playwright test tests/e2e/permissions.spec.ts tests/e2e/users-access.spec.ts --project=desktop-1440`: all 29 cases passed. The Windows Next development-server child did not terminate after the result stream and was stopped manually; no browser assertion failed. |
| Production mock/secret boundary | Admin runtime and production-mock tests: 2 files, 15 tests passed in 2.61 s. The browser mock worker exposes the public flag through a statically bundled environment access, permits framework navigation, and fails every unhandled `/api/` request. Mobile production/provider/secret scans passed through `check:frontend-quality`. |

## Review and security disposition

- Independent architecture, Mobile, and Admin/API reviews found the missing Clerk lifecycle connection, owner-switch storage/database risks, provider-failure sign-out exposure, incomplete SQLCipher cleanup state transitions, unsafe Admin mapping claims, stale linked-device session counts, and ambiguous retry identity. Each locally actionable blocker was fixed and its affected checks rerun; the final architecture re-review reported no remaining actionable blocker.
- Codex Security scan `64f51832-06e3-4aa1-877a-283ce3ad0037` found three Wave 1 issues: bearer forwarding to an absolute URL, interrupted plaintext cleanup, and live database access without an owner. Scan `150b735b-8973-4b03-9bff-1c7a1db796d6` then found query-cache cross-account retention, stale session restore ordering, legacy privacy-lock bypass, incomplete restart cleanup, transient Admin idempotency loss, and retained migration-owner membership. All nine findings are fixed with focused regressions and the full gates above. Final sealed post-fix scan `b48b52bf-e515-444d-aa76-e3754d0f1e8b` covered all 94 changed review items across Mobile, Admin, and API, and completed with zero findings and complete coverage; preserved unrelated paths were explicitly excluded.

No real Clerk identity, OTP, hosted deployment, or physical device was available. Those gates remain open in `external-gates.md`; no local fixture is represented as external proof.
