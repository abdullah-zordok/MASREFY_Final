# Phase 11 Research Decisions

## Event ownership and transaction isolation

**Decision**: consume registered safe outbox envelopes after the owning domain
transaction commits. Phase 11 maps only known event versions to templates and
never calls a provider from the source transaction.  
**Rationale**: preserves exclusive domain-event ownership and makes provider
outage incapable of blocking financial/domain work.  
**Alternatives considered**: synchronous delivery (violates isolation); Phase 11
publishing domain events (violates ownership); generic dynamic event rendering
(unsafe/unbounded).

## Quiet hours, timezone, and DST

**Decision**: store `{enabled,start,end,weekdays,timeZone}` using validated IANA
zones; evaluate local date/time with Node `Intl.DateTimeFormat`. A DST gap advances
to the first valid instant; a fold uses the first matching instant for start and
the last for end so the quiet interval is never shortened.  
**Rationale**: runtime-native timezone data avoids a dependency and gives explicit,
testable behavior.  
**Alternatives considered**: fixed UTC offsets (wrong after DST/rule changes);
moment/luxon dependency (unneeded); database session timezone state (harder to
isolate/test across workers).

## Template variables and channel safety

**Decision**: each template key has a code-owned scalar variable allowlist and
sensitivity classification. Rendering performs exact `{{name}}` substitution,
rejects unknown/missing variables, strips forbidden controls, HTML-escapes where
HTML is ever used, and rejects CR/LF in subject/title/header fields. Push copy uses
separate safe template text, never a redaction of a sensitive rendered body.  
**Rationale**: allowlists and safe-by-construction lock-screen copy are smaller
and stronger than post-render secret detection.  
**Alternatives considered**: Handlebars/Mustache (new dependency and larger attack
surface); arbitrary expressions (forbidden); regex-only redaction (incomplete).

## Push providers

**Decision**: one narrow adapter contract with Expo (`fetch`), APNs (`node:http2`
and ES256 JWT), FCM HTTP v1 (`fetch` and RS256 service-account OAuth), plus an
injected deterministic provider. Configuration selects an adapter from the token's
existing provider; tokens are decrypted only immediately before send and never
returned/logged.  
**Rationale**: honors existing `expo/apns/fcm` token types without adding packages
and supports local completion without real credentials.  
**Alternatives considered**: Expo-only (does not cover existing provider values);
vendor SDKs (unneeded dependencies); generic webhook push (not a real adapter).

## Email delivery

**Decision**: reuse the installed Nodemailer/TLS configuration and extract only
the minimum shared transport seam if Phase 10's report-specific wrapper cannot be
called safely. Notification subjects/bodies use notification templates, stable
message IDs, no sensitive detail, and the same timeout/TLS requirements.  
**Rationale**: one SMTP configuration/transport behavior, no second provider
stack or dependency.  
**Alternatives considered**: direct SMTP implementation (error-prone); external
email API (new credentials/provider); calling report-specific method with fake
report data (incorrect contract).

## Delivery semantics and ambiguous acceptance

**Decision**: logical uniqueness is database-enforced by source/user/channel.
Claims use leases/fences. Retry only classified retryable failures. Ambiguous
provider acceptance records a non-success terminal/manual-review-safe state unless
the provider supports an idempotency key/status lookup; never claim exactly once.  
**Rationale**: at-least-once systems cannot prove exactly-once external effects.
Database dedupe still prevents duplicate internal work.  
**Alternatives considered**: blind retry after ambiguous acceptance (duplicate
risk); marking delivered (false claim); distributed lock (unneeded).

## Preference matrix

**Decision**: `PUT` is full replacement over every registered event type and
`in_app/push/email` channel. Server defaults are deterministic; unknown/missing
entries are rejected. Quiet hours apply to push/email; in-app storage remains.  
**Rationale**: prevents partial-merge ambiguity and matches existing preference
replacement patterns.  
**Alternatives considered**: sparse overrides (hidden defaults); per-template
preferences (unstable as templates version); client-only filtering (not trusted).

## Campaign audience and approval

