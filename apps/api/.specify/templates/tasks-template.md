---
description: "Task list template for Masarifi Backend Specs"
---

# Tasks: [FEATURE NAME]

**Input**: `apps/api/specs/[###-feature-name]/spec.md`, `plan.md`, and Phase 1 design artifacts  
**Scope**: Active Backend Spec ownership only  
**Tests**: Required before implementation completion

Every task MUST use:

```text
- [ ] T001 [P?] [US?] Imperative description with exact file path and an independent verification command or observable result
```

- `[P]` is allowed only when the task uses different files and has no incomplete dependency.
- `[US1]` labels are required only in user-story phases.
- Tests precede the behavior they verify where practical.
- No task may create a resource outside the active Spec ownership register.

## Phase 1: Baseline And Contract Review

[Small review and setup tasks that confirm synchronized `main`, ownership, current repository state, and required commands.]

---

## Phase 2: Blocking Foundations

[Shared package, configuration, test harness, and infrastructure prerequisites used by all user stories.]

**Gate**: Foundational checks pass before story implementation begins.

---

## Phase 3: User Story 1 - [Title] ([Priority])

**Goal**: [Outcome]

**Independent test**: [Command and observable result]

### Tests

[Small test-first tasks with exact paths.]

### Implementation

[Small implementation tasks with exact paths.]

**Checkpoint**: [Independent story completion rule.]

---

[Repeat one phase for every remaining user story in priority order.]

## Final Phase: Hardening And Acceptance

[Cross-cutting security, performance, observability, migration/recovery, ownership, and release evidence tasks.]

## Dependencies

[Phase and story dependency graph.]

## Parallel Execution Examples

[Safe parallel groups, with prerequisite and non-overlapping paths.]

## Implementation Strategy

[MVP-first and incremental delivery guidance.]

## Completion Rule

Do not mark a task complete or claim a verification result unless the named
command/procedure was executed successfully and its evidence was retained.

After all local pre-push gates pass, include separate ordered tasks to commit and
push directly to `main`, collect CI/image/SBOM/signature/provenance evidence,
fix failures forward on `main`, and complete the Definition of Done only after
all local and remote gates pass.
