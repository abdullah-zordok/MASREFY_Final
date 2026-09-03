# Research: SPEC-BE-010 Reports, Analytics, Exports & Email Delivery

## Decision 1: Reporting truth and snapshot isolation

**Decision**: derive every financial value from current effective Phase 05
postings/balance view and Phase 07 security-invoker views. Capture a report inside
one explicit repeatable-read, read-only transaction that validates the current
owner ledger version and inserts one immutable snapshot before commit.

**Rationale**: this prevents mixed ledger/planning versions during concurrent
mutation while preserving the established source of truth and one small database
transaction. Output rendering and SMTP happen after commit and hold no locks.

**Alternatives considered**: application fan-out queries at read committed (can
mix versions); serializable capture (unnecessary abort pressure); copying ledger
data into new report tables (duplicate truth and forbidden ownership).

## Decision 2: Database object scope

**Decision**: create only `report_schedules`, `report_output_attempts`,
`v_monthly_financial_summary`, `v_category_spending_summary`, and minimum guarded
Phase 10 functions. Put output format and retry/evidence lineage in the immutable
versioned snapshot JSON because the Master Plan does not own more columns/tables.

**Rationale**: matches the exact Master Plan catalog and avoids speculative
recipient, output, cache, lock, webhook, or analytics tables.

**Alternatives considered**: separate snapshots/deliveries/files/webhooks tables
(not owned); expanding Master Plan columns (not required for current behavior).

## Decision 3: Views, RLS, grants, and current Supabase behavior

**Decision**: create both public views with `security_invoker=true`, enable and
force RLS on the public owner table, revoke defaults explicitly, grant only named
operations, keep attempts private, use indexed `(select current_clerk_user_id())`
owner predicates, and test all positive/negative roles.

**Rationale**: current Supabase guidance confirms views otherwise use creator
privileges, grants and RLS are separate checks, and new public tables may not be
automatically Data API exposed. Explicit grants make behavior portable and
fail-closed.

**Alternatives considered**: security-definer public views/functions or broad
authenticated grants (BOLA risk); application-only filtering (not defense in depth).

## Decision 4: Schedule calendar behavior

**Decision**: use Postgres IANA `pg_timezone_names` for validation and calendar
math from local date components. Support monthly, three-month, half-year and
annual schedules. Clamp a requested delivery day to month end; choose the first
valid instant after a DST gap and the earlier instant in a fold. Process a maximum
configured number of missed periods per run, oldest first.

**Rationale**: aligns with the current Mobile contract and makes DST/month behavior
deterministic without adding a date library or arbitrary cron grammar.

**Alternatives considered**: fixed UTC intervals (calendar drift); custom cron
(unrequested); a new timezone dependency (Postgres/Intl already provide rules).

## Decision 5: Rendering and streaming

**Decision**: use native Node streams for JSON/CSV, fixed schema/column order,
RFC-compatible CSV escaping, and prefix formula-leading cells with a single quote.
Use pinned PDFKit for bounded PDF text, embed a reused repository Noto Sans Arabic
font, disable links/attachments/forms/scripts/external resources, and validate
snapshot text before rendering.

**Rationale**: CSV is a few safe lines with stdlib. Correct Unicode/Arabic PDF
font embedding is not; PDFKit is the smallest established dependency that avoids
hand-writing a fragile binary format.

**Alternatives considered**: buffering full output (unbounded memory); HTML/
headless browser (large runtime/attack surface); raw PDF bytes (Unicode/shaping
risk); a generic template engine (injection and needless abstraction).

## Decision 6: SMTP transport

**Decision**: use pinned Nodemailer with one SMTP transport, required TLS,
certificate/hostname verification, bounded connection/greeting/socket timeouts,
AUTH from runtime-only values, fixed `EMAIL_FROM`, minimal text body and generic
subject, and a stable Message-ID derived by HMAC/hash from attempt identity and
sender domain. Treat successful SMTP acceptance as `delivered`; classify rejected,
timeout, auth/config and ambiguous outcomes without fallback.

**Rationale**: SMTP state/reply parsing, STARTTLS/implicit TLS and authentication
are not a few safe stdlib lines. A vetted transport is smaller and safer than a
custom socket protocol while keeping exactly one provider-independent mechanism.

**Alternatives considered**: raw `net`/`tls` SMTP client (large fragile parser);
provider SDK/HTTP email service (unapproved secondary transport); simulated send
(does not meet the requirement).

## Decision 7: Duplicate delivery prevention

