<!--
Sync Impact Report
- Version change: 1.1.0 -> 2.0.0
- Modified principles:
  - I. One Backend Spec, One Branch, One Owner -> Main-First Backend Delivery,
    One Spec Owner.
  - II. Spec Kit Artifacts Before Implementation: replaces the dedicated-branch
    prerequisite with a synchronized main baseline.
  - VIII. Evidence-Based Completion and Operational Safety: replaces Draft PR
    and merge gates with push-to-main remote evidence and fix-forward handling.
- Modified sections:
  - Backend Architecture and Change Safety: forbids Backend feature worktrees,
    force-push, and destructive history rewrites under the main-first workflow.
  - Spec Workflow and Quality Gates: makes main the only Backend working branch.
  - Governance: replaces PR/merge gates with local pre-push, pushed-main remote
    evidence, and final completion gates.
- Added sections: none
- Removed sections: none
- Dependent artifacts:
  - Updated: apps/api/.specify/templates/spec-template.md
  - Updated: apps/api/.specify/templates/tasks-template.md
  - Updated: apps/api/.specify/templates/plan-template.md
  - Updated: apps/api/specs/002-auth-profiles-preferences-sessions/spec.md
  - Updated: apps/api/specs/002-auth-profiles-preferences-sessions/plan.md
  - Updated: apps/api/specs/002-auth-profiles-preferences-sessions/tasks.md
  - Updated: apps/api/specs/002-auth-profiles-preferences-sessions/quickstart.md
  - Updated: apps/api/specs/002-auth-profiles-preferences-sessions/research.md
  - Updated: docs/Back end/BACKEND_MASTER_PLAN.md
- Follow-up: integrate the pending SPEC-BE-002 artifacts into `main`, then resume
  implementation with the updated main-first task ledger.
-->

# Masarifi Backend Development Constitution

## Core Principles

### I. Main-First Backend Delivery, One Spec Owner

Every Backend Spec MUST be specified, planned, implemented, verified, committed,
and pushed directly on `main`. Backend feature branches and linked Backend
worktrees MUST NOT be created or used. Before starting or resuming Backend work,
the existing checkout MUST be on `main`, synchronized safely with `origin/main`,
and checked for unrelated user changes that must be preserved.

Only one Backend Spec may have active implementation changes at a time. Its
artifacts, commits, verification evidence, and owned paths MUST identify the Spec
explicitly so scope, rollback, and delivery remain attributable without a feature
branch.

Every table, view, API, RPC, function, trigger, queue, job, event, cache, and
business rule MUST have exactly one owning Spec as defined by
`docs/Back end/BACKEND_MASTER_PLAN.md`. A Spec MAY consume another Spec's public
contract but MUST NOT duplicate, move, or mutate the other Spec's owned resource.
Ownership changes require an approved Master Plan and Constitution compliance
review before implementation.

Rationale: a linear main-first workflow removes integration overhead while Spec
ownership, bounded diffs, commits, and evidence retain accountability.

### II. Spec Kit Artifacts Before Implementation

No Backend Spec implementation may begin until the checkout is synchronized on
`main` and its Spec Kit package exists under `apps/api/specs/<number-name>/`.

Every Spec MUST complete this sequence:

1. Create or review `spec.md` against the current code, client contracts, this
   Constitution, and the Master Plan.
2. Resolve material ambiguity and record explicit scope, exclusions,
   dependencies, acceptance criteria, and Definition of Done.
3. Create or review `plan.md`, including the Constitution Check, architecture,
   database ownership, security, performance, migration, observability, and
   rollback decisions.
4. Create or review dependency-ordered `tasks.md` with exact paths, owned scope,
   required tests, and traceability to requirements and acceptance criteria.
5. Run cross-artifact analysis before implementation and resolve every
   Constitution conflict and production-critical gap.
6. Implement only the active Spec's owned scope.
7. Run every required verification command and satisfy the Spec's complete
   Definition of Done before requesting completion review.

`spec.md`, `plan.md`, and `tasks.md` are mandatory. Research, data models,
contracts, quickstarts, checklists, and runbooks MUST also be created when the
active Spec or Master Plan requires them. Missing artifacts, unresolved critical
questions, or a failed Constitution Check block implementation.

Rationale: code is the result of an approved specification, plan, and executable
task graph; it is not a substitute for them.

### III. Master Architecture and Contract Authority

Every Backend Spec MUST comply with all global rules in
`docs/Back end/BACKEND_MASTER_PLAN.md`, including:

- the NestJS modular-monolith API and separate API/worker process model;
- Supabase/PostgreSQL schemas, SQL migrations, RLS, functions, Storage, Queue,
  Cron, outbox, and financial source-of-truth conventions;
