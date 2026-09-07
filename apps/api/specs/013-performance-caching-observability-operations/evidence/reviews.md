# Phase 13 review evidence

Date: 2026-09-06

Scope: complete SPEC-BE-013 implementation diff from base `ddec10683e88a3fd5e471f1d627e5ed3676a14f3`

## Clean-code review

Result: PASS after remediation.

- Reused the existing NestJS module, PostgreSQL pool, audit, outbox, worker, Admin repository, and Mobile service seams.
- Added no runtime dependency and no Redis/distributed-cache abstraction; the only cache is the approved bounded process-local safe-meta map.
- Kept one closed job registry and delegated domain behavior through existing `runJob` entry points rather than copying business logic.
- Kept validation at HTTP and database trust boundaries, with database constraints/RLS as the authoritative backstop.
- Searched the complete changed test/implementation scope for unresolved `TODO`/`FIXME`, focused tests, and vacuous constant expectations; none remain in Phase 13-owned files.

## Test-quality review

Result: PASS after remediation.

- Unit and property cases cover parsing, feature evaluation, cache eviction/invalidation, worker timeout settlement, closed registry behavior, and safe projections.
- Contract/security cases cover exact permissions, MFA, versions, reasons, idempotency, redaction, fixed metrics/actions/providers, production mock denial, and Free-only negative capability assertions.
- Integration/pgTAP cases execute real PostgreSQL functions, concurrent claims, three-attempt exhaustion, cross-resource idempotency mismatch, lifecycle constraints, RLS, grants, and outbox events.
- Performance uses the real controller/service/repository/database, 10,000-row fixtures, asserted EXPLAIN index names, load/stress thresholds, and cache/payload/cardinality checks.
- Recovery creates an independent SQL dump, deletes/restores owned data, verifies RLS/corruption rejection/replay, and supplements the additive migration test with an actual N-1 image run.

## Independent code review

Result: 12 important and 2 minor findings received; all validated blockers were resolved and affected tests were rerun.

| Review concern | Disposition |
|---|---|
| batched claims, timeout overlap, unbounded shutdown | claim one; keep heartbeat active; await handler settlement before timeout completion; bounded process shutdown |
| retry could reclaim an older failed attempt | claim only the latest attempt; prove three attempts and exact dead-letter exhaustion |
| running cancellation contradicted behavior | formally restrict cancellation to queued/retrying until cooperative abort exists; align contract, SQL tests, and runbook |
| idempotency not bound to resource | hash action, resource, operation, and body; reject cross-resource key reuse |
| incident/maintenance parsing drift | preserve allowed nulls, bound assignee, accept partial maintenance timestamps and validate effective state in SQL |
| placeholder performance/provider/capacity/recovery jobs | derive real database metrics, run fixed-destination database health, report optional providers honestly, derive capacity, and classify hosted recovery as external |
| documented outbox events absent | emit safe state-change events for jobs, providers, incidents, settings, flags, and maintenance |
| Admin pagination/filters repeated or disappeared | add query-scoped cursor chains; apply unsupported local filters with explicit partial status |
| Admin setting/flag controls misrepresented values | submit bounded operator-entered values; expose honest boolean flags only |
| production mock activation possible | hard-deny mocks in production; run Playwright against a non-production dev server |
| alert counters modeled as state | use bounded-window `increase(...)`; remove alerts for non-emitted state metrics |
| performance/recovery proof was synthetic | replace with real repository/database load, plan assertions, independent dump/restore, and actual N-1 image proof |
| empty feature context/evaluator drift | reject empty context and align app-version prefix evaluation with SQL |
| provider-page freshness drift | derive aggregate freshness from observations |

## Security diff review

Result: PASS; no Critical or High reportable finding remains.

The immutable security scan reviewed 49 workbench items, five candidates, and five attack paths. One authenticated low-severity cache-eviction finding survived validation in the captured snapshot. It was fixed by evicting only the oldest entry rather than clearing all 32 entries; the regression fills 33 contexts and proves an unrelated warm entry remains cached. Other candidates were resolved or rejected after validation:

- production Admin mocks are now impossible when `NODE_ENV=production`;
- safe-meta feature flags are limited to 50 by the authoritative SQL projection and strict Mobile parsing;
- running cancellation is not advertised or accepted, and timed-out handlers settle before a retry can run;
- job names, providers, operations, fields, metric labels, and recovery actions remain closed allowlists.

Dependency audit has no High/Critical issue (one transitive moderate `qs` advisory remains outside the configured blocking threshold). The current release image has 0 HIGH/CRITICAL Trivy findings. Full-history gitleaks retains six historical baseline findings; the Phase 13 staged diff is required to remain at zero before commit.

## Closeout forward-fix review

Result: PASS.

- The communication hydration fix changes one shared semantic root from block `<p>` to inline `<span>` and adds one direct regression assertion; it removes invalid nesting for every caller without adding an abstraction.
- The final workflow keeps the original performance and Playwright assertions, runs Admin quality and production shell performance once, and isolates the five existing viewport projects into independent jobs.
- Focused unit, typecheck, lint, the three implicated tablet E2E suites, the complete remote viewport matrix, database performance, container contracts, secret scan, redaction gate, and image scan all passed.