**Decision**: the schedule-period unique index prevents duplicate scheduled
snapshots; existing idempotency protects request replay; worker claims use
`FOR UPDATE SKIP LOCKED`, lease token and fence; one attempt retains one stable
Message-ID. A retry resumes the same snapshot and operational attempt state.
Ambiguous post-DATA timeout is not blindly resent; it becomes a reconciliation/
manual retry state because SMTP cannot prove non-acceptance.

**Rationale**: SMTP itself is not exactly-once. Stable identity plus a durable
fence prevents known replay duplicates and honest ambiguous handling avoids a
false exactly-once claim.

**Alternatives considered**: new delivery table (not owned); always resend on
timeout (duplicate risk); regenerate snapshot (violates immutability).

## Decision 8: Private Storage and signed URLs

**Decision**: reuse the existing private `report-exports` bucket and REST client
pattern with server-generated `reports/{user-hash-or-id}/{attempt}.{ext}` keys,
no upsert, content length/type/hash verification, 60-900 second signed URLs only
after fresh owner authorization, and bounded expiry/delete reconciliation.

**Rationale**: current Supabase documentation confirms private bucket downloads
require authenticated access or a time-limited signed URL, and signed URLs remain
valid until expiry. Therefore TTL is short and URL issuance is never persisted.

**Alternatives considered**: public bucket/public URL (privacy failure); storing
signed URLs (stale/leakable); new bucket (foundation already owns the required one).

## Decision 9: Cache

**Decision**: implement only small in-process read-through caches using exact
Master Plan keys, owner and ledgerVersion, 30-60 second Home TTL and five-minute
report TTL. Invalidate on existing ledger/planning/report events; fail to database.

**Rationale**: no measurement supports Redis. Versioned keys make stale entries
unreachable after a financial change and preserve Postgres truth.

**Alternatives considered**: Redis/shared cache (unjustified infrastructure);
unversioned owner cache (stale financial truth); no cache (may miss budget, but is
retained as fallback and can remain if measurements already pass).

## Decision 10: Admin analytics and support access

**Decision**: implement current bounded `/admin/overview`, platform analytics and
activity contracts from server-known aggregate queries. Aggregate reads require
their exact current permission; Admin exports require an added exact permission,
recent auth and bounded type/filter. User-level report access additionally reuses
Phase 03 support-grant and audit functions.

**Rationale**: maps the existing Admin UI without arbitrary SQL/dataset selection
or duplicate data models and preserves the Phase 03 authorization authority.

**Alternatives considered**: generic analytics query builder (injection/BFLA and
unbounded cost); new attention/navigation tables (explicitly forbidden).

## Decision 11: Client integration boundary

**Decision**: add Mobile/Admin live adapters and exact contract/shadow tests, but
do not change the production provider selector or remove explicit mocks/demo data.

**Rationale**: Phase 10 owns report parity; Constitution and Master Plan reserve
final live provider cutover and production mock removal for SPEC-BE-014.

**Alternatives considered**: immediate production switch (ownership violation);
backend-only work (fails explicit client parity requirement).

## Decision 12: Provider-independent completion

**Decision**: test SMTP through a deterministic local TLS server with generated
test-only certificates and scripted responses; retain exact local acceptance,
rejection, timeout, retry and Message-ID evidence. Real credentials, sender
verification, hosted provider acceptance and hosted alert routing remain pending
until supplied; no fake credential/value is committed.

**Rationale**: completes every executable contract while distinguishing protocol
evidence from external provider/account truth.

**Alternatives considered**: block all implementation on credentials (violates
the brief); call local acceptance real provider proof (dishonest).

## Decision 13: Materialized analytics

**Decision**: start with ordinary indexed security-invoker views and do not
implement `analytics.refresh`.

**Rationale**: Master Plan and Constitution forbid speculative materialization;
current evidence contains no Phase 10 measurement proving it necessary.

**Alternatives considered**: eager materialized view/refresh job (new staleness,
failure, reconciliation and ownership complexity without evidence).

## Decision 14: Package and binary asset handling

**Decision**: pin runtime packages and type packages, update the canonical npm
lockfile only, reuse the existing Noto Sans Arabic UI font under its current
repository ownership by copying it into the backend runtime image, and test its
presence/hash. The protected untracked pnpm files remain untouched.

**Rationale**: reproducible container rendering and dependency audit are required;
the font already exists and avoids downloading/committing another binary.

**Alternatives considered**: runtime font download (network/integrity risk); a
second checked-in font copy (duplication); system font assumption (distroless image
does not guarantee it).
