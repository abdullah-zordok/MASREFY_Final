# Research: Performance, Caching, Observability & Operations

**Spec**: SPEC-BE-013
**Date**: 2026-09-06
**Base revision**: `2e2bf13f409e4a891fc3d8072cf07a26d7685392`

All planning unknowns are resolved. Hosted-console evidence remains an execution-time external dependency, not a design clarification.

## Decision 1: Keep the control plane inside the existing modular monolith

**Decision**: Add one `operations` API/worker module and reuse the existing database pool, Admin guard, audit function, outbox, metrics, logger, and domain worker methods.

**Rationale**: The existing API and worker processes already provide the required lifecycle and dependencies. A separate service would add deployment, authentication, observability, and failure modes without evidence that isolation is needed.

**Alternatives considered**:

- Separate operations service: rejected as unsupported operational complexity.
- Serverless functions per job: rejected because existing workers and local recovery contracts would be duplicated.
- Reimplementing domain jobs: rejected because ownership stays with Specs 001-011.

## Decision 2: Use a database-backed due-job claim, not pg_cron

**Decision**: `private.scheduled_jobs` stores a validated interval schedule (`everySeconds`, UTC timezone) and next due time. A fixed worker tick atomically claims due rows with `FOR UPDATE SKIP LOCKED`, advances the next due time, creates one run and first attempt, and dispatches an allowlisted in-process handler.

**Rationale**: There are more domain jobs than the recommended small concurrent Cron workload, the worker process already exists, and direct `cron.job` writes are no longer supported. One bounded claim function provides deterministic ownership, history, retry, and local testability without another scheduler dependency.

**Alternatives considered**:

- Supabase Cron/pg_cron per job: rejected because current guidance recommends no more than eight concurrent jobs and jobs under ten minutes; the domain inventory is larger and already has a worker runtime.
- A cron parser dependency: rejected because interval schedules meet the approved scope and a new dependency is unnecessary.
- Hard-coded `setInterval` in every domain: rejected as the current behavior Phase 13 is intended to govern.

## Decision 3: Use a narrow JSON schedule contract

**Decision**: The optional schedule is either `null` for manually/internally triggered work or an exact object `{ "kind": "interval", "everySeconds": integer, "timezone": "UTC" }`. The interval is 10 seconds to 31 days. Registration computes `next_run_at`; disabling a job prevents claims without deleting history.

**Rationale**: This avoids ambiguous cron/timezone behavior, is easy to validate in both application and database layers, and covers current periodic workers.

**Alternatives considered**:

- Free-form cron strings: rejected because safe parsing and timezone semantics would require additional code/dependencies.
- SQL interval text: rejected because arbitrary text is harder to validate consistently at the API boundary.
- Local-time schedules: rejected because all current server jobs are operational periodic work and UTC eliminates DST ambiguity.

## Decision 4: Store operational history, not job payloads

**Decision**: Runs and attempts store job identity, owner, timestamps, status, correlation, worker identifier, safe code, and a flat bounded result summary. Domain input remains in domain-owned tables and queues.

**Rationale**: Operations needs evidence and control, not a second business-data store. This limits PII, financial-data, and provider-response exposure and makes retention predictable.

**Alternatives considered**:

- Store arbitrary payload/result JSON: rejected for mass-assignment, privacy, and secret-leak risk.
- Link only to logs: rejected because logs are not an authoritative lifecycle history.

## Decision 5: Make job handlers explicit and safe-action metadata immutable by ownership

**Decision**: An in-process allowlist maps stable job keys to existing domain methods. Registration records `retry_safe` and `cancel_safe`; re-registration may narrow but not silently broaden safety or change owner. Admin actions resolve only by stored key and never accept a payload or handler name.

**Rationale**: The safest dispatcher is a closed set. It prevents arbitrary execution while preserving domain ownership.

**Alternatives considered**:

- Dynamic module/function names in the database: rejected as an arbitrary execution surface.
- User-supplied job payloads: rejected explicitly by scope.

## Decision 6: Keep Phase 13 tables private and API-only

**Decision**: All nine tables live in `private`, have RLS forced, default/client grants revoked, and are reached only through minimum worker/API functions. Security-definer functions use `search_path = ''` and schema-qualified references.

**Rationale**: Current official Supabase guidance emphasizes that grants and policies are separate checks and both must be tested. Private API-only data does not need direct Data API exposure.

**Alternatives considered**:

- Public read views: rejected because operational projections are easier to redact and authorize in the application boundary.
- Client-role policies on private tables: rejected because clients have no legitimate direct access.

## Decision 7: Use exact operations permissions with a narrow compatibility mapping

**Decision**: Seed exact permissions for health, providers, jobs, incidents, settings, flags, maintenance, performance, and recovery. Existing Admin repository permissions may map to the corresponding new read permission during this release, but all mutations use the exact new manage permission plus recent MFA.

**Rationale**: This removes the ambiguous phase-oriented permission surface while preserving current read-only screens during additive rollout.

**Alternatives considered**:

- Reuse only legacy keys: rejected because the approved contract requires `operations.*` permissions.
- Grant one broad operations-admin permission: rejected as excessive privilege.

## Decision 8: Evaluate flags in the database with a closed context schema

**Decision**: `private.evaluate_feature_flag` accepts only a JSON object with optional allowlisted server-derived fields: `platform`, `appVersion`, `locale`, and `cohort`. It rejects unknown keys, nested values, identifiers, role/permission/plan/entitlement claims, and oversized input. Rules use exact bounded matches plus deterministic priority.

