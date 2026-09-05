# Research: Reference Data, Categories & Accounts

## Decision 1: One Cohesive `reference` Module

**Decision**: Add one NestJS `reference` module with one controller, service,
repository, DTO file, event builder, and tiny ETag cache. Shared reference,
category, account, and exchange-rate behavior stays together because it shares
the same ownership, permission, seed, and cache boundaries.

**Rationale**: This matches the existing flat identity/security module pattern
and avoids per-table repositories or interfaces with one implementation.

**Alternatives rejected**: Four modules, an ORM layer, generic CRUD framework,
microservice, Edge Function, or new package.

## Decision 2: SQL Remains the Invariant Boundary

**Decision**: PostgreSQL constraints and small guarded functions enforce owner,
system-row, hierarchy/merge, default-account, lifecycle, version, audit, and
outbox atomicity. NestJS validates DTO shape and maps stable errors; it does not
duplicate database invariants as authority.

**Rationale**: API and future worker callers share one enforcement point, and a
failed audit/outbox write rolls back the resource mutation.

**Alternatives rejected**: Controller-only rules, ORM hooks, after-commit audit,
or separate event writes.

## Decision 3: Four Additive Migrations Across Two Checkpoints

**Decision**: Release A uses ordered files for (1) tables/indexes/functions,
(2) insert-only deterministic reference/permission seeds, and (3) guarded RLS/
grants. Release B adds and validates the preference-currency FK only after the
Release A application is the supported N-1 image. pgTAP remains in
`supabase/tests`, not migrations.

**Rationale**: The split keeps schema, data, security, and the compatibility-
sensitive FK independently reviewable without creating another migration system.

**Alternatives rejected**: One giant file, per-table migrations, manual Dashboard
changes, or a seed runtime dependency.

## Decision 4: Deterministic Seeds Use Natural Keys and Drift Hashes

**Decision**: Seed the current Mobile system category keys, all 12 executable
Mobile currencies, and their ISO countries with insert-only conflict handling. A
stable manifest and test hash detect drift; the seed never overwrites an audited
Admin change. No demo account or customer data enters SQL.

**Rationale**: Repeated deploys are safe and current client keys resolve without
silently reclassifying data.

**Alternatives rejected**: Random UUIDs, deleting/reinserting references, fixture
imports, or a background seed worker.

## Decision 5: System Category UUIDs Are Derived in SQL

**Decision**: Use deterministic UUIDs generated from each system key with the
already-installed `pgcrypto` digest. Seed UUIDs do not depend on execution order.

**Rationale**: Later foreign keys and client mappings stay stable across clean
environments without adding a UUID library or sequence table.

**Alternatives rejected**: Random IDs, hard-to-review handwritten UUID lists, or
using text keys as the table primary key.

## Decision 6: Category Cycle Validation Uses a Recursive CTE

**Decision**: A bounded recursive CTE checks whether a proposed parent or merge
target reaches the source. Database guards also require compatible owner and
financial kind. The traversal terminates at the row count and fails closed.

**Rationale**: A self-check is insufficient; one shared database check covers all
callers and arbitrary hierarchy depth.

**Alternatives rejected**: Application-only traversal, fixed maximum depth, or a
closure table not justified by current scale.

## Decision 7: Category Merge Delegates to the Ledger Once Available

**Decision**: Before SPEC-BE-005, Phase 04 may only mark a user category
inactive/deleted with `merged_into_id`, audit it, and emit `category.merged`.
With SPEC-BE-005 present, merge first calls the ledger-owned command to
reclassify every owned transaction header while preserving postings and adding
revision/audit/outbox evidence.

**Rationale**: This preserves current Mobile lifecycle semantics without stealing
ledger ownership.

**Alternatives rejected**: Reference-owned direct transaction updates, omitting
traceability, or a generic cross-domain cascade.

## Decision 8: Current Mobile Account Types Are Canonical

