# Internal Contracts: SPEC-BE-010

## Report types and periods

```ts
type ReportType =
  | 'financial_summary'
  | 'category_spending'
  | 'budget_performance'
  | 'obligation_progress'
  | 'savings_progress'
  | 'account_activity';

type ReportPeriod = 'monthly' | 'three_months' | 'half_year' | 'annual';
type ReportFormat = 'json' | 'csv' | 'pdf';
type DeliveryChannel = 'download' | 'email';
```

These are closed server allowlists. Clients cannot submit SQL, a relation,
column, query expression, template, model/provider, object key, sender, subject,
or arbitrary dataset/user identifier.

## Period calculator

```ts
interface ReportPeriodRange {
  kind: ReportPeriod;
  timezone: string;
  startDate: string;       // YYYY-MM-DD in the schedule zone
  endDate: string;         // inclusive YYYY-MM-DD
  startInstant: Date;      // UTC
  endExclusiveInstant: Date;
}

interface ScheduleOccurrence {
  period: ReportPeriodRange;
  scheduledFor: Date;
  nextRunAt: Date;
}

resolveReportPeriod(kind: ReportPeriod, anchorDate: string, timezone: string): ReportPeriodRange;
nextScheduleOccurrence(schedule: SafeSchedule, after: Date): ScheduleOccurrence;
```

The implementation validates `timezone` against IANA names, clamps month-end,
and applies the documented DST gap/fold policy. It depends only on native
`Intl`/Date and database timezone validation.

## Snapshot capture

```ts
interface CaptureReportSnapshotInput {
  userId: string;
  reportType: ReportType;
  period: ReportPeriodRange;
  format: ReportFormat;
  delivery: DeliveryChannel;
  scheduleId?: string;
  schemaVersion: 1;
}

interface CapturedReportSnapshot {
  attemptId: string;
  ledgerVersion: number;
  generatedAt: string;
  expiresAt: string;
  snapshot: ReportSnapshotV1;
}
```

`ReportsRepository.captureSnapshot(input)` opens one database connection,
executes `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE`, obtains
the owner ledger version, queries required security-invoker views/planning
projections, invokes `private.capture_report_snapshot`, commits, and releases the
connection. Any validation/query/insert failure rolls back. Rendering, Storage,
email and external calls never happen inside the transaction.

The database function verifies the authenticated/API/worker caller, owner,
period/type/schema/size, current version and schedule ownership. It fixes
`search_path=''`, schema-qualifies every object, revokes `PUBLIC` execute, and
returns only the new attempt identifier and version metadata.

## Report snapshot version 1

```ts
interface ReportSnapshotV1 {
  schemaVersion: 1;
  generatedAt: string;
  ledgerVersion: number;
  reportType: ReportType;
  format: ReportFormat;
  delivery: DeliveryChannel;
  currencyCode: string;
  period: {
    kind: ReportPeriod;
    timezone: string;
    startDate: string;
    endDate: string;
  };
  dataState: 'complete' | 'empty' | 'partial' | 'estimated';
  evidence: Array<{
    kind: 'ledger' | 'balance' | 'salary' | 'budget' | 'obligation' | 'savings' | 'tracking' | 'ai';
    id?: string;
    version: number;
    asOf: string;
  }>;
  summary: ReportSummary;
  breakdowns: ReportBreakdown[];
  detailedRows?: DetailedReportRow[];
}
```

All amounts use safe integer minor units plus currency. Array/item/string/byte
maximums are explicit in runtime schemas. Unknown keys fail parsing. Evidence is
allowlisted and contains no provider or private content.

## Rendering

```ts
interface RenderedReport {
  contentType: 'application/json' | 'text/csv; charset=utf-8' | 'application/pdf';
  extension: 'json' | 'csv' | 'pdf';
  body: NodeJS.ReadableStream;
  byteCounter: Promise<{ bytes: number; sha256: string }>;
}

renderReport(snapshot: ReportSnapshotV1): RenderedReport;
neutralizeCsvCell(value: string): string;
```

Rendering reads only the persisted parsed snapshot. JSON has stable key order;
CSV has fixed columns and neutralizes leading formula/control characters before
quoting; PDF uses fixed fonts/layout and text APIs only. Byte and row limits abort
the stream, delete any partial object, and produce a safe failure code.

## Storage

```ts
interface StoredReport {
  key: string;
  bytes: number;
  sha256: string;
}

interface ReportsStorage {
  upload(attemptId: string, userId: string, format: ReportFormat,
         contentType: string, body: NodeJS.ReadableStream,
         maximumBytes: number): Promise<StoredReport>;
  verify(key: string, expectedBytes: number): Promise<void>;
  sign(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Keys match one fixed server pattern, are never client supplied, use `x-upsert:
false`, and are validated before URL construction. Signed responses must have the
configured Supabase origin and exact bucket/key path. A 404 delete is idempotent;
other failures retry without marking expired.

## SMTP

```ts
interface SmtpDeliveryInput {
  attemptId: string;
  recipient: string;
  downloadUrl: string;
  expiresAt: string;
  locale: 'ar' | 'en';
}

