# Phase 07 Dependency Evidence

## Consumed Contracts

| Spec | Evidence reviewed | Phase 07 consumption |
|---|---|---|
| SPEC-BE-001 | platform database pool, migration runner/checksums, request IDs, safe errors, OpenTelemetry, outbox/worker/health, Docker image | infrastructure only; no duplicate platform abstraction |
| SPEC-BE-002 | Clerk guard/principal, profiles/preferences/devices | active owner identity, timezone/locale, account/device sync context |
| SPEC-BE-003 | Admin guard, `private.has_permission`, audit/security events, support-purpose boundary | `planning.read` Admin aggregate only; deny mutation |
| SPEC-BE-004 | currencies, accounts, categories, owner functions/RLS | enabled currency, owned compatible account/category validation |
| SPEC-BE-005 | transactions, postings, balances, versions, ledger commands/reconciliation/outbox | sole financial truth; planning links and derives, never posts/balances directly |
| SPEC-BE-006 | durable idempotency receipt, client mutations/state/conflicts, sync handlers/tombstones, worker fences/retry | mutation replay, optimistic conflicts, offline resource mapping, crash-safe jobs |

## Current Code Evidence

- API/worker module composition: `apps/api/src/app.module.ts` and
  `apps/api/src/worker.module.ts`.
- Ledger command and exact-money behavior: `apps/api/src/ledger/*` plus Phase 05
  migrations/tests 019-022.
- Sync idempotency/handler/worker behavior: `apps/api/src/sync/*` plus Phase 06
  migration/tests 023-028.
- Shared database, outbox, health, security, and observability helpers remain the
  only implementations used by the planned module.

## Dependency Result

All prerequisites exist locally at the Phase 07 base revision. No missing
dependency requires Phase 08+, a new package, schema owner, queue, cache service,
or client cutover. Phase 07 may proceed without modifying prior owned contracts
except additive handler/module registration explicitly consumed by this Spec.
