# Client Contract Inventory

## Mobile

Existing tracking screens/routes cover status, history, keyword and sender rules,
demo intake, review list/detail, and duplicate detail, plus Android SMS/notification
and iOS shortcut/app-intent/share-extension onboarding affordances. Native capture
providers are currently unavailable and remain outside this backend implementation.

The existing `AutomaticTrackingService` contract exposes status/mode, history and
retention, normalized mock-event intake, review and duplicate decisions, keyword
and sender rules, undo, and wrong-detection feedback. Phase 08 preserves this
interface while adding a production HTTP adapter. Mode mapping is:

- `automatic_clear`: enabled, review not required;
- `review_all`: enabled, review required;
- `paused`: disabled.

Keyword parity requires group, Arabic/English language, origin, and derived-use
metadata. Sender parity requires display label, trusted flag, origin, and use
metadata. Duplicate parity requires `keep_existing`, `keep_new`, `keep_both`, and
`merge_details`; persisted IDs become UUIDs instead of fixture prefixes. Demo data
stays explicit and never becomes a production fallback.

## Admin Web

The existing imports/parsers feature already owns overview, sessions/detail,
failure, low-confidence, duplicate, unsupported, institution/bank, sender, parser
rule/detail/preview, corpus, version, merchant-rule, category-rule, and import
settings screens. Its exact backend permissions already exist in the manifest.

The repository currently routes to mock handlers when mocks are not explicitly
disabled. Phase 08 changes production to authenticated HTTP and makes mocks an
explicit opt-in for tests/demo. UUID DTOs, expected versions, idempotency, reason,
and recent-MFA replace mock-prefixed IDs and the fixture-only confirmation token.
Untrusted text remains text. Raw bodies/object references are never displayed.

Admin filters may retain names for screenshot, receipt, PDF, or voice records as
unsupported historical data. They do not enable parsers. Voice remains owned by
SPEC-BE-009 and is not implemented here.
