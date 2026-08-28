# Event Contracts: Authentication, Profiles, Preferences & Sessions

**Spec**: SPEC-BE-002
**Payload version**: 1
**Envelope**: SPEC-BE-001 queued-event envelope version 1
**Delivery**: At least once through `private.outbox_events` and `platform-events`

## Producer Rule

Each event is enqueued through
`private.enqueue_outbox_event(text,text,uuid,jsonb)` in the same PostgreSQL
transaction as its owned state change. Direct queue publication and publication
after commit are forbidden. A transaction rollback removes both state and event.

All payloads:

- are JSON objects no larger than the existing 64 KiB outbox limit;
- contain `payloadVersion: 1` and only fields defined here;
- use the envelope `eventId` as the consumer deduplication key;
- contain no email, phone, full name, device fingerprint, Clerk session ID, JWT,
  OTP, OAuth token, push token/hash/ciphertext, webhook body/hash, provider secret,
  exception text, or free-form metadata.

Because the shared envelope accepts only UUID/null aggregate IDs, profile events
use `aggregate.type = "profile"`, `aggregate.id = null`, and place the text Clerk
profile ID in the bounded payload. Device events use the device UUID as aggregate
ID. SPEC-BE-002 does not change the shared envelope.

## `profile.created`

**Producer**: Clerk synchronization or reconciliation after atomically creating
the active profile and its default preference/onboarding rows.

**Aggregate**:

```json
{ "type": "profile", "id": null }
```

**Payload**:

```json
{
  "payloadVersion": 1,
  "profileId": "user_provider_subject",
  "profileVersion": 1,
  "source": "clerk_webhook",
  "sourceEventId": "msg_signed_delivery_id"
}
```

| Field | Rule |
|---|---|
| `profileId` | immutable Clerk subject, 1..128 characters |
| `profileVersion` | integer >=1 |
| `source` | `clerk_webhook` or `clerk_reconciliation` |
| `sourceEventId` | signed delivery ID for webhook; null for reconciliation |

The envelope `occurredAt` is the committed creation time; it does not claim to be
the provider's original event time.

## `profile.updated`

**Producer**: customer profile API, Clerk synchronization, or reconciliation.

**Aggregate**:

```json
{ "type": "profile", "id": null }
```

**Payload**:

```json
{
  "payloadVersion": 1,
  "profileId": "user_provider_subject",
  "profileVersion": 4,
  "changedFields": ["locale", "timezone"],
  "source": "customer_api",
  "sourceEventId": null
}
```

`changedFields` is unique, sorted, maximum 5 items, and contains only:

```text
display_name
locale
timezone
primary_email
phone_e164
```

`source` is `customer_api`, `clerk_webhook`, or `clerk_reconciliation`.
`sourceEventId` is nonnull only for webhook source. Values are never included,
only safe field names.

## `profile.deletion_requested`

**Producer**: Clerk synchronization/reconciliation after a confirmed missing
current Clerk user transitions an existing or evidence-shell profile to
`deletion_pending`.

**Aggregate**:

```json
{ "type": "profile", "id": null }
```

**Payload**:

```json
{
  "payloadVersion": 1,
  "profileId": "user_provider_subject",
  "profileVersion": 5,
  "source": "clerk_webhook",
  "sourceEventId": "msg_signed_delivery_id",
  "observedAt": "2026-08-27T12:00:00.000Z"
}
```

This event is evidence/request only. It does not claim that Masarifi data was
deleted. SPEC-BE-003 owns privacy/deletion decisions and final lifecycle changes.

## `device.registered`

**Producer**: successful owner device registration/refresh transaction.

**Aggregate**:

```json
{ "type": "device", "id": "0198f79d-98f3-7bb4-a820-f43bb4d0e17e" }
```

**Payload**:

```json
{
  "payloadVersion": 1,
  "profileId": "user_provider_subject",
  "deviceId": "0198f79d-98f3-7bb4-a820-f43bb4d0e17e",
  "platform": "android",
  "deviceVersion": 2,
  "registrationResult": "refreshed"
}
```

`platform` is `ios`, `android`, or `web`. `registrationResult` is `created`,
`refreshed`, or `reactivated_with_fresh_session`. No fingerprint, session ID,
device name, app version, or push state is published.

## `device.revoked`

**Producer**: local device/push revocation transaction, before the optional Clerk
session network call.

**Aggregate**:

```json
{ "type": "device", "id": "0198f79d-98f3-7bb4-a820-f43bb4d0e17e" }
```

**Payload**:

```json
{
  "payloadVersion": 1,
  "profileId": "user_provider_subject",
  "deviceId": "0198f79d-98f3-7bb4-a820-f43bb4d0e17e",
  "deviceVersion": 3,
  "revokedAt": "2026-08-27T12:00:00.000Z",
  "sessionRevokeState": "pending"
}
```

`sessionRevokeState` is `pending` when a linked session must be revoked after
commit or `not_linked` when no Clerk session link exists. It does not claim
provider success before the call occurs. Operational metrics record later success
or safe failure without emitting another domain event.

## Ordering and Idempotency

- The outbox envelope `eventId` is globally unique and is the consumer dedupe key.
- No consumer relies on global queue order.
- Profile consumers use `profileId` plus `profileVersion`; a lower/equal version is
  a deterministic no-op.
- Device consumers use `deviceId` plus `deviceVersion`; a lower/equal version is a
  deterministic no-op.
- Duplicate publication produces one owned effect or a no-op.
- Clerk delivery IDs do not replace outbox event IDs. `sourceEventId` supplies
  traceability only and cannot authorize an action.

## Compatibility

Additive optional payload fields require contract review and tolerant v1 consumers.
Removing/renaming a field, changing its meaning/type, or expanding an enum requires
a new `payloadVersion` and a dual-read migration. The shared envelope version is
changed only by its owning foundation Spec.

## Required Contract Tests

| Case | Required result |
|---|---|
| Valid payload for each event | accepted and preserves exact safe fields |
| Unknown/forbidden field | rejected before outbox enqueue |
| Email/phone/token/session/fingerprint-like field | rejected |
| Profile event aggregate ID nonnull | rejected by shared UUID/null contract |
| Device aggregate ID differs from payload device ID | rejected |
| Duplicate envelope event ID | one consumer effect or no-op |
| Lower/equal aggregate version | no regression |
| Transaction rolls back | no outbox row |
| Queue retries | payload is identical and remains safe |
