# US1 — Exact authorization evidence

- [x] Exact server keys, aliases, seven roles, and 151-key seed: `permission-manifest.contract-spec.ts` (pass, 2026-08-29).
- [x] Database-active Admin, assignment window, exact permission, and fail-closed evaluator: pgTAP 010 plus `admin-permission.spec.ts` (pass on clean local database before final host WSL failure; rerun by CI).
- [x] Missing Admin, unrelated key, wildcard/client role assertion, disabled route, and stale MFA: `admin-auth.guard.spec.ts` and `exact-permission-boundary.spec.ts` (pass).
- [x] Permission budget: 500 samples, P95 1.740 ms and P99 2.473 ms against the 1,000,000-row security dataset; budget P95 <=25 ms.

Coverage: FR-001–FR-005, FR-012–FR-013, AC-002, SC-001–SC-002.
