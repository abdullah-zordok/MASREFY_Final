# Mobile and Admin Contract Mapping

## Mobile

Existing routes remain: `/tracking`, `/tracking/history`, `/tracking/keywords`,
`/tracking/senders`, `/tracking/demo`, `/tracking/review`,
`/tracking/review/[id]`, and `/tracking/duplicates/[id]`, plus the current tracking
onboarding sequence. Android-only affordances remain capability-guarded; unavailable
iOS/native/provider capture is shown as unavailable, never routed to a production
mock.

| Client operation | Phase 08 API mapping |
|---|---|
| get/set status or mode | `GET/PUT /tracking/preferences`; `automatic_clear` = enabled/no review, `review_all` = enabled/review, `paused` = disabled |
| list/save/restore keywords | keyword-rule routes; `group`, language, origin, and derived-use metadata preserved |
| list/save/remove senders | sender-rule routes; display label, trusted flag, origin, and derived-use metadata preserved |
| process normalized event | `POST /imports` JSON; production adapters only, demo stays explicitly local |
| list/get/resolve review | review routes with expected version and idempotency key |
| get/resolve duplicate | duplicate routes; all four mobile resolutions are preserved |
| history/clear/purge | tracking-history routes; accepted ledger/audit trace is never erased early |
| undo automatic addition | existing ledger undo/reversal command, then Phase 08 history/feedback |
| report wrong detection | `POST /tracking/feedback` |

All persisted IDs are UUIDs. Mobile contracts accept UUIDs rather than requiring
mock-prefixed strings. The `AutomaticTrackingService` interface and export stay
stable; production selects the API adapter, while demo/test explicitly select the
fixture adapter.

## Admin

The current route and permission map is retained:

- `GET /admin/imports/overview`, sessions/list/detail, and retry-handoff;
- failures, low-confidence, duplicates, and unsupported-format queues/actions;
- institution/bank coverage and sender recognition/actions;
- parser rule list/detail, test preview, corpus runs, versions, publish/rollback;
- merchant and category rule list/actions;
- legacy `GET /admin/imports` and `POST /admin/imports/{id}/retry` compatibility.

Admin mock mode becomes explicit opt-in. Production uses the HTTP adapter and
fails visibly if unavailable. Mutations use permission, recent-MFA where required,
reason, expected-version, and idempotency headers/body fields; the fixture-only
`CONFIRM-SPEC-005` token is removed. Tables and detail views render untrusted text
as text, not HTML, and expose no raw body/object reference.

Admin source filters may display historical/unsupported `screenshot`, `receipt`,
`pdf_statement`, or `voice` records. Their presence in a filter does not enable an
ingestion parser; Phase 08 records them as unsupported. Voice processing remains
outside scope because it belongs to SPEC-BE-009.

## Seed and fixture boundary

Migrations seed only fictional institutions, sender identifiers, parser versions,
and bilingual reference keyword groups required for deterministic tests. They do
not seed customer sessions, operational metrics, transactions, review queues, or
demo events. Mobile/Admin fixtures remain available only in explicit demo/test
mode and mirror the OpenAPI DTOs.