- `/api/v1` and `/api/v1/admin` contracts, DTO allowlists, error envelopes,
  pagination, idempotency, versions, and OpenAPI drift checks;
- Clerk identity and server-side authorization boundaries;
- OWASP ASVS, API Security, Top 10, and applicable MASVS requirements;
- Docker, runtime secret injection, non-root images, health checks, graceful
  shutdown, immutable releases, SBOM, and vulnerability scanning;
- index/query-plan requirements, P95/P99 budgets, caching rules, Mobile
  aggregate endpoints, delta sync, Admin server-side queries, and Redis gating;
- structured observability, alerts, reconciliation, migrations, rollback,
  backup, restore, RPO/RTO, disaster recovery, testing, and release gates.

The current repository code and executable Mobile/Admin contracts are the factual
authority when older descriptive documentation is stale. This Constitution is
the governance authority. The Master Plan is the backend architecture and
ownership authority. An active Spec's artifacts govern only its assigned scope.

When these sources conflict, implementation MUST stop. The stale artifact MUST
be corrected and reviewed before code continues. Existing code does not silently
waive a Constitution, security, financial, or ownership rule.

Rationale: implementation must follow one coherent architecture while remaining
grounded in the behavior that the current clients actually expose.

### IV. Database Change and Ownership Discipline

Ordered, immutable, checksum-verifiable SQL migrations are the only database
schema source of truth. Production schema changes made manually through the
Supabase Dashboard or another unmanaged path are forbidden. Dashboard inspection
MAY be used for diagnosis, but every durable schema, policy, grant, function,
trigger, index, view, seed, or data correction MUST be represented by reviewed
SQL migration or an explicitly documented operational procedure owned by a Spec.

No Spec may create an undocumented database object. Before adding or changing an
object, the active Spec MUST prove that it owns the object in the Master Plan and
that the final design covers columns, types, nullability, defaults, PK/FK,
constraints, indexes, RLS, grants, lifecycle, migration order, backfill,
reconciliation, and rollback.

All user-owned tables MUST enable and force RLS. Default grants MUST be revoked
before minimum explicit grants are added. Security-definer functions MUST use a
fixed `search_path`, minimum privileges, bounded input, explicit ownership and
authorization checks, and auditable effects. Positive and negative pgTAP/RLS
tests are mandatory for owner, non-owner, Admin, worker, and anonymous access as
applicable.

Migrations MUST use expand-migrate-contract for breaking changes, preserve N-1
application compatibility, use bounded resumable backfills, and prefer forward
corrective migrations over destructive reversal. A destructive migration
requires dependency inventory, backup, tested restore, explicit approval, and
post-change reconciliation.

Rationale: unmanaged database state makes financial correctness, security,
deployment, and disaster recovery impossible to prove.

### V. Financial Integrity Is Non-Negotiable

`transaction_postings` is the historical financial source of truth.
`account_balances` is only a transactionally maintained read projection. Opening
balances, transfers, fees, refunds, reversals, deletes, restores, imports,
planning links, and AI-assisted actions MUST ultimately use the ledger commands
owned by SPEC-BE-005.

Mobile, Admin, AI, import workers, provider handlers, and generic database clients
MUST NOT directly write financial source tables. Every financial mutation MUST:

- validate the authenticated user, active profile, ownership, currency, amount,
  category, account status, and operation-specific invariants server-side;
- require an idempotency key and reject key reuse with a different request hash;
- use `expectedVersion` or an equivalent explicit version check for updates;
- lock affected rows/accounts in deterministic order;
- commit transaction headers, immutable postings, projections, revisions, audit,
  and outbox events atomically in one database transaction;
- fail without partial effects and return deterministic safe errors;
- remain reconstructable, reversible by compensating records where allowed, and
  covered by reconciliation and concurrency tests.

Last Write Wins is forbidden for financial conflicts. A financial conflict MUST
be rejected, use the server state, or enter explicit user review with a new
validated command. Floating-point money storage or arithmetic is forbidden;
money uses integer minor units plus a validated currency.

Rationale: convenience, offline behavior, retries, or AI assistance can never
weaken the correctness and auditability of customer money.

### VI. Deny-by-Default Security and Secret Isolation

Authorization is deny by default and enforced server-side for every object,
property, function, and action. Client visibility, disabled controls, Clerk
metadata, role headers, feature flags, support tooling, or mock behavior MUST NOT
grant backend authority. RLS and exact API permission checks are independent,
mandatory layers.

Each Spec MUST implement and test the applicable controls from OWASP ASVS 5.0.0
Level 2, applicable Level 3 financial/Admin/privacy controls, OWASP API Security
Top 10:2023, OWASP Top 10:2025, and MASVS 2.1.0 client-integration requirements.
Threat-boundary validation MUST cover authentication, authorization, mass
assignment, injection, SSRF, CORS/CSRF, rate limits, unsafe files, webhook
signatures/replay, errors, logging, dependencies, containers, and provider
failures where applicable.

