# Production Mock Removal Report

**Status**: Baseline inventory; update and close per wave

| Surface | Current production risk | Required final disposition |
|---|---|---|
| Mobile auth/app shell (Wave 1 local complete) | `createAuthService` selects the registered Clerk bridge in live mode; Clerk lifecycle changes rebind the owner-scoped app shell and SQLCipher database; unsupported reverification/aggregate operations fail explicitly | External Clerk OTP/revocation, physical-device SQLCipher, and verified ownership of any unclaimed legacy plaintext database remain open in `external-gates.md`; local proof is in `evidence/wave-01-identity.md` |
| Mobile core finance | Persistent SQLite mock constructors label themselves live | Live account/reference/ledger/sync adapters selected; SQLite retained for offline cache/queue/drafts only |
| Mobile planning | Persistent local planning mock is selected as live; no HTTP executor | Strict BE007 live adapter selected; local drafts/previews remain explicit local seams |
| Mobile tracking | HTTP adapter selected outside demo, but token wiring absent and some methods fabricate/search first page | Clerk-authenticated strict adapter; test-only mock event unreachable in production |
| Mobile voice/assistant | Live modules exist but token provider is never configured and module-time availability locks unavailable | Clerk token provider configured before use; strict live contracts or explicit unavailable states |
| Mobile reports | Local report calculator and delivery simulation are labeled live | Live BE010 adapter; local preview/draft only; delivery status server/provider-owned |
| Mobile notifications/support | Query modules import mocks directly; partial engagement adapter loses fields | Strict BE011 live adapter selected; device-native permission/local draft seams retained |
| Mobile operations | Live meta service exists without production consumer and fabricates fallback state | Strict live `/meta` consumer with explicit unavailable/stale state and free-only flags |
| Admin identity/shared client (Wave 1 local complete) | Clerk provider/proxy and actor-keyed bearer/query boundaries are active in live mode; self-context, permissions, and active-session count are server-owned; production rejects MSW and rejects non-local bearer URLs | Only `foundation.getSession` and `security.getSecurityOverview` have accepted Wave 1 mappings. Foundation navigation/attention/search/options plus users/access and remaining security operations return explicit `provider_unavailable` without a request. External Clerk MFA/recent-auth proof remains open. |
| Admin repositories | Many have partial live mappings, role/scenario client parameters, fabricated totals/defaults, or custom unsafe error flow | Exact strict live mappings; server-owned authorization; mock handlers test/development only |
| Admin billing | Full mock repository/routes exist | Explicitly unavailable/hidden from production capability and navigation; no billing network calls |

Final closure requires a source/import/bundle scan proving every retained mock is reachable only from an explicit demo or test entry point, plus production runtime tests for each service/repository.
