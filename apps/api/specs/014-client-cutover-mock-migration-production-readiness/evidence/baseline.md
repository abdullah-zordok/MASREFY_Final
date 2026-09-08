# Phase 14 Baseline Evidence

**Observed**: 2026-09-08
**Implementation started**: No

## Git and Dependency Gate

- Initial checkout branch: `codex/spec-be-013-local-verification-fix` at `d3b46b2`; verified ancestor of `origin/main`.
- `git fetch origin --prune` completed.
- Safely switched to existing `main` without merge, cherry-pick, stash, reset, clean, or history rewrite.
- Current `main` and `origin/main`: `65bc5fd2f8875c72c9885787e5c021e4c2576d09`.
- Client remediation checklist and SPEC-BE-013 tasks contain no unchecked item.
- Remediation commits `e47eff`, `cd3bafc`, and `812935f` are contained in `origin/main`; recorded required workflow runs `33987079570`, `33994830522`, and `34018736375` succeeded.
- Phase 13 final verification revision `65bc5fd` is contained in `origin/main`; Backend Foundation run `34131309376` succeeded. Tag-only signed-release evidence was skipped and remains a separate release gate.
- Thread inventory showed no other active task modifying this checkout.

## Preserved User-Owned Work

Initial paths, still outside Phase 14 staging unless deliberately hunk-integrated:

- Modified `apps/mobile/src/services/contracts/assistant-notifications-service.ts`; initial SHA-256 `02D4E2FD1C74B55603C72D9E70EFF68CE5BDD5EA23C6AF31048EA9D022E9709A`.
- Untracked `.agents/plugins/`.
- Untracked `apps/api/pnpm-lock.yaml`; initial SHA-256 `051C0BFB9E6327E228BDBBED9A13DC647813BAC67173F3690F9AF5B1A5AA0D56`.
- Untracked `apps/api/pnpm-workspace.yaml`; initial SHA-256 `0442B6872C23F587DFFCD75F4CB1524F743F86ACF075291057B31ABEDC33A01D`.
- Untracked `apps/api/supabase/`, including `.temp/cli-latest`; initial file SHA-256 `777FD6D651101226CF5D67775D803518C5E94912772C3F936A458353B58EC9D1`.

## Required Reading and Review

- API constitution and the approved Phase 14 brief read completely.
- Backend Master Plan, Phase 14/free-only decisions, and Client Remediation Plan read against current `main`.
- Independent reviewers fully read all 137 artifacts for SPEC-BE-001–006, all 109 for SPEC-BE-007–009, and all 95 for SPEC-BE-010/011/013, including every specification, plan, task list, contract, mapping, checklist, quickstart, evidence and completion record.
- Reviewers also covered current owning controllers/services/repositories, SQL, OpenAPI composition, security/error paths, workflows, Docker, operations assets, and targeted runtime probes described in `research.md`.
- Mobile package review is complete: 83 assigned artifacts across 001-007/017 and 116 substantive text artifacts across 008-016 were fully read; the reviewer confirmed no substantive package text remains unread. Historical PNG/raw XML/device captures were excluded from semantic artifact review and remain evidence to revalidate where applicable.
- Mobile implementation-boundary review is complete across the constitution, all seven master/remediation/RTL plans, all 19 storage modules, 11 service contracts, nine live adapters, four platform adapters, three root selectors, 22 nonfixture mocks, 14 query modules, and the named auth/tracking/voice/bootstrap/config boundaries.
- Admin review is complete across all 10 spec packages and 97 recursive artifacts, the spec README, all 11 feature repositories plus report exports, all repository tests, 17 MSW handlers and both scenarios, 15 E2E files, 12 feature component/route tests, three app tests, six shell tests, 11 hooks, 12 feature contract/schema files, and the shared API/auth/session/provider/permission/config boundaries.
- Artifact test results remain historical until rerun. Open client implementation, native-device, accessibility, performance, participant, provider, hosted, signing, and store gates are carried into `tasks.md` and `evidence/external-gates.md` rather than inferred complete.

## Evidence Boundary

This baseline proves prerequisite and artifact inspection only. It does not claim current local test suites, hosted systems, providers, devices, images, signing, or stores have passed.
