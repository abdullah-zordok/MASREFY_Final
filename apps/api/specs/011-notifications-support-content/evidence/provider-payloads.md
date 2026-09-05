# Provider payload evidence

`notification-providers.spec.ts` and the engagement DTO/security suites assert the
push allowlist: event ID, localized safe title/body, and registered route key only.
Tokens are decrypted only for the send call and never returned or logged. Template
variables, financial details, provider response bodies, and arbitrary routes are
rejected or redacted. These are deterministic snapshots; no real-device delivery
is claimed.
