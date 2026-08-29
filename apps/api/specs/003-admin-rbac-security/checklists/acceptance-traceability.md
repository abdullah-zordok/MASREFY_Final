# Acceptance traceability

## Functional requirements

| IDs | Primary implementation and proof |
| --- | --- |
| FR-001, FR-002, FR-003, FR-004, FR-005 | `admin-auth.guard.ts`, repository transaction/evaluator, pgTAP 010, exact-permission unit/security/performance suites |
| FR-006, FR-007, FR-008, FR-009, FR-010, FR-011 | permission manifest/seeds, system-role/continuity migrations, Admin governance repository/service, DTO/integration/E2E tests |
| FR-012, FR-013 | forced-RLS/grant migrations 62203–75000, pgTAP 009–015, live RLS integration matrix |
| FR-014, FR-015 | owner event keyset query, owner-column grant migration, pgTAP 011/014, customer event contract/E2E/performance tests |
| FR-016, FR-017, FR-018, FR-019 | transaction audit append/hashes, immutable triggers/grants, bounded redacted audit/security/incident queries and tests |
| FR-020, FR-021, FR-022, FR-023, FR-024, FR-025 | support request/grant functions, operation-scoped RLS, registered workspace projection, worker expiry, pgTAP/integration/E2E/runbook |
| FR-026, FR-027 | incident transition table, immutable timeline, validated alert outbox/worker, contract/integration/E2E/operations evidence |
| FR-028, FR-029, FR-030, FR-031 | privacy request/orchestration, handler registry, streaming ZIP, private Storage, reauthorized signing, lifecycle tests |
| FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038 | deletion/retention schema, handlers, cooling-off/hold recheck, bounded worker, pgTAP/contract/integration/E2E/recovery evidence |
| FR-039, FR-040, FR-041 | idempotency/version/reason/recent-auth enforcement, `security.dto.ts`, contract and negative suites |
| FR-042, FR-043 | PostgreSQL-backed keyed rate limits, bounded query/job/package limits, abuse and million-row performance evidence |
| FR-044, FR-045 | 38-path/45-operation OpenAPI composition, Admin/Mobile mapping contracts, mock-authority tests, zero client diff |
| FR-046, FR-047 | ordered additive checksummed migrations, schema compatibility, route-disabled locked bootstrap and recovery runbook |
| FR-048, FR-049 | fixed-cardinality metrics, alert/owner/runbook evidence, OWASP traceability, dependency/security scan evidence |
| FR-050 | immutable manifest/registry/audit/support/privacy/retention contracts for later Specs; no later domain was implemented |

## Acceptance criteria

| ID | Evidence |
| --- | --- |
| AC-001 | ownership inventory, data model, migrations 62150–75000, clean migration/pgTAP CI |
| AC-002 | US1 guard, database permission, negative and performance evidence |
| AC-003 | seven roles / 151 permissions manifest, seed and contract tests |
| AC-004 | mock-authority and exact-permission negative suites |
| AC-005 | Admin governance DTO/integration/E2E/provider tests |
| AC-006 | audit immutability, atomic mutation/outbox integration and pgTAP |
| AC-007 | support scope/concurrency/RLS/workspace/expiry tests |
| AC-008 | owner security-event RLS/column grants and redacted Admin lists |
| AC-009 | incident transition/version/timeline/alert tests |
| AC-010 | export request/handler/ZIP/Storage/signing/expiry tests |
| AC-011 | deletion cooling-off/cancel/handler/hold/session/profile tests |
| AC-012 | retention policy/hold/mode/batch/unknown-handler tests |
| AC-013 | retained million-row timing and payload evidence |
| AC-014 | redacted indexed plans and bounded cursor/batch tests |
| AC-015 | runtime OpenAPI + Admin/Mobile mapping + no-client-diff gates |
| AC-016 | checksum/clean apply/bootstrap/recovery/container release gates |
| AC-017 | operations, security, recovery, and four runbook evidence files |
| AC-018 | OWASP traceability, official Codex Security scan, CI secret/Trivy gates |

## Success criteria

| ID | Evidence |
| --- | --- |
| SC-001 | exact-permission matrix, no wildcard/cache/client authority |
| SC-002 | pgTAP 009–015 and live API/worker/owner/admin denial matrix |
| SC-003 | transactional audit append, hashes, request IDs, immutable tests |
| SC-004 | support denial, subset, time, revoke, race, and workspace projection tests |
| SC-005 | asynchronous `202` privacy/deletion routes and performance contracts |
| SC-006 | ready-only owner/recent-auth signing and exact object/origin validation |
| SC-007 | complete handler reconciliation and retained-category projection |
| SC-008 | permission/event observed timing and CI list/performance gates |
| SC-009 | ownership inventory plus this FR/AC/SC traceability and final evidence |
| SC-010 | no client source change and mock-authority security tests |

Inventory reconciled: 16 tables; four public contract functions; 45 operations across 38 paths; five jobs; ten events; seven system roles; 151 permission keys; four recovery runbooks.
