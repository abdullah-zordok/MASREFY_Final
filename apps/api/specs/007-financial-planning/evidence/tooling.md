# Phase 07 Tooling Evidence

## Spec Kit Availability

The repository has `apps/api/.specify/feature.json`, Constitution memory, and
spec/plan/tasks templates. It does not contain `.specify/scripts/` at repository
root or `apps/api/.specify/scripts/`, so the documented
`check-prerequisites.ps1`, `setup-plan.ps1`, and `setup-tasks.ps1` commands are
unavailable in this checkout.

No `.specify/extensions.yml` exists, so there is no pre/post hook to dispatch.

## Applied Fallback

- Feature pointer updated to `specs/007-financial-planning`.
- Checked-in API templates and the prior Phase 06 package supplied structure.
- Paths were resolved directly under `apps/api/specs/007-financial-planning`.
- Prerequisites/checklists/tasks were validated with read-only PowerShell,
  `rg`, YAML parsing, Git state, and explicit artifact inventories.

This fallback creates no script, package, branch, or alternate workflow and does
not weaken any artifact, analysis, implementation, or evidence gate.
