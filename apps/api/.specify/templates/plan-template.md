# Implementation Plan: [FEATURE]

**Phase / Spec**: [Phase NN / SPEC-BE-NNN]  
**Branch**: `main`
**Base Revision**: [commit]  
**Date**: [DATE]  
**Spec**: [link to `specs/[###-feature-name]/spec.md`]  
**Input**: Backend feature specification and `docs/Back end/BACKEND_MASTER_PLAN.md`

## Summary

[State the owned backend outcome and the smallest architecture that satisfies it.]

## Technical Context

**Language / Runtime**: [version]  
**Framework**: [NestJS version and HTTP adapter]  
**Primary Dependencies**: [only dependencies required by this Spec]  
**Storage**: [PostgreSQL/Supabase objects owned or consumed]  
**Testing**: [unit, contract, integration, pgTAP, security, performance]  
**Target Platform**: [container runtime and deployment target]  
**Project Type**: NestJS modular monolith with separate API and worker entry points  
**Performance Goals**: [P95/P99, query, payload, startup, or throughput budgets]  
**Constraints**: [security, financial, migration, operational, and ownership limits]  
**Scale / Scope**: [owned resources and realistic data/concurrency assumptions]

## Constitution Check

*GATE: Every item MUST pass before Phase 0 and again after Phase 1.*

- [ ] The checkout is on synchronized `main`; the active diff belongs to exactly one Backend Spec.
- [ ] `spec.md` is complete; `plan.md` and later `tasks.md` remain mutually consistent.
- [ ] Every table, view, API, RPC, function, trigger, queue, job, event, cache, and business rule is documented and owned by this Spec.
- [ ] Current repository code and relevant Mobile/Admin contracts were reviewed.
- [ ] Master Plan architecture, API, database, Docker, performance, observability, migration, backup/recovery, rollback, and testing rules are represented.
- [ ] Financial source-of-truth, idempotency, version, atomicity, audit, outbox, and conflict rules are explicit where applicable.
- [ ] Deny-by-default authorization, RLS, secret isolation, OWASP traceability, abuse controls, and release-blocking tests are explicit.
- [ ] AI work, if any, uses OpenRouter and cannot directly mutate financial data.
- [ ] Mobile/Admin changes are absent unless this Spec explicitly owns cutover work.
- [ ] Verification, reconciliation, rollback, recovery, and acceptance evidence name commands, environments, thresholds, and owners.

## Project Structure

### Feature documentation

```text
apps/api/specs/[###-feature-name]/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
`-- tasks.md
```

### Planned source and infrastructure

```text
[Exact minimum paths owned by this Spec]
```

**Structure decision**: [Explain paths reused and the minimum files to add.]

## Ownership And Boundaries

**Owned resources**: [complete list]  
**Consumed contracts**: [dependencies]  
**Explicit exclusions**: [deferred/non-owned work]  
**Client contract impact**: [mapping only or explicitly owned cutover]

## Phase 0: Research

[Link decisions and resolved unknowns in `research.md`.]

## Phase 1: Design And Contracts

[Link `data-model.md`, `contracts/`, and `quickstart.md`; summarize their purpose.]

## Implementation Strategy

[Describe dependency-ordered workstreams without creating `tasks.md`.]

## Evidence Plan

| Gate | Planned evidence | Blocking threshold |
|------|------------------|--------------------|
| Requirements and contracts | [commands/procedure] | [threshold] |
| Database and RLS | [commands/procedure] | [threshold] |
| Security | [commands/procedure] | [threshold] |
| Performance | [commands/procedure] | [threshold] |
| Containers and operations | [commands/procedure] | [threshold] |
| Rollback and recovery | [commands/procedure] | [threshold] |

## Post-Design Constitution Check

[Re-evaluate every gate after Phase 1 and record PASS/FAIL with evidence links.]

## Complexity Tracking

> Complete only for an approved Constitution deviation. An unapproved deviation blocks planning.

| Violation | Why Required | Approved By | Follow-up |
|-----------|--------------|-------------|-----------|
| None | N/A | N/A | N/A |
