# Phase 11 Data Model

## Conventions

- `M`: `id uuid primary key default gen_random_uuid()`, `created_at`/`updated_at`
  `timestamptz`, `version bigint default 1 check (version > 0)` and the shared
  version trigger.
- `I`: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz`.
- `U`: `user_id text not null references public.profiles(id) on delete restrict`.
- All timestamps are UTC. API cursors encode `(sort_time,id)` and are opaque.
- Mutable lifecycle writes are guarded; clients cannot set IDs, owners, versions,
  state, actor, provider, audit, or scan fields unless the contract explicitly says so.
- Text/JSON byte limits are duplicated at API and database trust boundaries.

## Notifications

### `public.notification_events` (`M+U`)

| Column | Type / nullability | Rule |
|---|---|---|
| `type` | `text not null` | registered event key, lowercase dotted, <=96 |
| `title` | `text not null` | safe rendered lock-screen title, 1..120 chars |
| `body_safe` | `text not null` | safe rendered lock-screen body, 1..240 chars |
| `data` | `jsonb not null default '{}'` | object <=8 KiB; keys limited to safe detail/action references |
| `read_at` | `timestamptz null` | owner/API controlled |
| `acted_at` | `timestamptz null` | set once by guarded action |
| `expires_at` | `timestamptz null` | after `created_at` |

Indexes: `(user_id,created_at desc,id desc)`, partial
`(user_id,created_at desc,id desc) where read_at is null`,
`(user_id,type,created_at desc,id desc)`, and `(expires_at) where expires_at is not null`.

State: active -> read/unread (reversible); active -> acted (once); any active ->
expired by time. Expired rows reject actions and are removed/minimized by policy.

### `public.notification_preferences` (`M+U`)

Fields: `channel text not null` (`in_app|push|email`), `event_type text not null`,
`enabled boolean not null default true`, `quiet_hours jsonb not null default '{}'`.
Unique `(user_id,channel,event_type)`; index `(user_id,channel)`. Quiet-hours schema:

```json
{
  "enabled": true,
  "start": "22:00",
  "end": "07:00",
  "weekdays": [0,1,2,3,4,5,6],
  "timeZone": "Asia/Riyadh"
}
```

Times are 24-hour `HH:mm`; weekdays are unique 0..6; timezone is validated by the
application and limited by database shape/length checks. `PUT` replaces the full
registered matrix atomically and increments all changed versions.

### `public.notification_templates` (`M`)

Fields: `key text not null`, `locale text not null` (`ar|en`), `channel text not
null` (`in_app|push|email`), `template_version integer not null`, `subject text
null`, `body text not null`, `status text not null default 'draft'`,
`published_at timestamptz null`, `created_by text not null references
public.admin_profiles(user_id)`. Status is `draft|testing|published|retired`.
Unique `(key,locale,channel,template_version)`; index
`(key,locale,channel,status,template_version desc)` with a partial unique published
variant per key/locale/channel. Subject <=120 with no CR/LF; body <=4 KiB; positive
version. Published rows are content-immutable; retirement changes only lifecycle.

Transitions: draft -> testing -> published -> retired; testing -> draft after a
failed/revised test by creating a new version. No published -> draft transition.

### `public.notification_campaigns` (`M`)

Fields: `name text not null` (1..120), `audience_definition jsonb not null`,
`template_id uuid not null references notification_templates(id)`, `status text
not null default 'draft'`, `scheduled_at timestamptz null`, `created_by text not
null references admin_profiles(user_id)`, `approved_by text null references
admin_profiles(user_id)`. Status is
`draft|approved|scheduled|running|paused|completed|cancelled`.

Audience JSON is a strict object containing only `platforms[]`, `locales[]`,
`activity`, and server-known `segmentKeys[]`, each bounded and unique. It stores
the preview version/hash and aggregate count, never SQL or expanded user IDs.
Index `(status,scheduled_at,id)` and `(created_by,created_at desc,id desc)`.

Transitions: draft -> approved; approved -> scheduled|running; scheduled ->
running|paused|cancelled; running -> paused|completed|cancelled; paused ->
running|cancelled. Terminal states do not reopen. Above the configured count,
`approved_by <> created_by`.

### `private.notification_deliveries` (`I` with controlled operational updates)

Fields: `event_id uuid null references notification_events(id)`, `campaign_id uuid
null references notification_campaigns(id)`, `user_id text not null references
profiles(id)`, `channel text not null`, `provider text not null`, `status text not
null default 'queued'`, `attempt_count integer not null default 0`, `provider_ref
text null`, `delivered_at timestamptz null`, `error_code text null`,
`next_attempt_at timestamptz null`. Exactly one source is non-null; status is
`queued|sending|delivered|failed|suppressed`; attempts >=0. Provider references
are private and bounded.

Unique partial `(event_id,user_id,channel)` and `(campaign_id,user_id,channel)`;
indexes `(status,next_attempt_at,id)`, `(user_id,created_at desc,id desc)`, and
source FKs. Operational claim columns reuse the repository's lease/fence convention
without changing logical ownership.

Transitions: queued -> sending -> delivered|failed|suppressed; retryable failed ->
queued; expired/disabled/invalid token -> suppressed or terminal failed. Delivered
never returns to queued.

## Support

### `public.support_categories` (`M`)

Fields: `key text not null unique` (lowercase slug <=64), `name text not null`
(1..120), `sort_order integer not null default 0`, `active boolean not null default
true`; nonnegative order; index `(active,sort_order,key)`.

### `public.support_tickets` (`M+U`)

Fields: `category_id uuid not null references support_categories(id)`, `subject
text not null` (1..180), `status text not null default 'open'`, `priority text not
null default 'normal'`, `assigned_admin_id text null references
admin_profiles(user_id)`, `last_message_at timestamptz not null default now()`,
`closed_at timestamptz null`. Status `open|waiting_customer|waiting_support|
resolved|closed`; priority `low|normal|high|urgent`.

Indexes: `(user_id,status,last_message_at desc,id desc)`,
`(assigned_admin_id,status,last_message_at desc,id desc)`, category/status, and
priority/status. State transitions are those in `research.md`; all use expected
version and atomic audit/outbox.

### `public.support_messages` (`I`)

Fields: `ticket_id uuid not null references support_tickets(id) on delete cascade`,
`sender_id text not null`, `sender_type text not null` (`customer|admin|system`),
`body text not null` (1..8 KiB). Index `(ticket_id,created_at,id)`. A trigger/
guarded insert validates sender identity and ticket state; updates/deletes are denied.

### `private.support_internal_notes` (`I`)

Fields: `ticket_id uuid not null references support_tickets(id) on delete cascade`,
`admin_id text not null references admin_profiles(user_id)`, `body text not null`
(1..8 KiB). Index `(ticket_id,created_at,id)`. No customer role usage/table grant,
Realtime publication, customer view, export handler, cache, or log serialization.

### `private.support_attachments` (`I` with controlled scan updates)

Fields: `message_id uuid not null references support_messages(id) on delete cascade`,
`storage_ref text not null unique`, `filename_safe text not null`, `content_type
text not null`, `size_bytes bigint not null`, `scan_status text not null default
'pending'`, `scanned_at timestamptz null`. Size is 1..configured max and JS-safe;
type is from configured allowlist; status `pending|clean|rejected|failed`.
Indexes `(message_id,scan_status,id)` and `(scan_status,created_at,id)`.

Only server-generated `support/{ticketUuid}/{uploadUuid}` keys are valid. Clean is
terminal; rejected is terminal and object absent; failed may be reclaimed under
bounded policy but never downloaded.

## Feedback and Abuse

### `public.feedback_items` (`M+U`)

Fields: `type text not null` (`bug|idea|experience|other`), `subject text null`
(<=180), `body text not null` (1..8 KiB), `status text not null default 'new'`
(`new|reviewing|planned|resolved|closed`), `assigned_admin_id text null references
admin_profiles(user_id)`. Indexes `(user_id,created_at desc,id desc)`,
`(status,updated_at desc,id desc)`, and assignee/status.

Transitions: new -> reviewing|closed; reviewing -> planned|resolved|closed;
planned -> reviewing|resolved|closed; resolved -> closed. Customer cannot set state.

### `public.abuse_reports` (`M`)

Fields: `reporter_id text not null references profiles(id)`, `resource_type text
not null`, `resource_id text not null`, `reason text not null` (1..2 KiB), `status
text not null default 'open'`, `reviewed_by text null references
admin_profiles(user_id)`, `reviewed_at timestamptz null`. Status
`open|reviewing|actioned|dismissed`. A partial unique index on normalized
`(reporter_id,resource_type,resource_id)` for active states prevents races. Index
`(status,created_at desc,id desc)`. Resource/reporter details are never returned
without explicit authorization.

Transitions: open -> reviewing|actioned|dismissed; reviewing -> actioned|dismissed.

## Localized Content

### `public.content_items` (`M`)

Fields: `key text not null unique` (lowercase slug <=96), `type text not null`
(`article|faq|policy|announcement`), `status text not null default 'draft'`
(`draft|review|published|retired`), `published_at timestamptz null`, `created_by
text not null references admin_profiles(user_id)`. Index `(type,status,updated_at
desc,id desc)` and partial published key/type lookup.

Transitions: draft -> review; review -> draft|published; published -> retired.
Published text changes require a new version through the shared mutable version,
review, and publish sequence; retired does not return to published.

### `public.content_translations` (`M`)

Fields: `content_id uuid not null references content_items(id) on delete cascade`,
`locale text not null` (`ar|en`), `title text not null` (1..180), `body text not
null` (1..64 KiB). Unique `(content_id,locale)`; index `(locale,content_id)`.
Customer lookup always joins a `published` parent; direct customer table access is
read-only through a security-invoker safe projection/function.

## RLS and Grants Matrix

| Resource | Customer owner | Other customer | Admin API role | Worker |
|---|---|---|---|---|
| notification events/preferences | safe select; guarded state/preference commands | none | bounded permissioned aggregate/status | create/deliver/expire only |
| templates/campaigns/deliveries | none | none | exact permission + MFA/audit | claim/expand/deliver only |
| categories | active read | active read | exact manage | seed only |
| tickets/messages | own safe rows/guarded commands | none | exact action permission | safe events only |
| internal notes | none | none | dedicated exact notes query/write | none |
| attachments | own clean metadata/download via API | none | ticket-scoped safe metadata | scan/delete only |
| feedback/abuse | own safe status | none | exact review permission | safe events only |
| content/translations | published safe projection | published safe projection | exact manage/publish | cache invalidation only |

All negative cells have explicit pgTAP and HTTP tests. Service role is not used as
an authorization substitute; repositories call exact guard functions first.

## Migration Order

1. Notification templates/preferences/events/campaigns/deliveries, constraints,
   indexes, lifecycle/creation/claim functions, RLS, grants, and reviewed seeds.
2. Support categories/tickets/messages/private notes/attachments, functions,
   indexes, RLS/grants, Storage policies against the existing bucket, and seeds.
3. Feedback/abuse/content/translations, dedupe/publication functions, indexes,
   RLS/grants, and reviewed content seeds.
4. Permission-seed additions only if an exact current manifest key is missing;
   never duplicate or rename Phase 03 keys.
5. pgTAP structure/RLS/command tests, checksum update, clean reset, rollback then
   forward reapply, and N-1 compatibility proof.

Rollback disables Phase 11 routes/workers first and uses a forward corrective
migration. It never drops messages/events/audit, restores rejected malware, exposes
draft content/notes, or rewinds prior-Spec objects.

## Credit-Card Due Reminder Source

`private.enqueue_credit_card_due_reminders(timestamptz, integer)` joins active
cards to active profiles and derives each profile's local date from its validated
IANA timezone. A partial unique index on account plus `payload.dueDate` provides
idempotency. The payload contains only owner/account routing metadata, due date,
and expiry; balances, rates, limits, and minimum payments are excluded.
