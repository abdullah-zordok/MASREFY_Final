# Phase 14 Foundation Evidence

## Installed Next.js Guidance

**Version**: 16.3.4
**Read in full**: App Router `proxy.ts` API reference, Proxy getting-started guide, authentication guide, data-security guide, and environment-variables guide under `apps/admin-web/node_modules/next/dist/docs/01-app`.

Applicable rules:

- Use the single `src/proxy.ts` convention beside `src/app`; keep its static matcher explicit and exclude framework/static assets.
- Proxy may perform a fast optimistic session redirect, but it must not fetch authorization state or replace server/API authorization. Every API, Route Handler, and Server Action remains independently authenticated and authorized.
- Do not rely on a layout or hidden client UI as an access boundary because layouts may not rerender and nested route work can still execute.
- Treat route parameters, search parameters, form data, and headers as hostile input. Client role/scenario values cannot grant authority.
- Keep the existing external HTTP API as the single data-access approach. Forward the current Clerk session bearer token and accept only minimal strict API DTOs.
- Keep server-only secrets outside `NEXT_PUBLIC_*`; public variables are build-time constants embedded in the browser bundle. Only the API origin, Clerk publishable key, and non-secret cutover metadata may be public.
- Validate production configuration during `next.config.ts` evaluation so an invalid build fails before deployment. Tests use explicit injected environments because `.env.local` is intentionally excluded from the test environment.
- Avoid broad request/response headers in Proxy. Authorization data stays in the API request seam and is never copied into a client-visible response header.
- Test matcher coverage and protected-route redirects directly; unknown production routes fail closed in the application permission map as well as at the optimistic Proxy boundary.

## Gate Record

The documentation commit `24d3cacefd39726b36e314b3a3988d11e0cfb50a` passed Backend Foundation run `34173850781` and all three Vercel commit statuses before this foundation work began.

## Implemented Foundation

| Boundary | Exact production symbols | Test evidence |
|---|---|---|
| Mobile runtime | `resolveClientMode`, `resolveClientRuntime` in `apps/mobile/src/config/client-runtime.ts`; `resolveDemoMode` consumes the same policy | `client-runtime.test.ts`, `demo-mode.test.ts` |
| Admin runtime/MSW | `resolveAdminMode`, `resolveAdminRuntime`, `mocksAllowed`, `mocksEnabled`; build validation in `next.config.ts`; guarded `MockProvider`/browser worker | `runtime.test.ts`, `production-mock-boundary.test.ts` plus valid/invalid production builds |
| Mobile/Admin comparison | `compareShadow` in each client's shadow-comparison module | Both `shadow-comparison.test.ts` files prove bounded redacted hashes/counts/codes and exact financial comparison |
| Mobile/Admin cutover | `createInitialCutoverPolicy`, `advanceCutover` in each client's cutover module | Both `cutover.test.ts` files prove ordered stages/waves, server cohort, rollback continuity, and `billingAvailable:false` |
| Mobile HTTP | `configureMobileApiTokenProvider`, `requestJson`, `HttpError`, `sanitizeHttpLog` | `apps/mobile/src/services/live/http-client.test.ts` |
| Admin HTTP | `configureApiTokenProvider`, `requestJson`, `apiClient`, `ApiError`, `sanitizeForLog` | `apps/admin-web/src/core/api/client.test.ts` and `core.test.ts` |

The accepted and rollback version for foundation/wave-zero policy is `24d3cacefd39726b36e314b3a3988d11e0cfb50a`. Each next wave must pass that value as `rollbackVersion` until its full stage becomes the next accepted version.

Exact client SDK resolutions are `@clerk/expo@4.6.5` and `@clerk/nextjs@6.39.6`. The Mobile lock also resolves React/React DOM/test renderer `19.2.8` to satisfy Clerk's secure peer range and overrides the Expo/React Native Metro trio to patched `0.83.8`; Expo's compatibility suggestion for React `19.2.0` remains a physical-build gate because reverting would make the Clerk dependency tree invalid. The Admin lock retains Next.js `16.3.4` and resolves React/React DOM `19.2.8`.

Verification: clean `npm ci --ignore-scripts` completed for both clients; both typechecks passed; `npm audit --omit=dev --audit-level=high` found zero High/Critical advisories in either production tree (Admin reported zero vulnerabilities; Mobile reported Moderate-only Expo/Clerk transitive findings).