**Rationale**: Database evaluation gives one authoritative result and version while preventing the client from extending the audience language.

**Alternatives considered**:

- Arbitrary JSON-logic: rejected as an unbounded policy language.
- Client-side evaluation: rejected because clients could forge targeting inputs and observe internal rules.

## Decision 9: Keep settings values schema-keyed and secret-free

**Decision**: Each allowed setting key has a server-owned validator and sensitivity. The database enforces common JSON bounds and forbidden secret-like keys; the application enforces the exact per-key schema. Restricted values are write-only through the mutation path and always redacted on read.

**Rationale**: A universal configuration language would be too permissive. Existing Joi/class validation patterns can enforce precise contracts without a new schema engine.

**Alternatives considered**:

- Arbitrary JSON settings: rejected for secrets, mass assignment, and unsafe runtime controls.
- Environment variables only: rejected because versioned audited runtime operations are an approved requirement.

## Decision 10: Use process-local caches only where prior Specs already permit them

**Decision**: Add a tiny version-aware operations read cache only for safe public/resolved configuration, with a maximum 30-second TTL and explicit invalidation after settings, flag, or maintenance changes. Continue existing reference/public-content/report-summary rules. Authorization and private financial truth are never cached here.

**Rationale**: Existing process-local and database behavior is sufficient. A new distributed cache is not justified by measured evidence.

**Alternatives considered**:

- Redis: rejected; no failing measurement or approved governance change exists.
- Cache all Admin reads: rejected because operational freshness and sensitivity outweigh negligible savings.

## Decision 11: Aggregate existing metrics and add only fixed-cardinality operations metrics

**Decision**: Reuse domain metrics and add job run/duration/backlog, provider state/latency, cache outcome, backup/restore state/duration, maintenance transition, incident, setting, and flag-change metrics. Labels are selected from fixed job, owner, provider, operation, outcome, status, and severity values.

**Rationale**: The existing metric sink already rejects unknown label keys and unsafe values. Extending it is smaller and preserves one cardinality control.

**Alternatives considered**:

- User/run/request IDs as labels: rejected for cardinality and privacy.
- New telemetry stack: rejected because OpenTelemetry is already installed and deployed.

## Decision 12: Fixed provider probes with configuration-aware unknown states

**Decision**: A closed provider registry supports database, Storage, identity, AI, email, and push. Database and Storage use existing internal connectivity. Optional external providers are probed only through existing configured clients and fixed operations; an unconfigured provider is omitted or `unknown`, never treated as down. Stripe is impossible to register.

**Rationale**: This meets visibility needs without accepting URLs or raw responses and avoids false incidents for disabled capabilities.

**Alternatives considered**:

- Generic URL health checks: rejected as SSRF.
- Treating missing configuration as failure: rejected because optional capabilities are valid in Free-only deployments.

## Decision 13: Recovery evidence is metadata plus locally executable proof

**Decision**: Store redacted evidence references, scope, status, observed time, RPO/RTO measurements, and safe codes in job results/settings; keep backup contents outside the application. Extend local backup/restore tests to cover Phase 13 records, RLS/application checks, corruption rejection, replay, reconciliation, and N-1 compatibility.

**Rationale**: Supabase backups cover the database, while Storage objects require separate coverage. Hosted PITR and encrypted-backup facts must come from provider evidence and cannot be fabricated locally.

**Alternatives considered**:

- Download/restore through Admin: rejected explicitly and unsafe.
- Mark hosted evidence green from documentation: rejected as fake evidence.

## Decision 14: Plan for PostgreSQL 17 and current Supabase changes

**Decision**: Keep the repository's pinned PostgreSQL major version 17, avoid extension-version pins, avoid direct `cron.job` writes, keep private tables out of the Data API, and use explicit grants/RLS/pgTAP tests.

**Rationale**: The current project already sets `major_version = 17`. Recent Supabase changes make PG17 the self-hosted default, deprecate extension version pinning, and tighten Data API exposure and OpenAPI access. None requires a new Phase 13 dependency.

**Alternatives considered**:

- Downgrade to PG15: rejected because it diverges from the current repository and hosted default.
- Depend on anonymous Data API OpenAPI: rejected because it is being removed and the project validates NestJS OpenAPI directly.

## Decision 15: Preserve existing clients and replace only applicable data seams

**Decision**: Keep approved layouts. Update Admin validation schemas and repositories to the new Free-only live contracts, leaving MSW fixtures test-only. Add a separate Mobile platform-operations contract/service rather than editing the protected assistant/subscription contract.

**Rationale**: This delivers live operations while preserving user-owned work and preventing mock subscription state from entering production.

**Alternatives considered**:

- Redesign pages: rejected as out of scope.
- Modify the active assistant/subscription contract: rejected because it is user-owned and protected.

## Source Review

- Supabase Row Level Security guidance: grants and policies must both be set and tested; views need explicit care; use database tests for allow/deny behavior.
- Supabase Query Optimization guidance: use measured query plans and indexes for real filter/order paths.
- Supabase Backups guidance: database backups do not include Storage objects; PITR availability is plan-dependent and must be evidenced separately.
- Supabase Cron guidance: Cron uses pg_cron; current guidance recommends no more than eight concurrent jobs and jobs under ten minutes.
- Supabase 2026 changelog: PostgreSQL 17 is the self-hosted default, extension version pins are deprecated, new public-table Data API exposure is becoming opt-in, and direct writes to `cron.job` are unsupported.

These sources informed the plan. The implementation remains grounded in the repository's checked-in versions and existing patterns.
