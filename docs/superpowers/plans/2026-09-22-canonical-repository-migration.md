# Canonical Repository Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the complete approved local Masarifi project to `masarifiratibi-spec/masarifi.ratibi_app` on `main`, preserving both repositories' history and obtaining green credential-free repository CI.

**Architecture:** Build a candidate in an isolated worktree from `codex/staging-readiness-review` (`e64f36c`), which descends from the current local `main` and includes the latest green repository-side changes. Add the current main-workspace branding files, the separately drafted staging setup guide, and only other verified approved work. Merge the existing destination `main` (whose unique commits are merge-only and whose tree matches the shared ancestor), then fast-forward push without touching the old remote.

**Tech Stack:** Git/GitHub CLI, npm/Node, Supabase CLI/PostgreSQL, Expo/React Native, Next.js, Docker, Gitleaks, GitHub Actions.

**Spec:** User request in this task, dated 2026-09-22.

## Global Constraints

- Current local workspace, not the old GitHub snapshot, is the source of truth.
- Preserve API, Mobile, Admin, AI, Voice, Tracking, Notifications, Reminders, database, CI, and staging-readiness work.
- Exclude only dependencies, generated outputs, caches, temporary files, real secrets, and generated install artifacts.
- Do not overwrite any source worktree, force-push, deploy, configure external providers, or mutate the old repository.
- Push the final complete tree to the new repository `main` and run its release-critical credential-free CI to green.

## Review Focus

- A tracked secret or locally unignored credential accidentally enters the candidate: Gitleaks and path inspection must reject it before push.
- The destination has unique commits: preserve them via a normal merge, with no force-push.
- A separate worktree contains in-progress changes: do not silently discard or adopt them without verifying their status and compatibility.
- Native and image artifacts are binary: compare hashes after copying the approved branding assets.
- GitHub Actions in the new repository may have different permissions or defaults: inspect each failed job and fix only migration-related causes.

---

### Task 1: Build the candidate without changing source worktrees

**Files:** Existing project files in this isolated worktree; new migration plan; `.gitignore` only if artifact exclusions are missing.

- [ ] Inventory tracked, untracked, ignored, and separate-worktree changes; verify the source SHA and destination ancestry.
- [ ] Add approved branding files, the staging setup guide, and any independently verified approved changes to this candidate.
- [ ] Keep generated dependencies/artifacts and credentials out; verify `.gitignore`, `git status`, `git diff --check`, and binary hashes.
- [ ] Inspect repository-specific workflow references and preserve historical evidence links.

Expected: candidate contains all selected source files, excludes only unsafe/generated files, and is isolated from the original worktrees.

### Task 2: Prove the candidate before publication

**Files:** No additional files unless a confirmed repository-side blocker requires a minimal fix.

- [ ] Run Gitleaks over the candidate tree/history and inspect suspicious path patterns.
- [ ] Create a clean checkout of the candidate and run the same release-critical local checks as the GitHub workflow where supported.
- [ ] Commit the complete candidate and merge the existing destination `main` normally.
- [ ] Re-run secret/path checks on the exact push commit.

Expected: no real secrets, clean checkout checks pass, and the destination tip is an ancestor of the candidate.

### Task 3: Publish and verify the canonical repository

**Files:** Only minimal workflow/configuration fixes proven necessary by the new repository CI.

- [ ] Push the candidate to `masarifiratibi-spec/masarifi.ratibi_app` `main` without force.
- [ ] Verify remote `main` SHA and repository tree match the local candidate.
- [ ] Monitor the new repository's `Backend Foundation` run; fix and push any migration-caused failure, repeating until all credential-free release-critical jobs pass.
- [ ] Report final SHA, commits, file scope, exclusions, secret scan, every job result, required future secrets/variables, and old-repository non-mutation.

Expected: new repository `main` is complete; all applicable release-critical jobs pass, while tag-gated signing may remain intentionally skipped.
