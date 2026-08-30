# Code review: Phase 05 production and tests

## Summary

Ship after fixes. The Clean Code/SOLID/DRY/KISS/YAGNI/Ponytail guard pass covered
23 changed production files (including four migrations), and Test Guard covered
53 changed Jest/pgTAP/performance test files. No Critical/Important finding from
the local guard pass remains open.

## Critical findings

- **Resolved: reconciliation failures were not observable** —
  `src/ledger/ledger.worker.ts`
  - Evidence: scheduled retries caught failures without an observable signal and
    the duration metric always used `outcome=complete`.
  - Principle: no swallowed catch-all failures; operational correctness.
  - Fix: added `masarifi_ledger_reconciliation_failure_total`, success/failure
    duration outcomes, dashboard/alert ownership, and a red-first worker test.
    The exception still propagates from `runOnce`; the scheduler retries only
    after the failure has been recorded.

## Important findings

- **Resolved: version-conflict metadata was dropped** —
  `src/ledger/ledger.service.ts`, `src/ledger/ledger.repository.ts`,
  `src/platform/http/safe-exception.filter.ts`, and ledger command migration
  - Evidence: the API/internal contract promised the authoritative server
    version, but stale prechecks and database races returned only the code.
  - Principle: stable error-contract correctness; concurrency recovery.
  - Fix: return `currentVersion` from both paths, whitelist it only for
    `VERSION_CONFLICT`, and reject malformed metadata. Red-first unit, HTTP E2E,
    clean migration, and live concurrent revision tests pass.
- **Resolved: aggregate event ordering was not enforced** —
  `src/ledger/ledger.events.ts`
  - Evidence: `balance.changed` promised sorted touched IDs but the shared event
    builder accepted unsorted and duplicate lists.
  - Principle: contract correctness; plausible-but-wrong boundary handling.
  - Fix: reject non-strictly-increasing account IDs; two red-first variants pass.
- **Resolved: idempotency header policy was repeated in seven routes** —
  `src/ledger/ledger.controller.ts`
  - Evidence: identical validation/error-mapping blocks duplicated one rule.
  - Principle: DRY knowledge, small functions, Ponytail minimum code.
  - Fix: one private `validatedIdempotencyKey` boundary is reused by every write;
    four focused endpoint suites (5 tests) pass with unchanged behavior.

## Nits

None retained. The repository command coordinators are longer than generic
function-size guidance, but each deliberately exposes one PostgreSQL atomic
boundary (claim, mutation, audit/outbox, completion, commit/rollback). Splitting
that sequence into speculative layers would make financial ordering harder to
audit; this is a documented cohesion exception, not an open finding.

## Test Guard review

No actionable Rule 1-9 violation remains:

- service/worker mocks stand at persistence, security rate-limit, clock/random,
  telemetry, process, Docker, or filesystem boundaries;
- financial persistence assertions use real migrated PostgreSQL through pgTAP,
  integration, E2E, recovery, concurrency, and performance suites;
- variants use `it.each` where setup/behavior is shared;
- no focused/skipped test, broad snapshot, framework-only assertion, mocked
  financial entity, hardcoded success, or weakened expectation was introduced;
- the two test-instrumentation defects found by the full suite (global outbox
  claim interference and dropped query promise) were fixed at their boundaries.

## What's good

- Monetary truth remains in immutable postings with database constraints and
  deterministic locks; application DTOs never substitute for database
  invariants.
- Customer/Admin/RLS/grant boundaries are explicit and covered by negative tests.
- Audit, lifecycle/balance outbox events, projection effects, and idempotency
  completion share the same transaction and have rollback-injection evidence.
- No dependency, factory, interface hierarchy, feature flag, Phase 06 sync
  surface, or client implementation was added.

## Self-check coverage

- [x] Walked Section A (naming & functions)
- [x] Walked Section B (comments & formatting)
- [x] Walked Section C (SOLID)
- [x] Walked Section D (DRY/KISS/YAGNI)
- [x] Walked Section E (AI failure modes)
- [x] Walked Test Guard Rules 1-9 and the Jest reference

Verification after fixes: full formatter, typecheck, ESLint, and 56 unit suites /
446 tests pass; focused worker/event/observability tests pass 43/43; focused
write endpoint suites pass 5/5.

## Independent review

An independent post-implementation review found three Critical, four Important,
and one Minor issue. Every finding was accepted at the underlying boundary and
closed before release:

| Severity | Finding | Disposition and executable regression |
|---|---|---|
| Critical | Admin exclusion in ledger RLS could not reliably distinguish a customer later promoted to Admin. | Added the minimum `SECURITY DEFINER` actor-role predicate with explicit outer-row qualification; unrelated Admin rows do not affect customers, while a promoted customer loses raw reads and replay access. Live ownership security and pgTAP pass. |
| Critical | Completed replays could be rejected by version, recent-auth, rate, or other business prechecks. | Added non-mutating `lookup_idempotency_key`; all eight write services replay completed responses immediately after normalization/hash and before business gates. Route matrix and live stale-version replay pass. |
| Critical | Deleting and later restoring a refund could bypass the cumulative refund cap. | Compensating refund/reversal rows and any transaction with dependents are ineligible for delete. The exact 60 + delete + 60 exploit is rejected atomically. |
| Important | Historical account IDs accumulated across revisions and could reject a fourth account or report zero-effect balances. | Added `ledger_account_ids` for grouped current effects and returned command-touched balances/events separately. Four-account repeated revision regression passes. |
| Important | Plain property-order hashing made equivalent opening requests mismatch. | Canonical JSON hashing now recursively sorts object keys with arrays order-preserving, using Node `crypto` only. Reordered/nested request regression passes. |
| Important | SQL numeric/projection overflow did not map to the stable amount error. | SQLSTATE `22003`, `AMOUNT_INVALID`, and named projection range constraints map to `AMOUNT_OUT_OF_RANGE`; cumulative overflow rolls back fully in live integration. |
| Important | Mobile compatibility omitted executable `currencyCode <- currency` and nullable/status mappings. | Spec and mapping now name the wire field `currency`; representative OpenAPI responses run through an executable Mobile mapping contract without client changes. |
| Minor | The idempotency dashboard grouped a non-emitted `outcome` label. | Dashboard now groups the emitted fixed-cardinality `scope` label. |

The RLS report's literal global-customer-failure mechanism was not reproduced
because existing `admin_profiles` RLS affects the subquery, but the promoted-
customer Admin boundary was valid and was fixed rather than dismissed. A final
local review also expanded the requested low-cardinality command/read/lock/
posting/projection/reconciliation metrics and distinguished atomic append-failure
stages. No Critical, Important, or accepted Minor finding remains open.

Post-review verification: formatter/typecheck/ESLint pass; unit 56/446;
contract 32/119; clean PostgreSQL reset/lint and pgTAP 22/606; live integration
41/100; E2E 29/46; security 16/86; performance 56,687/56,687 checks; container
7/19. All listed suites have zero failures and zero skips in their live runs.