interface SmtpAcceptance {
  messageId: string;
  accepted: true;
  acceptedByServerAt: string;
}

interface ReportsMailer {
  deliver(input: SmtpDeliveryInput, signal?: AbortSignal): Promise<SmtpAcceptance>;
}
```

The transport reads only the five named runtime values, requires TLS and valid
certificate/hostname, uses bounded timeouts, never logs transport options, and
has no fallback. Subject is generic and body contains only a short explanation,
expiry, and private link. `messageId` is stable for an attempt and sender domain.
Nodemailer `accepted` must contain the normalized recipient and `rejected` must
be empty before the result is accepted. Other outcomes map to a closed safe error
allowlist. A timeout after DATA is `DELIVERY_ACCEPTANCE_UNKNOWN` and blocks
automatic resend.

## Repository/worker claims

```ts
interface ReportWorkClaim {
  id: string;
  kind: 'report.generate' | 'report.email.deliver' | 'report.output.expire';
  claimToken: string;
  attemptCount: number;
  snapshot?: ReportSnapshotV1;
  storageRef?: string;
}

claimReportWork(kind: ReportWorkClaim['kind'], workerId: string,
                limit: number, leaseSeconds: number): Promise<ReportWorkClaim[]>;
completeReportWork(id: string, claimToken: string,
                   outcome: 'ready' | 'delivered' | 'retry' | 'failed' | 'expired',
                   patch: SafeOperationalPatch): Promise<void>;
```

Claims are bounded, atomic `FOR UPDATE SKIP LOCKED` operations. Completion checks
claim token/fence, legal current state and immutable fields. Retry uses bounded
exponential delay. Dead-letter remains `failed` with a safe code/metric/alert;
payload is never copied into a generic table.

## Idempotency and retry

- Request scope keys: `reports.create`, `reports.delivery.retry`,
  `report-schedules.create/update/delete`, `admin.reports.export`.
- Reuse Phase 06 claim/lookup/complete with request hashes and original response.
- Schedule uniqueness is `(schedule_id, period_start, period_end)`.
- Output retry reuses attempt/snapshot/storage; regeneration is a new create.
- Stable SMTP Message-ID derives from the attempt UUID and verified sender domain,
  never recipient or financial content.

## Authorization

- Customer principals always use their verified Clerk `sub` from the request/
  database context. Caller-provided user IDs are absent.
- Sensitive output request/download/retry and all recipient changes call the
  existing recent-auth contract.
- Admin aggregate endpoints use the current exact overview permission.
- Admin export uses a deterministic seeded exact permission. User-scoped export
  additionally calls the Phase 03 support-grant function and appends immutable
  actor/purpose/resource/request audit in the same transaction.

## Cache

```ts
dashboardKey = `user:${clerkSub}:dashboard:${period}:${ledgerVersion}`
reportKey = `user:${clerkSub}:report:${type}:${period}:${ledgerVersion}`
```

Dashboard TTL is 30-60 seconds; report TTL is 300 seconds. Values are parsed on
read and contain no signed URL/provider field. Maximum entries/bytes are bounded;
expiry and versioned keys are sufficient correctness controls, while ledger/
planning/report events eagerly delete owner prefixes. Cache error is a metric and
database fallback, never authorization or financial truth.

## Webhook

A delivery-status webhook is registered only when a signing secret/config flag
is present. It accepts a raw body, timestamp, signature, unique provider event ID,
stable Message-ID and allowlisted status. Signature is constant-time verified;
stale/replayed/unknown/invalid input is rejected before state change. Because the
Master Plan owns no webhook inbox table, replay identity uses existing Phase 06
idempotency storage. No webhook may change snapshot or turn a non-accepted send
into accepted without configured provider evidence.

## Safe error codes

`REPORT_TYPE_INVALID`, `REPORT_PERIOD_INVALID`, `REPORT_LIMIT_EXCEEDED`,
`REPORT_NOT_FOUND`, `REPORT_EXPIRED`, `REPORT_NOT_READY`,
`REPORT_SNAPSHOT_CONFLICT`, `REPORT_STORAGE_UNAVAILABLE`,
`REPORT_RENDER_FAILED`, `REPORT_RECIPIENT_INVALID`,
`REPORT_RECIPIENT_UNVERIFIED`, `REPORT_SCHEDULE_CONFLICT`,
`REPORT_DELIVERY_CONFIGURATION`, `REPORT_DELIVERY_AUTH`,
`REPORT_DELIVERY_REJECTED`, `REPORT_DELIVERY_TIMEOUT`,
`DELIVERY_ACCEPTANCE_UNKNOWN`, `REPORT_DELIVERY_FAILED`,
`REPORT_WEBHOOK_INVALID`, `REPORT_WEBHOOK_REPLAYED`, `FORBIDDEN`,
`RECENT_AUTH_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, and standard validation/rate
errors. No code distinguishes foreign from missing objects.
