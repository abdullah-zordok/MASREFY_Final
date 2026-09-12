# Automatic SMS Tracking Backend Gap Analysis

**Date:** 2026-09-12

## Existing functionality found

- Authenticated tracking preferences and status, including `automatic_clear`, `review_all`, and `paused`.
- Owner-scoped keyword and sender rule CRUD with validation, expected versions, and idempotent mutations.
- Normalized JSON SMS import intake with strict field, size, count, timestamp, currency, and source-channel validation.
- Import sessions/items, asynchronous worker claims, fenced retries, exponential backoff, reconciliation, and retained status/history.
- Stable source-identity hashing plus durable request idempotency and replay behavior.
- Parser execution, confidence routing, duplicate candidate generation, review creation, and owner-scoped read endpoints.
- Versioned/fenced review and duplicate decisions.
- Tracking-created transactions only through `LedgerService`, using stable tracking source identity as the ledger idempotency key and external reference.
- Per-account and global automatic-tracking gates, raw-payload retention/purge, immutable history, audit, and outbox events.

## Reusable endpoints and services

- `GET|PUT /api/v1/tracking/preferences`
- `GET /api/v1/tracking/status`
- `GET|POST|PATCH|DELETE /api/v1/tracking/keyword-rules`
- `GET|POST|PATCH|DELETE /api/v1/tracking/sender-rules`
- `GET|POST /api/v1/imports`
- `GET /api/v1/imports/:sessionId`
- `GET /api/v1/imports/:sessionId/items`
- `GET|POST /api/v1/reviews` and review decision routes
- `GET|POST /api/v1/duplicates` and duplicate decision routes
- `GET|DELETE /api/v1/tracking/history`
- Existing authenticated account API fields: account ID, status, type, currency, default state, last four digits, institution label, and `automaticTrackingEnabled`.
- `TrackingService`, `TrackingRepository`, `TrackingWorker`, `TrackingStorage`, `LedgerService`, and Phase 08/automatic-account migrations.

## Missing functionality

No backend capability required by the approved Android flow is missing.

The mobile client must supply an eligible `accountId`, because the backend intentionally rejects tracking imports that could bypass the global or per-account opt-in gate. The mobile coordinator can satisfy this from the existing account API by selecting only an unambiguous eligible account: exact last-four/currency match first, otherwise the sole eligible currency account, otherwise an eligible default account. If no safe selection exists, the event remains local and the UI asks the user to configure/select an account; it is not submitted with invented identity and the backend gate is not weakened.

## Backend changes actually required

None.

## Backend changes explicitly not required

- No new endpoint, controller, service, table, migration, queue, parser, import flow, or worker.
- No duplicate, review, history, retention, audit, outbox, or raw-storage changes.
- No new idempotency implementation or client-owned ledger write path.
- No relaxation of the account automatic-tracking gate.
- No backend SMS inbox access or device permission logic.

## Verification evidence

- Unit: tracking DTO, import, worker, review, and duplicate suites — 37 tests passed.
- Contract: tracking route and OpenAPI instance suites — 11 tests passed.
- Security: tracking ledger ownership boundary — 2 tests passed.
- One initial worker test hit the parser's 25 ms wall-clock budget while an accidentally broad Jest run saturated the machine; the exact isolated suite then passed 6/6. No source change was made.