**Decision**: Store `bank`, `debit_card`, `credit_card`, `wallet`, `cash`,
`savings`, and `other`, plus the current safe account metadata. The Phase 04
Master Plan rows are corrected before implementation.

**Rationale**: The Constitution makes executable client contracts factual
authority. Collapsing card/savings types loses observable behavior and cannot be
reconstructed after reinstall.

**Alternatives rejected**: Coarse type mapping, storing discarded values only in
SQLite, or free-form account types.

## Decision 9: Opening Balance Fails Atomically Until SPEC-BE-005

**Decision**: Zero or omitted opening balance creates the account. A non-zero
value returns `409 LEDGER_NOT_AVAILABLE` before the database transaction starts.
No balance column or placeholder posting is created.

**Rationale**: A partial account plus later balance write violates the Master Plan
and financial source-of-truth rule.

**Alternatives rejected**: Account balance column, direct posting, deferred fake
job, or silently dropping the amount.

## Decision 10: Pre-SPEC-BE-006 Retry Behavior Matches SPEC-BE-003

**Decision**: Every mutation validates a bounded `Idempotency-Key`. Phase 04 does
not create replay storage or an in-process replay/coalescing map. Unique
constraints, expected versions, and idempotent archive/delete/restore terminal
responses provide the honest current ceiling. Durable arbitrary replay is
explicitly unavailable until SPEC-BE-006.

**Rationale**: This reuses the approved upstream convention without hiding replay
state in audit JSON or stealing a later table.

**Alternatives rejected**: A second idempotency table, resource replay columns,
audit JSON lookup, or claiming durability that does not exist.

## Decision 11: Exact Admin Permissions Extend the Existing Manifest

**Decision**: Add canonical `reference.read` and `reference.write` keys. Super
Admin receives both; the Security Administrator receives read only. Writes require
recent MFA and a bounded reason through the existing `AdminAuthGuard`.

**Rationale**: Shared references need one clear permission boundary and current
roles already distinguish read and write governance.

**Alternatives rejected**: Reusing broad settings permissions, role-name checks,
client headers, or a second authorization system.

## Decision 12: ETags and One Process-Local Cache Are Enough

**Decision**: Compute ETags from an ordered canonical payload or ordered
natural-key/version tuples. Keep only enabled currency/country/system-category
payloads in a bounded process-local map for at most 24 hours. Every request first
checks the bounded database collection hash/version; owned shared events also
invalidate local entries. User rows and authorization decisions are never cached.

**Rationale**: This satisfies current read scale without Redis or cache
infrastructure. Database remains truth and cache loss only costs a read.

**Alternatives rejected**: Redis, materialized views, caching user accounts, or
using cache entries as authorization state.

## Decision 13: Exchange Rates Are Read-Only Metadata

**Decision**: Admin/worker may insert immutable approved metadata. The resolver
returns the closest row at or before the requested instant within `maxAge`;
same-currency returns one without persistence. No provider worker is registered
until provider approval and configuration exist.

**Rationale**: Missing data becomes explicitly unavailable, and no secret or fake
rate is required to complete Phase 04.

**Alternatives rejected**: Scraping, arbitrary URL fetch, manual customer rate,
default rate, or enabling a worker with placeholder configuration.

## Decision 14: RLS Is Forced on Reference Tables Too

**Decision**: Enable and force RLS on all five tables. Policies allow authenticated
enabled/shared reads and owner reads; mutations go through API/database roles with
exact checks. Default schema/table/function privileges are revoked first.

**Rationale**: Reference data is server-managed and exchange-provider metadata
must not be anonymously exposed or client-written.

**Alternatives rejected**: Public anonymous tables, direct client CRUD policies,
or service-role-only access that bypasses owner RLS for normal API reads.

## Decision 15: No Unresolved Clarification or Provider Dependency

All design choices are resolved from the Constitution, Master Plan, current code,
and current client contracts. Live FX refresh, ledger opening entries, durable
idempotency, provider health, and client cutover remain later owned scope rather
than clarifications.