Service-role keys, database credentials, Clerk secrets, OpenRouter keys, Stripe
secrets, SMTP credentials, signing secrets, and other provider secrets MUST exist
only in approved backend runtime secret storage. They MUST NOT appear in Mobile,
Admin, browser bundles, public environment variables, Docker images, Compose
files, source control, migrations, fixtures, screenshots, test output, or logs.

Feature flags and configuration MUST NOT disable or bypass authentication,
authorization, RLS, audit, idempotency, financial integrity, validation,
encryption, webhook verification, security tests, or release gates. Missing or
invalid security configuration fails closed.

An exploitable Critical or High finding, cross-user access, missing RLS negative
test, unauthorized Admin action, accepted unsigned/replayed webhook, secret leak,
unsafe production mock/debug mode, financial integrity failure, or unverified
backup/reconciliation gate remains release-blocking. It cannot be marked complete
through risk language in a task checkbox.

Rationale: the backend is the trust boundary for financial and private data.

### VII. OpenRouter AI Is Advisory Only

OpenRouter is the only approved AI gateway. Mobile and Admin MUST call the
backend AI service and MUST NOT call OpenRouter or any model/provider directly.
The OpenRouter key and provider routing controls remain backend-only.

AI input and output are untrusted. Models/providers MUST be selected from
versioned approved configuration with explicit fallback allowlists, equivalent
privacy and ZDR requirements, structured-output support, token/cost limits,
quotas, evaluation evidence, and outage isolation. Sensitive prompts and
responses MUST NOT be logged. Minimum-necessary data, redaction, no-training
policy, and provider retention review are mandatory.

AI MUST NOT directly create, update, transfer, reverse, refund, delete, or execute
any financial record or privileged operation. An AI financial action MUST follow:

```text
draft -> deterministic validation -> explicit user confirmation ->
authorization and version recheck -> owned domain command -> audited execution
```

Prompt injection MUST NOT gain SQL, RLS bypass, internal API, secret, service
role, provider credential, or privileged tool access. Invalid or incomplete
structured output fails safely. OpenRouter or provider outage MUST NOT degrade
deterministic accounts, transactions, balances, transfers, budgets, billing, or
other core financial operations.

Rationale: AI may assist customer decisions, but it is never a financial or
authorization principal.

### VIII. Evidence-Based Completion and Operational Safety

A Spec is not complete because code, migrations, or endpoints exist. It is
complete only when every required artifact and acceptance gate has current,
reviewable evidence.

A push to `main` is an evidence-collection state, not completion. It MAY occur
only after all locally executable pre-push gates pass and no known local
Critical/High finding remains. Pushing MUST NOT mark the Spec complete, waive a
blocker, or authorize production release.

Completion requires all applicable items to pass:

- implementation of the active Spec's complete owned scope;
- immutable SQL migrations, constraints, grants, RLS, seeds/backfills, and
  migration-order tests;
- unit, contract, integration, E2E, pgTAP, security, concurrency, performance,
  load/stress, provider-failure, recovery, and client-parity tests required by
  the Spec's risk and Definition of Done;
- OpenAPI/request/response/RPC/event/job contract parity;
- query plans, indexes, P95/P99 and payload budgets, cache behavior, and no
  unbounded/N+1 query evidence;
- structured metrics, logs, alerts, dashboards, correlation, and runbooks;
- ledger/provider/storage reconciliation where applicable;
- migration failure handling, N-1 compatibility, rollback rehearsal, backup and
  restore evidence, and RPO/RTO/DR evidence where applicable;
- OWASP traceability and closure of every release-blocking security gate;
- all acceptance criteria and the active Spec's Definition of Done.

Verification claims MUST name the exact command or procedure executed and reflect
its fresh result. A skipped, failed, partial, stale, or inferred result MUST NOT be
reported as passing. Performance decisions use P95/P99 and production-like data,
not averages alone. Redis, materialized views, distributed locks, or new
infrastructure MUST NOT be introduced without measured evidence and approved
ownership, failure, security, observability, and rollback plans.

Rationale: operational evidence is part of the product, especially for finance,
security, and recovery.

## Backend Architecture and Change Safety

Backend work is owned by `apps/api`, the root `supabase` migration/test areas,
the root `docker` backend areas, and backend documentation explicitly assigned by
the active Spec. Mobile and Admin MUST NOT be modified unless the active Spec
explicitly owns that cutover work. Under the Master Plan, client production
cutover belongs to SPEC-BE-014; earlier Specs may define and test contracts
without silently replacing client adapters.

