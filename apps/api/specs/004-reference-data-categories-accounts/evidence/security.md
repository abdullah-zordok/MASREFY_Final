# Security Evidence

Recorded 2026-08-29 for SPEC-BE-004.

- `npx jest --selectProjects security --runInBand --testPathPatterns=reference`
  passed 1 suite/4 tests.
- `npm run security:workflow-pins` passed 14 suites/71 tests.
- `npm audit --audit-level=high` found 0 vulnerabilities.
- pgTAP 017 and live integration tests prove forced RLS and minimum grants for
  anonymous, customer owner/non-owner, Admin, API, and worker roles, plus narrow
  execution on security-definer functions with fixed search paths.
- Unit/contract/E2E cases reject BOLA, BFLA, stale versions, missing recent MFA,
  missing reasons, mass assignment, malformed dates/money/rates, query arrays,
  and cross-owner category/account access without revealing object existence.
- Responses, events, logs, and bounded metric labels exclude names, bilingual
  labels, notes, last four, raw rates, provider references, Admin reasons, JWTs,
  secrets, SQL, and exception details. The shared error envelope retains only
  allowlisted stable codes, field errors, and request ID.
- Audit and outbox writes are in the same guarded transaction as each mutation;
  injected failures prove zero partial effects.
- OWASP API1/API3/API5/API8/API10, Top 10 access-control/injection/configuration/
  exceptional-condition boundaries, ASVS authorization/validation/logging/data
  protection controls, and applicable MASVS backend integration boundaries are
  represented by the named pgTAP, unit, contract, integration, E2E, container,
  and security suites.
- No FX provider worker or secret is enabled. Missing or stale approved metadata
  fails closed as `FX_UNAVAILABLE`; same-currency identity is the only computed
  result.

## 2026-09-05 Category Lifecycle Boundary

`051_client_category_usage.sql` proves the two new functions are unavailable to
PUBLIC/authenticated clients and executable only by `masarifi_api`. Caller/owner
identity is rechecked inside each security-definer function. Live integration
proves a foreign owner receives `NOT_FOUND`, while pgTAP proves foreign/system/
incompatible inputs cannot reassign transaction headers.
