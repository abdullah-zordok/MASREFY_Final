# Dependency And Ownership Evidence

## Governance and ownership

The complete Backend Constitution 2.0.0 and all 3,078 lines of
`docs/Back end/BACKEND_MASTER_PLAN.md` were reviewed before production code. The
Phase 05 owned resources, temporary SPEC-BE-006 idempotency prerequisite, and
later-Spec exclusions are listed in `spec.md`. Planning synchronized the Master
Plan with verified Mobile `title`/`paymentMethod`, expected-version, transfer,
and compatibility boundaries before schema implementation.

## SPEC-BE-001

Verified in `apps/api/src/platform/`, `apps/api/src/main.ts`,
`apps/api/src/worker.ts`, `supabase/migrations/`, Docker files, and
`.github/workflows/backend-foundation.yml`:

- API/worker/migration processes and centralized configuration;
- ordered checksum migrations and request/JWT database context;
- safe exception envelope and request IDs;
- transactional outbox enqueue/dispatch;
- telemetry, health, graceful shutdown, containers, CI, and signed release jobs.

Historical unchecked PR-only foundation evidence is stale external evidence, not
a missing local contract. Phase 05 reruns every applicable gate.

## SPEC-BE-002

Verified Clerk principal/session/factor-age evidence, active profile checks,
profile ownership, and Clerk-sub RLS. The following remain external-only and are
not represented as passes: Apple Team ID; two protected Phone identities and the
complete three-user matrix; hosted canonical-schema owner/nonowner proof; some
provider outage/rotation rehearsals; deployed webhook secret/URL; and protected
tag-only signature/provenance evidence. Fixture-backed local authorization and
Phase 05 implementation are not blocked by those gaps.

## SPEC-BE-003

Verified exact Admin permission checks, recent-auth guard, purpose-bound support
grant validation, immutable audit append, security events, and customer/Admin
denial matrices. The current `private.assert_support_grant` resource allowlist is
limited to profile contact, account status, device/session diagnostics,
subscription summary, and import summary. It has no raw ledger scope. Phase 05
adds no permission or support-scope extension and denies every Admin/support role
raw ledger reads and financial writes.

## SPEC-BE-004

Verified released currency/category/account schema, owner RLS, category resolver,
account lifecycle/currency/default rules, atomic audit/outbox pattern, client
contracts, pgTAP 016-018, and recovery evidence. Nonzero opening balance currently
fails closed with `LEDGER_NOT_AVAILABLE`; Phase 05 replaces only that documented
handoff with a same-client account-plus-opening transaction. Phase 04 retains
account insert and validation ownership.

## Client contracts

Current Mobile `core-finance` requires bounded list/get/create/update/delete/undo,
transfer/refund/reversal relationships, projected account balances, title,
optional payment method, signed minor-unit mapping, versions, deletion/undo
timestamps, and stable operation IDs. Sync/conflict handling remains SPEC-BE-006.

Current Admin user summaries expose only aggregate `transactionsCount` and reject
raw financial rows. Phase 05 preserves that contract. No Mobile/Admin source file
or unrelated feature is owned by this Spec.
