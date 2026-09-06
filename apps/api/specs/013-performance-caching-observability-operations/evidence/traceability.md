# Requirement traceability

Evidence date: 2026-09-06

Scope: SPEC-BE-013, Free-only MVP

Abbreviations below name runnable proofs:

- `DB54`..`DB58`: `supabase/tests/054_phase13_operations_schema.sql` through `058_phase13_settings_flags.sql`.
- `OPS-U/C/I/E/S/P`: Phase 13 unit, contract, integration, E2E, security, and performance suites under `apps/api/test/*/operations`.
- `API`: complete `npm run verify` plus full active local-database Jest and pgTAP runs.
- `ADMIN`: Admin typecheck, lint, 799 Vitest tests, production build, and the 595-case Playwright matrix.
- `MOBILE`: Mobile typecheck, lint, quality boundaries, and 1,722 Jest tests after the bounded-flag regression was added.
- `PERF`, `RECOVERY`, `REVIEWS`, `REMOTE`: the sibling evidence documents.

## Functional requirements

| Requirement | Implementation proof | Passing test/evidence |
|---|---|---|
| FR-001 | 50-key frozen registry and migration seeds | `DB54`, operations-worker table test |
| FR-002 | `register_job` owner range excludes 012 | `DB54`, `DB56`, ownership security |
| FR-003 | locked registration and immutable owner/type | `DB56` |
| FR-004 | database checks plus request parsers | `DB54`, `DB56`, operations-schemas unit |
| FR-005 | `FOR UPDATE SKIP LOCKED` plus active-run unique index | `DB54`, `DB56`, operations scheduler integration |
| FR-006 | private runs/attempts with bounded safe summaries | `DB54`, `DB56`, operations read/worker tests |
| FR-007 | deterministic retry, lease recovery, terminal history, retention | `DB56`, OPS-I/E |
| FR-008 | stored `retry_safe`/`cancel_safe` gates | `DB56`, operations actions contract |
| FR-009 | six-key Free-only provider allowlist; no Stripe/billing seed | `DB54`, OPS-S |
| FR-010 | fixed provider keys, bounded timeout setting, safe stored fields | `DB54`, OPS-S, provider contract tests |
| FR-011 | safe meta always keeps core finance available | platform-meta contract and provider-outage security tests |
| FR-012 | incident check constraints and guarded transitions | `DB57`, incident integration/contract |
| FR-013 | maintenance checks, overlap guard, guarded transitions | `DB57`, incident integration/contract |
| FR-014 | exact permissions/MFA/reason/version/audit | operations permissions and incidents contract; `DB57` |
| FR-015 | public incident/maintenance allowlists | operations read/config contracts and `DB57` |
| FR-016 | four writable schema-keyed settings plus restricted recovery metadata | `DB58`, config contract |
| FR-017 | restricted values are projected only as redacted metadata | operations read/config contracts |
| FR-018 | key/value denylist and restricted-setting rejection | `DB58`, config contract/security |
| FR-019 | feature lifecycle/default/version/audit | `DB58`, feature-evaluator unit, config contract |
| FR-020 | unique priority and four-key audience bound | `DB54`, `DB58`, feature-evaluator unit |
| FR-021 | server-derived platform/locale/version/cohort only | `DB58`, operations schemas/security |
| FR-022 | missing/retired/invalid/nonmatching fail-safe results | `DB58`, feature-evaluator unit |
| FR-023 | invariant-name denylist in SQL and TypeScript | `DB58`, config security |
| FR-024 | bounded parser, cursor pages, 720-point ceiling | operations schemas/read contracts, OPS-P |
| FR-025 | fixed route/operation/job enums; no arbitrary execution inputs | OPS-C/S |
| FR-026 | 14 exact `operations.*` permissions and database recheck | permission contract, `DB55` |
| FR-027 | mutation route metadata plus RPC idempotency/audit | operations actions/config/incidents contracts |
| FR-028 | fixed metric names, labels, and value regex | metrics unit/security and assets contract |
| FR-029 | seven alert-to-runbook anchors | operations assets contract, `triage.md` |
| FR-030 | cross-domain existing metrics plus 11 operations metrics | metrics contract, dashboard, `performance.md` |
| FR-031 | operations assets contain no paid/billing metric/provider | ownership and assets security tests |
| FR-032 | versioned cross-domain inventory | `performance.md` |
| FR-033 | SQL EXPLAIN, cache, load/stress, ledger/sync matrix | OPS-P, `performance.md` |
| FR-034 | 32-entry/30-second safe-meta cache and explicit mutation invalidation | platform-meta cache unit/performance |
| FR-035 | no dependency/Redis change | package diff and `performance.md` |
| FR-036 | metadata-only recovery projection and hosted classification | recovery route contract, `recovery.md` |
| FR-037 | active local restore/corruption/RLS/replay tests | OPS-E with live database, `recovery.md` |
| FR-038 | complete DR/primary-return runbook with 900/7200 targets | operations recovery runbook, `recovery.md` |
| FR-039 | hosted/PITR evidence explicitly external | recovery route/runbook/evidence |
| FR-040 | additive ordered migration and checksum | migration E2E, checksum gate, OPS-E rollback test |
| FR-041 | existing Admin repositories consume live operations schemas | Admin live contract and `ADMIN` |
| FR-042 | separate strict Mobile adapter with fail-closed fallback | Mobile adapter tests and `MOBILE` |
| FR-043 | all six paid capabilities are literal false | API/Mobile meta contract tests |
| FR-044 | Free-only AI allowance is literal five | `DB58`, API/Mobile meta tests |
| FR-045 | production mock gate requires test or explicit E2E-only override | Admin live contract and production build |
| FR-046 | nine owned jobs plus reused domain `runJob` entrypoints | worker registry tests and 50-key comparison |
| FR-047 | forced RLS/revoked direct grants; exact RPC grants | `DB55` |
| FR-048 | safe-record, logger, responses, recovery refs redacted | OPS-C/S and existing logger tests |
| FR-049 | local/external/N/A/remote classifications | `performance.md`, `recovery.md`, `verification.md`, `remote-ci.md` |
| FR-050 | spec/tasks/master plan keep 012 deferred and 014 unstarted | ownership security, final master-plan check |

