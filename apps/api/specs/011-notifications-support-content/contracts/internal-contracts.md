# Phase 11 Internal Contracts

## Registered Domain Event Input

```ts
type EngagementSourceEvent = {
  schemaVersion: 1;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  userId: string;
  occurredAt: string;
  locale?: 'ar' | 'en';
  routeKey?: string;
  variables: Record<string, string | number | boolean>;
  expiresAt?: string;
};
```

Only code-registered `eventType` values and variable keys are accepted. Future
SPEC-BE-012 event fixtures may validate compatibility but cannot be registered as
published production events until that Spec owns them.

## Template Registry

Each entry defines `eventType`, permitted `templateKey`, channel set, required and
optional scalar variable names, sensitivity, safe route keys, expiry behavior, and
whether quiet hours may be bypassed. Database templates supply text only; they
cannot add variables, routes, providers, conditions, URLs, or expressions.

Rendering result:

```ts
type RenderedNotification = {
  templateId: string;
  templateVersion: number;
  locale: 'ar' | 'en';
  channel: 'in_app' | 'push' | 'email';
  title: string;
  bodySafe: string;
  routeKey: string | null;
};
```

Unknown/missing variables, controls in title/subject, oversized output, absent
published template, or unsafe route returns `TEMPLATE_RENDER_REJECTED` without
including template/event data in the error.

## Preference and Quiet-Hour Policy

Input is the complete matrix for all registered event types x three channels.
Decision is one of `store`, `deliver_now`, `defer_until`, `suppress_disabled`,
`suppress_expired`, or `suppress_invalid_token`. The decision records only a safe
reason code/time. In-app always stores a valid event. DST behavior is fixed in
`research.md` and tested with an injected clock.

## Provider Contract

```ts
type ProviderRequest = {
  deliveryId: string;
  idempotencyKey: string;
  tokenOrRecipient: string;
  eventId: string;
  title: string;
  body: string;
  routeKey: string | null;
  expiresAt: string | null;
};

type ProviderResult =
  | { status: 'accepted'; providerRef?: string }
  | { status: 'retryable'; code: string; retryAfterMs?: number }
  | { status: 'terminal'; code: string; revokeToken?: boolean }
  | { status: 'ambiguous'; code: 'DELIVERY_ACCEPTANCE_UNKNOWN' };
```

Implementations: Expo HTTP, APNs HTTP/2, FCM HTTP v1, SMTP notification email,
and deterministic injected test provider. Requests must never be logged. Provider
configuration is runtime-only and validated fail-closed when the provider is enabled.

## Campaign Audience Grammar

```json
{
  "platforms": ["ios", "android", "web"],
  "locales": ["ar", "en"],
  "activity": "all|active|inactive",
  "segmentKeys": ["server-known-key"]
}
```

Every array is unique and bounded; absent selectors have documented defaults.
No arbitrary keys, user IDs, emails, tokens, SQL, expressions, code, or URLs.
Preview returns `{previewId,audienceVersion,eligible,excluded,optedOut,expiresAt}`
and no identities. Create/approve must present the current preview/version/hash.

## Ticket Transition Contract

Commands: `open`, `customer_reply`, `admin_reply`, `assign`, `set_priority`,
`resolve`, `close`, `reopen`, `add_internal_note`. Each accepts actor context,
expected version, idempotency key, and reason where privileged. Repository locks
the ticket, reauthorizes, checks the transition, inserts immutable message/note,
updates ticket, appends audit/outbox, and commits atomically.

Customer DTO construction has no note input parameter. Admin note DTO construction
is a separate function and may not be reused by customer controllers/exports.

## Attachment Contract

Initialize accepts ticket, safe display filename, declared content type/size/hash.
It returns upload ID, server-generated key hidden behind a short signed URL, required
headers, expiry, and finalize token. Finalize reauthorizes participant and verifies
key/token/object metadata/hash/type/size before creating a pending attachment bound
to the new message. Scanner streams the object and returns `clean`, `malware`,
`mismatch`, or `unavailable`; only clean maps to downloadable state.

Storage calls allow only keys matching
`support/<ticket-uuid>/<upload-uuid>` in the existing private bucket. Delete is
idempotent; signing accepts only a clean attachment and a 60..300 second TTL.

## Feedback, Abuse, and Content

- Feedback commands accept only owner/type/subject/body; server owns state/assignee.
- Abuse creation normalizes resource type/id and returns the same safe receipt for
  valid, duplicate-active, or undisclosable targets as policy requires.
- Content queries accept locale, type, bounded query, cursor, and limit and operate
  only on published safe projections. Admin commands use versioned draft/review/
  publish/retire state and exact permissions. No scheduled publish command exists.

## Shared Dependency Contracts

- Authentication: existing Clerk owner guard and active-profile checks.
- Admin: existing `AdminAuthGuard`, permission manifest, recent-MFA evidence, and
  `audit.append_event`; no role header or client assertion grants access.
- Idempotency: existing Phase 06 claim/complete behavior and request hashing.
- Async: existing outbox/queue envelope and worker claim/lease/fence/retry patterns.
- Tokens: existing Phase 02 AES-GCM associated-data decryption immediately before send.
- Email: existing Phase 10 TLS-only Nodemailer configuration/transport behavior.
- Storage: existing Supabase REST origin/credential validation, private-bucket keys,
  timeout, signing, and idempotent delete patterns.
- Cache: in-process bounded published-content cache with version key; database is truth.
- Realtime: publish only `{schemaVersion,eventId,resourceType,resourceId}`.

## Safe Error Codes

`NOTIFICATION_NOT_FOUND`, `NOTIFICATION_EXPIRED`, `NOTIFICATION_ACTION_INVALID`,
`PREFERENCES_INVALID`, `TEMPLATE_RENDER_REJECTED`, `CAMPAIGN_INVALID`,
`CAMPAIGN_CONFLICT`, `AUDIENCE_INVALID`, `SUPPORT_TICKET_NOT_FOUND`,
`SUPPORT_TRANSITION_INVALID`, `ATTACHMENT_INVALID`, `ATTACHMENT_UNAVAILABLE`,
`FEEDBACK_NOT_FOUND`, `ABUSE_REPORT_UNAVAILABLE`, `CONTENT_NOT_FOUND`,
`VERSION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `FORBIDDEN`, and `RATE_LIMITED`.
Errors never distinguish foreign from absent objects or contain SQL/provider/scan/
token/key/note/draft/reporter details.

## Recovery and Reconciliation

Reconciliation compares source outbox IDs to events, events/campaign members to
unique deliveries, delivery terminal state to provider-safe evidence, attachment
rows to bucket objects/scan state, ticket last-message/status to messages, and
published content versions to cache keys. It records counts/hashes only and never
silently repairs unexplained privacy/security discrepancies.
