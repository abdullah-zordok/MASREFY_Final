# Phase 08 Research Decisions

## Decision 1 — Reuse the existing command and replay boundaries

Accepted items call `LedgerService.createTransaction()` with a stable Phase 08
idempotency key and `externalRef`. Workers reuse the fenced lease/idempotency
patterns established by SPEC-BE-006 and SPEC-BE-007. Phase 08 never writes ledger
tables or calls `private.post_transaction` directly.

**Why**: the ledger service already owns money validation, authorization, audit,
outbox publication, and replay semantics. A new abstraction or sync domain would
duplicate proven behavior without adding a requirement.

**Rejected**: direct ledger SQL; a tracking-specific ledger gateway; a new sync
domain; using only a worker lease as the duplicate fence.

## Decision 2 — Text-only ingestion is the hostile-file boundary

Phase 08 accepts either one uncompressed UTF-8 CSV file up to 6 MiB/10,000 rows
or a normalized JSON request up to 512 KiB/100 events. It rejects archives,
compression, executables, active content, XML/HTML, PDF, images, Office formats,
NUL and disallowed control/bidi characters, invalid UTF-8, duplicate headers,
traversal-style names, declared-type/signature mismatches, and excess rows,
columns, row bytes, or cell bytes before durable storage.

Strict parsing is the Phase 08 scan. Accepted bytes are stored under a generated
private object key with no overwrite; only hash, size, declared/detected type,
expiry, and the private reference are recorded. The reference and raw content are
never returned to owner or Admin APIs. Complex-format malware/CDR scanning is
deferred until a later Spec actually admits a complex format.

**Why**: rejecting executable and container formats removes archive bombs, XXE,
path extraction, and active-content paths instead of adding a scanner dependency
for formats Phase 08 does not need. Supabase recommends standard uploads for files
no larger than 6 MB.

**Sources**: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[OWASP XXE Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html),
[Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads),
[Node.js `TextDecoder`](https://nodejs.org/api/util.html#class-utiltextdecoder).

## Decision 3 — The parser DSL is data, not code

Parser rule versions contain bounded flat JSON with literal comparisons, a small
linear-time `safe_pattern` token grammar, named captures, and allowlisted
normalizers. The service rejects JavaScript/SQL regex syntax, recursion,
backreferences, lookarounds, URLs, template execution, dynamic SQL, filesystem or
network instructions, and objects deeper than four levels. The document is at
most 8 KiB and every clause and output is bounded.

**Why**: PostgreSQL explicitly warns that hostile regular expressions can consume
arbitrary time and memory. A purpose-built token matcher covers institution text
without executing general regex or code.

**Rejected**: `eval`, `Function`, plugins, JavaScript or PostgreSQL regex,
user-authored SQL, and external parser URLs.

**Sources**: [PostgreSQL pattern-matching cautions](https://www.postgresql.org/docs/current/functions-matching.html),
[OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## Decision 4 — RLS remains owner-first and service-role-denied

Every public owner table stores `user_id`, uses composite ownership foreign keys,
enables and forces RLS, and grants only owner reads through the existing Clerk
identity helper. Writes use narrow security-definer commands. Private raw bytes,
attempts, jobs, and admin projections remain inaccessible to clients. Cross-owner
Admin reads use permission-checked redacted functions; workers receive execution
on claim/complete functions rather than broad table DML. `service_role` retains no
direct database access.

**Why**: this is the established project boundary and prevents a child record,
admin tool, or worker from crossing tenancy through a guessed identifier.

**Sources**: [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

## Decision 5 — Duplicates are explained, deterministic, and fenced twice

The versioned Phase 08 score uses exact external reference, normalized amount and
currency, bounded occurrence-time distance, normalized merchant/title tokens,
account, and sender/institution signals. It stores only reason codes and bounded
evidence, never opaque model output. Candidate uniqueness prevents repeated pairs;
ledger `(user_id, source, external_ref)` remains the final posting fence.

Owner resolutions map as follows: `keep_existing` marks the item duplicate;
`keep_new` and `keep_both` accept the new item through the ledger command;
`merge_details` issues an allowlisted ledger update to the existing transaction.
Every decision uses expected-version compare-and-set and an idempotency key.

**Why**: deterministic evidence is auditable and testable. A lease cannot prevent
double posting when a worker dies after ledger commit but before marking its item
complete.

## Decision 6 — Formula-looking text stays inert

Canonical monetary and timestamp fields use typed parsers and reject formula
syntax. Other text remains ordinary JSON/text and Admin clients render it as text;
Phase 08 defines no CSV export. If export is later added, cells beginning with
spreadsheet formula characters must be neutralized at that export boundary.

**Why**: mutating legitimate input beginning with `+` or `-` would corrupt typed
values, while an export-only defense precisely addresses spreadsheet execution.

**Source**: [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection).

## Decision 7 — Existing Admin and worker conventions are normative

Phase 08 reuses the checked-in `imports.*`, `parsers.*`, and `settings.imports.*`
permissions, `AdminAuthGuard`, recent-MFA options, exact permission matching,
bounded audit metadata, safe outbox envelopes, deterministic retry jitter, and
`FOR UPDATE SKIP LOCKED` claim functions with UUID lease tokens. It adds no roles,
queue product, telemetry SDK, or parser dependency.

**Why**: all required platform primitives already exist. Narrow reuse is less code
and retains security properties already covered by earlier Specs.

## Dependency and external-evidence conclusion

SPEC-BE-001 through SPEC-BE-007 implementation contracts are present locally.
Previously open items concern live provider credentials, controlled mobile test
identities, hosted-schema/RLS proof, deployed webhook endpoints, registry/tag-only
artifacts, live dashboards/alerts, or remote provenance. They are external evidence
gaps, not blockers for Phase 08 local implementation. Provider imports remain
fail-closed until their allowlisted credentials and endpoint are supplied; manual,
normalized, and file ingestion proceed independently.