## Acceptance criteria

| Criterion | Proof |
|---|---|
| AC-001 | 50 unique registry/contract/migration keys; `DB54` |
| AC-002 | `DB56` idempotency and ownership-conflict cases |
| AC-003 | `DB54` active unique index plus `DB56` concurrent claims |
| AC-004 | `DB56`, timeout regression, scheduler/recovery suites |
| AC-005 | six fixed keys and arbitrary-URL rejection in OPS-S; no Stripe seed |
| AC-006 | operations mutation contracts plus `DB57`/`DB58` |
| AC-007 | restricted-redaction read contracts and OPS-S |
| AC-008 | feature evaluator property/unit tests and `DB58` |
| AC-009 | invariant denylist tests in `DB58` and OPS-S |
| AC-010 | operations schema/read contracts and budget performance test |
| AC-011 | metric label security test |
| AC-012 | operations assets contract and `triage.md` |
| AC-013 | operations EXPLAIN fixture and `performance.md` |
| AC-014 | cache unit/performance tests and secret-value assertion |
| AC-015 | all applicable performance/stress commands in `performance.md` |
| AC-016 | active live-database recovery, full migration, reconciliation, image tests |
| AC-017 | measured restored-row age and elapsed restore time in `recovery.md` |
| AC-018 | Admin live-contract test plus `ADMIN` |
| AC-019 | Mobile strict adapter/contract tests plus `MOBILE` |
| AC-020 | API/Admin/Mobile capability and ownership negative tests |
| AC-021 | complete matrix in `verification.md`; external Mobile gates separately classified |
| AC-022 | clean-code, test, security, and independent results in `reviews.md` |
| AC-023 | this matrix, checked task ledger, checked specification checklist |
| AC-024 | final exact-SHA divergence/CI and protected-path list in `remote-ci.md` |

## Success criteria

| Criterion | Proof |
|---|---|
| SC-001 | deterministic bounded dashboard/alert/runbook drill in `triage.md` |
| SC-002 | unique index, `DB56`, and concurrent scheduler test |
| SC-003 | route metadata, guards, mutation RPCs, and mutation contracts |
| SC-004 | safe-summary/restricted-setting/provider/redaction tests |
| SC-005 | assets contract resolves all seven alerts and fixed labels |
| SC-006 | operations and cross-domain matrix in `performance.md`; no Redis |
| SC-007 | active measured local recovery suite in `recovery.md` |
| SC-008 | provider-outage safe-meta test keeps core finance true |
| SC-009 | API/Admin/Mobile negative capability tests and production mock isolation |
| SC-010 | `verification.md` and final exact-SHA `remote-ci.md` |

## Owned resources

| Resource set | Enumerated ownership | Proof |
|---|---|---|
| private tables (9) | `scheduled_jobs`, `job_runs`, `job_attempts`, `provider_health_checks`, `system_incidents`, `system_settings`, `feature_flags`, `feature_flag_rules`, `maintenance_windows` | `DB54`, `DB55`, migration reset |
| authoritative functions (10) | `register_job`, `heartbeat_job_attempt`, `claim_due_jobs`, `complete_job_attempt`, `request_job_action`, `evaluate_feature_flag`, `read_safe_platform_meta`, `read_operations`, `execute_operations_command`, plus closed internal `execute_operations_job` | `DB55`-`DB58`, OPS-I |
| permissions (14) | health/providers/jobs/incidents/settings/flags/maintenance/performance/recovery read/manage keys exactly as applicable | permission manifest contract, `DB55` |
| governed jobs (50) | Specs 001-011 (41) and Phase 13 (9), unique across contract/code/migration | `DB54`, operations-worker unit comparison |
| API paths/operations | 20 paths and 24 operations in OpenAPI, matching 24 controller route entries | OpenAPI parser/drift and operations route contracts |
| Admin seams | system health, jobs, incidents, settings, flags, maintenance, performance, recovery | Admin live contract, repository tests, Playwright |
| Mobile seam | authenticated `/api/v1/meta` with context headers, ETag/304, strict safe projection | Mobile adapter/contract tests |

`execute_operations_job` is the closed worker RPC in addition to the nine externally named authoritative functions. Helper/trigger functions are migration internals and are covered by `DB54`-`DB58` rather than represented as client capabilities.