**Decision**: use a strict JSON grammar over server-known platform, locale,
profile activity, and explicit safe segment keys, with configured per-selector and
total bounds. Preview returns aggregate counts and an expiring version/hash. Above
the configured threshold, creator and approver differ. Expansion streams keyset
batches and checks pause/cancel/version before each claim.  
**Rationale**: satisfies current Admin campaign contract without storing arbitrary
SQL or audience snapshots full of identifiers.  
**Alternatives considered**: raw SQL/query builder (injection and exfiltration);
materialized audience table (not owned); synchronous expansion (unbounded).

## Ticket lifecycle

**Decision**: states are `open`, `waiting_customer`, `waiting_support`, `resolved`,
and `closed`. Customer reply changes `waiting_customer` to `waiting_support`;
Admin reply changes `waiting_support` to `waiting_customer` unless resolved.
Resolved can close; reopen returns eligible resolved/closed tickets to
`waiting_support` under configured time/reason rules. Every mutation is versioned.  
**Rationale**: exactly follows the Master Plan while mapping legacy client names
at adapters.  
**Alternatives considered**: accepting client status directly (BFLA); implicit
transitions in UI (race-prone); adding a transition table (unneeded).

## Internal-note isolation

**Decision**: keep notes only in `private`, expose them only through a dedicated
Admin repository query/DTO, and statically/dynamically deny the table/field from
customer projections, serializers, privacy exports, Realtime, logs, search, cache,
and attachment downloads.  
**Rationale**: structural isolation is safer and smaller than filtering a shared
message list.  
**Alternatives considered**: `isInternal` on public messages (easy leakage);
customer RLS filter alone (does not cover service-role DTO/export paths).

## Attachment quarantine and malware scanning

**Decision**: server generates a UUID key under a ticket/upload prefix in the
existing private bucket. Finalize verifies object metadata/hash/size/type and
creates pending metadata. The worker streams bytes through a minimal ClamAV
INSTREAM adapter using `node:net`; deterministic injected scanner covers local
tests. Only `clean` rows can be signed. Rejected objects are deleted idempotently.  
**Rationale**: no new dependency, no download-before-scan window, and production
can use a standard scanner without putting credentials in code.  
**Alternatives considered**: trust MIME/extension (unsafe); scan in request
(unbounded); shelling out to `clamscan` (container coupling/injection risk);
storing bytes in Postgres (wrong storage boundary).

## Feedback and abuse disclosure

**Decision**: owners see only their feedback/report safe status. Abuse resource
validation returns one generic accepted/unavailable result and database uniqueness
serializes duplicate-active races. Admin detail masks reporter/resource fields
unless the exact action permission requires them.  
**Rationale**: prevents enumeration while supporting moderation.  
**Alternatives considered**: eager resource not-found errors (disclosure); client
dedupe (race); globally visible report state (privacy violation).

## Content lifecycle and cache

**Decision**: support article/faq/policy/announcement with ar/en translations and
draft/review/published/retired states. Current Admin contracts do not define
scheduled content publishing, so publishing is immediate after approval and no
schedule job is created. Cache only published projections for five minutes using
locale/type/version/query hash; publish/retire changes the version key.  
**Rationale**: matches the executable contract and Master Plan conditional rule,
while version keys make stale drafts unreachable.  
**Alternatives considered**: infer scheduling from generic action enum (not a
content contract); cache raw rows (draft leak); Redis (no measured need).

## Client integration boundary

**Decision**: add live-capable adapters and map current service/domain schemas,
state names, cursors, safe errors, and upload flow. Keep explicit mock/demo
providers for tests; do not silently flip production provider selection.  
**Rationale**: fulfills Phase 11 parity and removes owned no-ops without taking
SPEC-BE-014's production cutover ownership.  
**Alternatives considered**: full mock deletion/switch (future-Spec violation);
backend-only contracts (fails explicit user requirement).

## Provider-independent completion

**Decision**: deterministic adapters emulate success, retryable failure, terminal
failure, timeout, ambiguous acceptance, malformed response, and recovery with
payload snapshots. Real-provider/device proof remains an external gate only when
credentials/devices are absent.  
**Rationale**: completes every local behavior honestly without inventing secrets
or calling simulation real delivery.  
**Alternatives considered**: block all work on credentials (unnecessary); embed
test credentials (forbidden); declare stub success as provider evidence (false).
