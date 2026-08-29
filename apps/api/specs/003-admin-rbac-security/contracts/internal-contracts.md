# Internal Contracts: SPEC-BE-003

These contracts are the only extension seams later backend Specs may consume.
They do not authorize by role name and do not permit dynamic SQL.

## Database Authorization Functions

```sql
private.admin_has_permission(
  admin_id text,
  permission_key text,
  at_time timestamptz default clock_timestamp()
) returns boolean

private.assert_admin_permission(permission_key text) returns void

private.assert_support_grant(
  target_user_id text,
  resource_key text,
  action_key text
) returns uuid -- matching grant id

audit.append_event(
  actor_id text,
  actor_type text,
  action text,
  resource_type text,
  resource_id text,
  before_hash text,
  after_hash text,
  reason text,
  request_id text,
  metadata jsonb default '{}'
) returns uuid
```

All functions validate bounded inputs, use a fixed `search_path`, expose no direct
client execute grant, and fail closed. `assert_*` reads the verified subject from
transaction-local claims established by the API, never from caller arguments.

## Support Scope

```ts
type SupportResource =
  | 'profile-contact'
  | 'account-status'
  | 'device-diagnostics'
  | 'session-diagnostics'
  | 'subscription-summary'
  | 'import-summary';

type SupportAction = 'read-masked' | 'read-status' | 'read-aggregate';

type SupportScope = ReadonlyArray<{
  resource: SupportResource;
  actions: readonly SupportAction[];
}>;
```

Entries and actions are unique, sorted before persistence, and capped at six
resources/three actions. Approval is a set subset of the locked request. A domain
projection must register the exact resource/action pair and return only a typed
masked/status/aggregate response.

## Privacy Handler Registry

```ts
type PrivacyEvidence = {
  requestId: string;
  userId: string;
  evidenceAt: Date;
  correlationId: string;
};

type ExportEntry = {
  path: string; // fixed handler-owned relative path
  mediaType: 'application/json' | 'application/x-ndjson';
  stream: AsyncIterable<Uint8Array>;
};

type DeletionOutcome = {
  deletedCount: number;
  anonymizedCount: number;
  retainedCount: number;
  policyIds: readonly string[];
};

type RetentionCandidate = {
  resourceId: string;
  eligibleAt: Date;
  version: number;
};

interface PrivacyDomainHandler {
  readonly resourceType: string;
  readonly schemaVersion: 1;
  export(evidence: PrivacyEvidence): AsyncIterable<ExportEntry>;
  deleteAccount(evidence: PrivacyEvidence): Promise<DeletionOutcome>;
  listRetentionCandidates(
    before: Date,
    cursor: string | null,
    limit: number,
  ): Promise<{ items: readonly RetentionCandidate[]; nextCursor: string | null }>;
  applyRetention(
    candidate: RetentionCandidate,
    mode: 'delete' | 'anonymize' | 'archive',
    evidence: PrivacyEvidence,
  ): Promise<DeletionOutcome>;
}
```

Registration is an in-process list owned by Nest module composition. Startup fails
on duplicate `(resourceType,schemaVersion)`. Jobs sort by `resourceType`; the
deployment manifest declares the complete expected set and jobs fail on a missing
handler. Handlers use their own repositories and idempotent version/state guards.
They never receive arbitrary table names, SQL, storage credentials, or Admin
permissions.

## Export Package

The ZIP contains only server-named entries:

```text
manifest.json
identity/profile.json
<registered-resource>/<bounded-entry>.json[|l]
```

`manifest.json` contains `schemaVersion=1`, opaque request ID, UTC evidence time,
handler names/versions, entry media types, byte counts, and SHA-256 checksums. It
contains no signed URL, Storage key, token, or omitted-handler success. File names
reject absolute paths, `..`, backslashes, control characters, symlinks, and
executable extensions. Package/entry count, bytes, duration, and handler output are
bounded by deployment configuration.

## Job Claims

| Job                        | Claim order                       | Terminal/retry behavior                                                   |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `privacy.export.generate`  | `status, requested_at, id`        | retry safe failure; ready only after upload + metadata validation         |
| `account.deletion.execute` | `status, cooling_off_ends_at, id` | recheck cancellation/holds per handler; persist safe per-handler outcomes |
| `retention.apply`          | policy/resource cursor            | recheck hold immediately before handler call; bounded batch               |
| `support-grants.expire`    | `status/expires_at/id`            | one-way expiry/revocation evidence                                        |
| `security-alert.dispatch`  | outbox event order                | publish safe alert contract; committed evidence survives delivery failure |

Claims use `FOR UPDATE SKIP LOCKED`, short leases or transaction ownership, bounded
attempts, the existing retry policy, and the existing graceful shutdown signal.

## Invitation Acceptance

1. Creator passes exact permission and recent MFA.
2. API generates a random token and asks Clerk to deliver a redirect containing
   it; after provider acceptance, a reauthorized transaction stores only its
   digest. An orphan email after database failure is non-authorizing and a retry
   issues a fresh token.
3. Invitee authenticates through the same Clerk application and submits the token.
4. API verifies recent MFA and obtains the invitee's provider-verified primary
   email through the existing Clerk client.
5. One transaction locks the invitation, compares digest and normalized email,
   checks expiry/terminal state, activates the Admin profile, creates the invited
   assignment, appends audit, enqueues `admin.role_assigned`, and marks accepted.
6. An identical completed acceptance returns the same safe active state; a token
   for another identity returns a non-enumerating denial.
