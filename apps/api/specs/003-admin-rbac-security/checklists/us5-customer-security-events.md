# US5 — Customer security-event evidence

- [x] Forced owner RLS hides other users and system events; anonymous and direct Admin-table access are denied.
- [x] Owner grants expose only `id`, `event_type`, `severity`, `metadata`, and `occurred_at`; IP hash, user agent, and user ID are not selectable.
- [x] The API uses a bounded opaque `(occurred_at,id)` keyset cursor, max 100, with safe Mobile projection.
- [x] pgTAP 014, live owner-column integration test, contract test, route E2E, and cursor unit test cover the boundary.
- [x] 1,000,000-row budget: P95 1.880 ms, P99 5.263 ms, payload 17,293 bytes; budgets 300/600 ms and 200 KiB.

Coverage: FR-014–FR-015, AC-008, AC-013–AC-014.