The implementation baseline is a NestJS modular monolith with separate API and
worker entry points, Supabase PostgreSQL as the durable financial source of
truth, private Supabase Storage, Postgres outbox/Queue/Cron primitives, Clerk for
identity, OpenRouter for AI, Stripe for billing, and runtime SMTP for report
email. Redis, Prisma, microservices, Supabase Edge Functions, or another schema
system are forbidden unless an approved Master Plan amendment and measured need
authorize them.

Every change MUST preserve unrelated existing work, including uncommitted and
untracked user work. Destructive Git or filesystem operations such as
`git reset --hard`, `git clean`, forced checkout, broad deletion, or force-push
are forbidden unless the user explicitly authorizes the exact destructive action
after the affected paths and commits are identified. A Spec MUST work with
concurrent relevant changes and leave unrelated files untouched.

Backend work MUST remain in the existing checkout on `main`; new Backend
worktrees are forbidden. Force-push and history rewrites are forbidden. A failed
remote gate MUST be corrected by a new forward-fix commit on `main`.

Caching MUST have an owner, key, user/permission scope, TTL, invalidation rule,
staleness tolerance, fallback, metrics, and security analysis. User financial
cache entries MUST never cross users. PostgreSQL remains durable truth; a cache
failure cannot grant access or alter money.

Production changes MUST use immutable versioned images, runtime secrets,
non-root containers, explicit health/readiness/liveness, graceful termination,
one-off migration jobs, vulnerability scanning, and safe rollback. Observability
and alerting MUST exist before production traffic, not after an incident.

## Spec Workflow and Quality Gates

Before work begins, the active Spec MUST record its exact number, `main` base
revision, dependencies, owned resources, excluded resources, client contract
inventory, and required evidence. The checkout MUST be on `main`, synchronized
with the latest verified `origin/main`, and contain no active implementation diff
for another Backend Spec.

Every `plan.md` Constitution Check MUST confirm:

- the checkout is on synchronized `main` and the active diff belongs to exactly
  one Backend Spec;
- `spec.md`, `plan.md`, and `tasks.md` are complete and mutually consistent;
- every proposed resource is documented and owned by the active Spec;
- current repository and Mobile/Admin contracts were reviewed;
- global Master Plan architecture, API, database, Docker, performance,
  observability, migration, backup/recovery, rollback, and testing rules are
  represented by executable tasks;
- financial mutation paths, idempotency, version checks, atomicity, audit,
  outbox, and conflict policy are explicit where applicable;
- deny-by-default authorization, RLS, secrets, OWASP traceability, abuse limits,
  and release-blocking tests are explicit;
- AI work uses OpenRouter and cannot directly mutate finance;
- client changes are absent unless the active Spec owns the cutover; and
- verification, reconciliation, rollback, recovery, and acceptance evidence have
  named commands, environments, thresholds, and owners.

A failed Constitution Check blocks planning or implementation. A deviation cannot
be hidden in Complexity Tracking; it requires explicit user approval and a prior
Constitution or Master Plan amendment when it changes a non-negotiable rule.

After all locally executable pre-push acceptance gates pass, the Spec MUST be
committed with a clear Spec-identifying message and pushed directly to `main` at:

```text
https://github.com/abdullah-zordok/MASREFY_Final
```

The push starts remote-only CI, image scanning, SBOM, signature, and provenance
gates; it does not mark the Spec complete. The Spec remains incomplete until every
required local and remote acceptance criterion, release-blocking security gate,
and Definition of Done item has passing evidence. Remote failures MUST be fixed
forward on `main` and materially changed work MUST receive fresh verification.

## Governance

This Constitution governs all Masarifi Backend Specs and supersedes conflicting
backend working conventions, generated templates, plans, and tasks. It does not
govern Admin-only or Mobile-only implementation outside an explicitly owned
Backend cutover.

Compliance is reviewed at six gates: specification approval, plan approval, task
approval, local pre-push verification, pushed-main remote evidence, and final
completion. Reviewers MUST cite concrete files, owned resources, acceptance
criteria, and executed evidence. Any Constitution violation is critical and
blocks implementation, push, or completion.

Amendments require explicit approval, written rationale, an updated Sync Impact
Report, review against the full Backend Master Plan and current contracts,
propagation to dependent Backend Spec Kit templates, and semantic versioning:

- MAJOR for removed/redefined principles or backward-incompatible governance;
- MINOR for a new principle or materially expanded mandatory guidance;
- PATCH for clarifications that do not change obligations.

The original ratification date is immutable. `Last Amended` changes only when
the Constitution content changes. Master Plan ownership or architecture changes
MUST update the Master Plan before affected Spec artifacts or code proceed.

**Version**: 2.0.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-28
