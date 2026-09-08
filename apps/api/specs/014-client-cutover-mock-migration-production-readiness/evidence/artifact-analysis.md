# Phase 14 Cross-Artifact Analysis

**Analyzed**: 2026-09-08
**Artifacts**: `spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `rollback-plan.md`, `quickstart.md`, release/requirements checklists, baseline/external-gate evidence, and client-contract manifest v1
**Method**: Manual SpecKit prerequisite resolution because this checkout has templates but no `.specify/scripts` directory; requirement/task/heading/manifest scans were run directly from the active feature path in `apps/api/.specify/feature.json`.

## Findings Before Resolution

| ID | Severity | Finding | Evidence | Required resolution |
|---|---|---|---|---|
| A-001 | CRITICAL | The Mobile constitution excludes production backend/provider integration, while the plan marks the Constitution Check passed and schedules production adapters. | Mobile constitution Principle II and Product Constraints; `plan.md` Constitution Check; T003 | Amend the constitution with the approved Phase 14 rationale, update dependent templates, and rerun both Constitution Checks before implementation. |
| A-002 | HIGH | The manifest promises one stable key per active call but uses grouped rows and `mobile.appShellStorage.*`; several foundation, tracking-permission, local repository, and capability-catalog methods are absent. | `data-model.md` Client Operation Contract; manifest Wave 1 and manifest completion rules; current Mobile contracts | Expand the manifest to exact operation keys or an authoritative exact-operation appendix and cover every active method with live, local-only, demo/test-only, or explicit-unavailable disposition. |
| A-003 | HIGH | The dependency statement says prior client Specs are accepted, although full review found unchecked implementation and device gates, stale contradictory evidence, and current owner/client defects. | `spec.md` Dependencies; Mobile packages 008-016 task/evidence ledgers; `research.md` confirmed findings | Describe the baseline as historically merged/green only; make fresh Phase 14 acceptance conditional on repairing or explicitly carrying every current gap. |
| A-004 | HIGH | The plan states existing SQLite already encodes offline identity, but the current database is global, rows/query keys lack an owner partition, and sign-out can clear unsynced data. | `research.md` Decision 6; `apps/mobile/src/storage/database.ts`; `apps/mobile/src/state/app-shell.ts`; review evidence | Correct the design statement and require an owner-safe, non-destructive Mobile-owned migration/namespace with restart and sign-out preservation proof. |
| A-005 | HIGH | Current Mobile sync can overwrite or hide unresolved/local state: conflicts are not fully protected, tombstone JSON remains stale, status/sign/money mappings coerce data, and bulk persistence can overwrite pulled rows. | T041/T050/T052 partly cover this; current sync adapter/repository review | Make every identified root cause and safe-integer/reload behavior explicit in Wave 2/3 failing tests and implementation tasks. |
| A-006 | HIGH | Existing planning data can lose draft-only/payment-match state and may contain planning payments linked to nonexistent ledger transactions. | T061/T063 cover persistence only; current planning mock/repository review | Add pre-cutover identification/reconciliation of orphan planning effects and forbid acceptance until ledger links and preview versions are authoritative. |
| A-007 | HIGH | Wave rollout tasks say to execute shadow/internal/bounded/full using local fixtures, which could be recorded as production cohort evidence even when hosted identities/deployments are unavailable. | T032 and analogous per-wave tasks; `external-gates.md` | Label fixture runs local harness rehearsals and keep real deployed cohort/observation evidence open until executed. |
| A-008 | HIGH | Requirements FR-001 through FR-020 and SC-001 through SC-007 have no explicit task traceability, making complete coverage hard to verify mechanically. | Requirement scan found zero FR/SC references in `tasks.md` | Add a requirement-to-task coverage matrix and validate every requirement/success criterion has implementation and verification coverage. |
| A-009 | MEDIUM | Open historical client evidence is under-specified in the external gate ledger, including full native accessibility matrices, the 10,000-record device performance case, the 12-person bilingual usability study, and downstream-consumer/handoff checks. | Mobile 008-016 task/evidence ledgers; `external-gates.md` | Carry each exact open gate with owner and follow-up, distinguishing locally actionable unchecked work from truly external proof. |
| A-010 | MEDIUM | Artifact validation searches for its own placeholder tokens and therefore reports false positives; the baseline still says full client review is in progress after the reviews completed. | `quickstart.md` Artifact Checks; `evidence/baseline.md` Required Reading | Use targeted placeholder scans/exclusions and record final exact review coverage. |
| A-011 | HIGH | The Admin review found permissive client gating and lossy operational settings: unresolved dynamic routes are treated as allowed, query keys omit actor/session, role simulation affects live decisions, flags collapse to 0/100, and maintenance/settings fields are fabricated or dropped. | Current Admin shell, hooks, governance/settings views and repository review | Make these exact Wave 1/9 tests and corrections explicit rather than accepting repository wiring alone. |
| A-012 | HIGH | Several current rich Mobile requirements conflict with older package notes: report filters/settings and offline snapshots, category authoritative preview, voice multi-proposal/atomic effects, transaction recovery, and free-only scope. | Mobile 008-016 specs and addenda; older quickstarts/research/paid-plan requirements | Record the latest approved precedence and require owner-contract updates or explicit unavailable states before each adapter is accepted. |

## Coverage Summary

- Functional requirements: 20
- Success criteria: 7
- Planned tasks before resolution: 137, with 137 unique IDs and valid checklist syntax
- User-story tasks: 101 across the nine ordered waves
- Ambiguous clarification markers: 0
- Duplicate task IDs: 0
- Constitution conflicts: 1 critical
- Unresolved Critical/High findings before resolution: 10

## Resolution Gate

No production implementation may begin while any Critical/High finding above is open. Documentation and constitution corrections are authorized by the approved Phase 14 scope and occur before the first production-code task. After resolution, rerun placeholder, task-ID, requirement-coverage, local-link, scope, ownership, and Constitution checks and record the final status below.

## Post-Resolution Status

PASS on 2026-09-08.

- A-001 through A-012 are resolved in the amended Mobile constitution/templates/master spec, corrected Phase 14 design artifacts, exact operation manifest, expanded wave tasks, requirement coverage matrix, and external-gate ledger.
- Validation found 137 unique task IDs, complete FR-001 through FR-020 and SC-001 through SC-007 references, zero invalid task lines, zero unresolved placeholder/clarification markers, zero broken local links, and a clean `git diff --check` result.
- The manifest contract check passed all 3 tests and independently counted 214 Mobile plus 123 Admin active operations with 337 unique operation keys.
- Clean Code review found no production-code concern. Test review accepted the single artifact parser suite because it verifies the machine-readable release contract without mocks or duplicated production logic.
- Codex Security diff scan `35d4a5fa-a306-4ef5-88fc-8aa936c30e5e` completed with zero findings. Its native tracked-file inventory was supplemented with all 21 owned Phase 14 artifacts; the five pre-existing user-owned paths were explicitly excluded.
- No Critical, High, Constitution, ownership, security, or test blocker remains before T009.
