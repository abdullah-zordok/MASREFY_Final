# US3 — Support access evidence

- [x] Only six registered resources and three safe actions parse; scope widening and self-approval fail.
- [x] Request, decision, grant, per-use assertion, revoke/end, and expiry paths are transactional and version checked.
- [x] `private.read_support_workspace` returns the registered masked/status/aggregate projection and appends per-use evidence.
- [x] Forced RLS separates request, approval, use, revoke, owner-decision, and worker-expiry operations.
- [x] pgTAP 012, unit/integration/security suites, canonical route E2E, and emergency-revoke runbook pass review.

Coverage: FR-020–FR-025, AC-007, SC-004.
