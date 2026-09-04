# Client Parity Evidence

Date: 2026-09-04
Scope: SPEC-BE-010 client adapters

The Mobile live adapter covers summary/breakdown, schedule CRUD and verification,
local drafts, request/status/retry, idempotency, safe errors, pagination, and
pending-attempt snapshot recovery. It derives its base URL from injected config or
`EXPO_PUBLIC_API_URL`; it persists no signed URL or secret.

The Admin adapter validates export requests/status and polls to a terminal state.
The OpenAPI parity test verifies all 15 client-used operation IDs and the exact
report type, period, format, channel, and status enums. Focused Mobile tests pass
(3 tests); Admin adapter tests pass (2 tests); Admin browser coverage passes
(3 tests). Production provider switching remains deliberately owned by
SPEC-BE-014 and no Phase 10 code changes that selection.
