# Phase 0 Research: Authentication, Profiles, Preferences & Sessions

**Spec**: SPEC-BE-002
**Date**: 2026-08-27
**Status**: Complete; main baseline cleared 2026-08-28

This document records the decisions that remove implementation ambiguity. It is
not evidence that Clerk, Supabase, source code, migrations, or production secrets
have been configured.

## R-001 — Implementation Baseline

**Decision**: Use the approved SPEC-BE-001 architecture already merged into
`origin/main` at `d17d140e0eaf0270895c7fbe1dc25d84e2d9bb0f`. Continue all Backend
work directly in the existing `main` checkout and do not create a worktree.

**Rationale**: The merge supplies the NestJS API/worker, database roles,
migrations, error envelope, outbox, container, CI, and test baseline owned by
SPEC-BE-001 while the Spec ID, owned paths, commits, and evidence keep the
SPEC-BE-002 diff bounded on `main`.

**Alternatives rejected**:

- Copying foundation files: creates a divergent duplicate of the merged baseline.
- Creating or retaining a Backend feature branch: violates the main-first
  Constitution.
- Creating another worktree: forbidden by the Constitution and unnecessary.

## R-002 — Clerk Backend Authentication

**Decision**: Add only the official `@clerk/backend` package and use its supported
`authenticateRequest()` boundary with `acceptsToken: 'session_token'`. The NestJS
guard converts the Express request to the standard request shape required by the
SDK, requires an authenticated state, `role = authenticated`, nonblank Clerk user
and session IDs, and rejects pending sessions. The same verifier supplies the
existing SPEC-BE-001 `META_TOKEN_VERIFIER` seam.

**Rationale**: Clerk's authenticator owns JOSE algorithm, issuer, signature, `kid`,
time, and key-rotation handling. One verifier prevents `/meta`, `/api/v1/me`, and
later consumers from drifting into separate trust rules.

**Alternatives rejected**:

- Handwritten JWT parsing, signature validation, or JWKS caching: security-critical
  duplication of the provider SDK.
- A second verifier just for `/meta`: creates inconsistent accept/reject behavior.
- A static PEM `jwtKey` in the first implementation: avoids a network lookup but
  turns normal Clerk key rotation into a secret rollout and deployment operation.

**Sources**:

- [Clerk authenticateRequest](https://clerk.com/docs/reference/backend/authenticate-request)
- [Clerk manual JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens)

## R-003 — Audience, Authorized Parties, and Native Requests

**Decision**: Do not require an `aud` claim unless Masarifi later configures one in
Clerk. Validate `azp` against `CLERK_AUTHORIZED_PARTIES` when the claim is present.
Accept an otherwise valid native Authorization-header request when `azp` is absent.
The authorized-party list contains trusted Admin/web origins, not the Mobile OAuth
callback. `masarifi://oauth-callback` remains only in Clerk's Mobile SSO redirect
allowlist.

**Rationale**: Clerk Session Token v2 does not include `aud` by default. `azp` is
the originating HTTP `Origin` and may be absent for native requests. Treating the
custom callback URI as either claim would reject valid Mobile sessions while
failing to validate the actual web origin.

**Alternatives rejected**:

- Requiring a nonexistent default `aud`: breaks the approved native flow.
- Putting the callback scheme in `CLERK_AUTHORIZED_PARTIES`: compares unrelated
  protocol values.
- Accepting any present `azp`: weakens the web-origin boundary.

## R-004 — Native Clerk/Supabase Integration

**Decision**: Enable Clerk's native Supabase integration and register the Clerk
instance domain as Supabase Third-Party Auth. Local Supabase uses:

```toml
[auth.third_party.clerk]
enabled = true
domain = "<approved-development-instance>.clerk.accounts.dev"
```

The actual non-secret instance domain is taken from the configured Clerk instance.
RLS reads the text subject with `auth.jwt() ->> 'sub'`; it never calls `auth.uid()`
and never reads `auth.users`. Supabase Auth remains installed platform
infrastructure but Masarifi creates no Supabase Auth identity.

**Rationale**: The native integration verifies Clerk asymmetric session tokens and
keeps one identity authority. It also matches current Supabase guidance and avoids
shared JWT-secret rotation.

**Alternatives rejected**:

- Clerk's legacy Supabase JWT Template: deprecated since 2025-04-01 and explicitly
  forbidden by the project.
- Mirroring users into `auth.users`: adds a second identity lifecycle and violates
  the approved architecture.
- `auth.uid()`: assumes a Supabase UUID, while Clerk `sub` is text.

**Sources**:

- [Supabase third-party auth with Clerk](https://supabase.com/docs/guides/auth/third-party/clerk)
- [Supabase third-party auth overview](https://supabase.com/docs/guides/auth/third-party/overview)
- [Clerk Supabase integration](https://clerk.com/docs/guides/development/integrations/databases/supabase)

## R-005 — RLS with the Direct PostgreSQL API

**Decision**: Keep SPEC-BE-001's direct `pg` access. For every customer transaction,
the API checks the Clerk token first, opens a database transaction through the
existing pool, sets transaction-local `request.jwt.claims` to a minimal verified
JSON object (`sub`, `sid`, `role`), and performs all queries before commit/rollback.
The production API login must assume only the non-BYPASSRLS `masarifi_api` role.
Worker processing uses the existing least-privilege `masarifi_worker` role and no
customer claim context.

**Rationale**: Supabase Third-Party Auth injects claims for the Data API, not for a
raw PostgreSQL connection. `set_config(..., true)` is transaction-local, preventing
identity leakage through pooled connections. Forced RLS remains a separate
database control for both direct API and future approved Data API access.

**Alternatives rejected**:

- Trusting native Third-Party Auth to populate direct `pg` sessions: it does not.
- Session-level claim settings: can leak one identity to the next pooled request.
- Adding `supabase-js` only to proxy product queries: duplicates the existing
  database layer without a capability gain.
- Connecting the API as `postgres`, service role, superuser, or BYPASSRLS: defeats
  the required independent authorization layer.

## R-006 — Public Grants and Owner Policies

**Decision**: Enable and force RLS on all five public tables. Add explicit policies
for `authenticated` and `masarifi_api` using the same owner predicate. Every UPDATE
uses both `USING` and `WITH CHECK`. Give direct roles only the safe table/column
privileges required by the contracts; no client can select push-token hashes or
ciphertext. Give `masarifi_worker` only the server-controlled synchronization and
inbox privileges it requires. Revoke default grants before granting anything.

**Rationale**: Supabase may not expose new tables automatically, and RLS does not
replace SQL privileges. Matching policies for PostgREST and direct API paths makes
the authorization matrix testable without making Admin a database principal.

**Alternatives rejected**:

- One permissive `FOR ALL` policy: makes column and operation intent opaque.
- Admin direct grants: SPEC-BE-003 owns privileged access through backend routes.
- A safe-projection view: no current client is allowed direct access and column
  grants plus DTO allowlists are sufficient.

**Sources**:

- [Supabase securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase table exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## R-007 — Webhook Verification and Durable Receipt

**Decision**: Mount one size-limited raw `application/json` parser for
`/webhooks/clerk` before the global JSON parser. Call the official Clerk
`verifyWebhook()` with the environment-specific signing secret before JSON/schema
trust. Use the verified `svix-id` header as `clerk_event_id`; `data.id` is the Clerk
user subject. Store a SHA-256 payload hash, the bounded payload, type, and verification
time in one insert. Return `202` after a new insert or an identical unique conflict;
return `409 WEBHOOK_EVENT_CONFLICT` only when the same delivery ID has another
payload hash. Return `204` for a well-signed unsupported event without storing it.

**Rationale**: Clerk delivery is at least once and can be duplicated, delayed, or
out of order. SDK signature/timestamp validation prevents unaudited cryptography;
database uniqueness provides business idempotency. Returning 2xx for a genuine
duplicate stops useless provider retries.

**Alternatives rejected**:

- Parsing JSON before signature verification: loses the exact signed bytes.
- Using `data.id` as delivery identity: it deduplicates every event for the same
  user and drops valid updates.
- Deduplicating only by payload hash: two distinct legitimate deliveries may have
  identical bodies.
- Returning `409` for every duplicate: causes the provider to retry a completed
  delivery.

**Sources**:

- [Clerk verifyWebhook](https://clerk.com/docs/reference/backend/verify-webhook)
- [Clerk webhooks overview](https://clerk.com/docs/guides/development/webhooks/overview)
- [Clerk webhook synchronization](https://clerk.com/docs/guides/development/webhooks/syncing)

## R-008 — Webhook Ordering, Recovery, and Reconciliation

**Decision**: Treat each supported webhook as a synchronization signal. Before an
effect, query the current Clerk user by immutable subject through the official
Backend API. Apply only current provider email/phone fields; never overwrite the
customer's display name on update. A confirmed not-found result moves an existing
profile to `deletion_pending`, clears device push capability, and emits
`profile.deletion_requested`; SPEC-BE-003 owns final deletion. Reconciliation uses
the same function and pages by Clerk subject. Provider errors are retryable and
never interpreted as deletion.

For crash and per-subject concurrency safety without inventing a queue or lease
schema, a worker transaction locks one eligible inbox row with
`FOR UPDATE SKIP LOCKED` and takes a transaction-scoped PostgreSQL advisory lock
derived from the immutable Clerk subject. Concurrent webhook and reconciliation
work for that subject therefore serializes before the provider lookup. The worker
then performs one bounded read-only Clerk lookup, creates a new profile directly in
its current state, applies profile/default/outbox changes, and completes or records
failure before commit. A provider error or process crash rolls back the claim and
all partial effects. Batch size is deliberately one per
transaction while a provider call is inside it; performance evidence decides
whether the Master Plan needs lease columns or a queue in a later approved
amendment.

**Rationale**: Reading current Clerk state makes stale create/update/delete delivery
converge without adding an undocumented provider-version column. One-row transactions
fit the fixed inbox schema and provide the smallest correct recovery mechanism.

**Alternatives rejected**:

- Applying event payload order directly: the owned schema has no durable provider
  version column, so stale events can regress state.
- Adding a queue or distributed lock: SPEC-BE-002 owns neither and no measured need
  exists yet.
- Marking a row `processing` and calling Clerk after commit: a crash leaves no
  lease timestamp in the fixed table contract.
- Treating any Clerk error as user deletion: can suspend customers during outage.

## R-009 — Defaults and Profile Lifecycle

**Decision**: A first successful `user.created`/reconciliation creates the profile,
preferences, and onboarding rows atomically. Initial display name may be copied
from the current Clerk user once; later Clerk updates synchronize only provider-owned
email and phone. Customer mutations update display name, locale, and timezone only.
The status transition owned here is `active -> deletion_pending` on confirmed Clerk
absence. `suspended` and `deleted` transitions remain SPEC-BE-003 operations.

**Rationale**: The three rows are the minimum product identity aggregate. Separating
provider-owned and customer-owned fields prevents asynchronous webhooks from
overwriting user preferences.

**Alternatives rejected**:

- Lazy preference creation on first read: creates race and partial-profile states.
- Physical profile deletion: destroys reconciliation evidence and belongs to the
  privacy lifecycle Spec.
- Email/phone matching: can join two different Clerk subjects.

## R-010 — Device and Session Semantics

**Decision**: HMAC the normalized device fingerprint before storing it in the
existing `device_fingerprint` column; the raw value is never persisted or logged.
Registration uses `(user_id, device_fingerprint)` as its natural upsert key and
records only the verified current Clerk session ID. Revocation first atomically
marks the device and push tokens revoked, emits the outbox event, then calls Clerk
to revoke the linked session. Provider failure returns a retryable safe error and
keeps the local revocation effective. The current device additionally requires
Clerk recent-verification evidence (`fva`) satisfying the documented policy.

**Rationale**: A fingerprint is correlation evidence, not authentication. Local
revocation must fail safe even when Clerk is unavailable; Clerk remains the source
of truth for the actual session.

**Alternatives rejected**:

- Plain fingerprint storage: unnecessary persistent device identifier exposure.
- Client-supplied user/session authority: forgeable.
- Rolling back local revocation when Clerk is unavailable: restores push access
  after a security action.
- A Masarifi sessions table: explicitly out of scope.

## R-011 — Push-Token Protection

**Decision**: Use Node's built-in `crypto` only. Compute uniqueness with
HMAC-SHA-256 under a dedicated backend hash key and encrypt the token with
AES-256-GCM under a separate encryption key. Store a versioned envelope containing
the key ID, IV, tag, and ciphertext; never return hash or ciphertext. Runtime keys
are `MASARIFI_PUSH_TOKEN_HASH_KEY` and `MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS` and are
backend/worker secrets. The first key-ring entry encrypts; configured older entries
decrypt only for bounded rotation. Zeroize/overwrite local references where
practical and never include plaintext in exception objects.

**Rationale**: Standard-library authenticated encryption protects confidentiality
and integrity; a keyed digest prevents offline enumeration and supplies stable
uniqueness. A small key ring permits rotation without adding a database column or
dependency.

**Alternatives rejected**:

- Plain SHA-256 of a push token: insufficient if token entropy/provider format
  weakens and provides no key rotation.
- One key for both hashing and encryption: violates key separation.
- A new crypto library or database Vault call: adds complexity without a required
  capability.
- Plaintext or reversible token in logs/DTOs: prohibited.

## R-012 — Mutation Idempotency and Versions

**Decision**: Validate a bounded `Idempotency-Key` on every customer mutation but
do not promise durable response replay or mismatched-key rejection in this Spec.
Profile/preferences/onboarding use `expectedVersion`; device registration uses its
natural owner/fingerprint key; device revoke returns `204` for the same resulting
revoked state. Webhook delivery uses its own signed unique ID. SPEC-BE-006 later
provides the sole shared durable idempotency store.

**Rationale**: This satisfies current natural repeatability without stealing
`private.idempotency_keys` ownership or pretending a header alone guarantees replay.

**Alternatives rejected**:

- A local SPEC-BE-002 idempotency table: duplicates SPEC-BE-006 ownership.
- Returning `IDEMPOTENCY_KEY_REUSED` without storing request hashes: unverifiable.
- Last-write-wins profile updates: loses concurrent customer changes.

## R-013 — Events and Outbox

**Decision**: Publish the five owned events through SPEC-BE-001's outbox in the same
database transaction as each effect. Device UUIDs may populate `aggregate_id`.
Because BE-001's aggregate ID is UUID/null and Clerk profile IDs are text, profile
events use `aggregate_id = null` and include the Clerk profile ID only in the
bounded safe payload.

**Rationale**: This reuses the owned durable event primitive without changing its
contract or inventing another event store.

**Alternatives rejected**:

- Changing BE-001's aggregate type in this Spec: cross-Spec mutation.
- Publishing after commit: can lose an event after a successful database change.
- Adding an identity-specific event table: duplication.

## R-014 — Provider and Native-Application Configuration

**Decision**: The configuration checklist must prove one Development application
named `Masarifi Development`; Phone OTP and Google only; SMS countries Egypt,
Saudi Arabia, and UAE only; Android package/iOS bundle `com.masarifi.mobile`;
Native API/application records; and Mobile SSO callback
`masarifi://oauth-callback`. The current inability to activate the full SMS
country allowlist under the Clerk tier is recorded as a production release blocker.
No test OTP, account credential, secret key, JWT, or signing secret is captured.

SPEC-BE-002 provisions the Google connection and native application facts only.
SPEC-BE-014 selects and implements the client hook. If browser SSO is selected it
uses current `useSSO()`; deprecated `useOAuth()` is not planned. If native Google
is selected later, its Google client IDs, SHA fingerprints, config plugins, and
development build requirements are handled in the cutover Spec.

**Rationale**: Provider configuration is part of the authentication boundary, but
client implementation is not owned here.

**Sources**:

- [Clerk Expo deployment](https://clerk.com/docs/guides/development/deployment/expo)
- [Clerk Expo useSSO](https://clerk.com/docs/reference/expo/native-hooks/use-sso)
- [Clerk Phone OTP](https://clerk.com/docs/guides/development/custom-flows/authentication/email-sms-otp)
- [Clerk Expo Google](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google)

## R-015 — OpenAPI, Errors, and Contract Drift

**Decision**: Add a SPEC-BE-002 OpenAPI fragment and extend BE-001's generation/drift
test to compose approved fragments into one runtime document. Extend the shared
safe-domain error mapping for the stable identity errors; do not introduce local
exception envelopes. Reject unknown DTO properties and keep all response projections
explicit and masked.

**Rationale**: The API has one runtime contract and one error envelope, while each
Spec retains ownership of its fragment.

**Alternatives rejected**:

- Replacing the BE-001 snapshot: erases its contract evidence.
- A second Swagger server/document: fragments runtime truth.
- Passing Clerk or PostgreSQL exception text through responses: leaks internals.

## R-016 — Performance, Caching, and Operational Limits

**Decision**: Use primary/unique owner keys and the explicitly documented composite
indexes. Device pagination uses opaque cursor `(last_seen_at,id)` and limit 1..100.
No Redis, shared profile cache, materialized view, queue, or new infrastructure is
introduced. Clerk SDK key handling is the only JWT-key cache. API/request and
provider calls are time-bounded; worker and redaction work are bounded and abort on
shutdown. Measure the database 50 ms P95 and HTTP 250/500 ms P95/P99 budgets against
production-like cardinality before completion.

**Rationale**: Indexed PostgreSQL queries satisfy the current scope. Authorization
and current device/session state should not be hidden behind a speculative cache.

**Alternatives rejected**:

- Redis or a profile cache: no measured bottleneck and invalidation would be
  security-sensitive.
- Offset pagination: grows slower and is unstable under device updates.
- Unbounded webhook/reconciliation/redaction batches: risks connection and memory
  exhaustion.

## Resolved Unknowns Summary

| Unknown | Resolution |
|---|---|
| Clerk backend verifier | Official `@clerk/backend` `authenticateRequest()` |
| Default `aud` claim | Not present; validate only if explicitly configured |
| Native `azp` | May be absent; validate only when present |
| Mobile callback vs authorized party | Callback is redirect allowlist only; authorized parties are web origins |
| Supabase identity function | `auth.jwt() ->> 'sub'`, never `auth.uid()` |
| Direct `pg` RLS context | Transaction-local minimal verified claims |
| Webhook delivery identity | Verified `svix-id`, not body `data.id` |
| Duplicate webhook response | Identical duplicate receives `202` |
| Out-of-order webhook safety | Fetch current Clerk state before effect |
| Crash-safe processing | One locked row per transaction; no new queue/lease schema |
| Push-token protection | Node AES-256-GCM + HMAC-SHA-256 with separate keys |
| Durable customer idempotency | Deferred to SPEC-BE-006; natural repeatability here |
| Client auth implementation | Deferred to SPEC-BE-014 |
| Implementation start | Cleared on `main` at `4460ea56d6f53760fc6fefbfc35d0cc8c734dd75` |
