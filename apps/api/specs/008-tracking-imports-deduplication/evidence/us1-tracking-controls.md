# US1 Evidence — Tracking Controls

Status: implemented, locally verified by focused and full API gates where those
gates can run without Docker.

Evidence:

- `tracking_preferences`, `user_keyword_rules`, and `user_sender_rules` are
  created by the Phase 08 migrations with owner keys, versions, defaults,
  canonical uniqueness, and forced-RLS policies.
- `TrackingController` exposes owner preference, status, keyword-rule, and
  sender-rule routes through allowlisted DTOs and cursor/version mapping.
- `TrackingService` routes changes through repository commands with
  idempotency-key hashing and expected-version handling.
- Mobile live adapter preserves the `AutomaticTrackingService` boundary and uses
  backend DTO parity for preferences/rules.
- API `npm run verify` previously passed after implementation; a fresh rerun is
  in progress in this session.

Acceptance mapping: FR-001, FR-002, FR-003, FR-024, FR-026, FR-029, FR-030,
FR-035, AC-001, AC-002, AC-011, AC-015, AC-016.
