# Customer Staging Recovery Implementation Plan

> **For agentic workers:** Execute this plan using superpowers:executing-plans for coordination and superpowers:dispatching-parallel-agents for independent Home, account onboarding and Voice investigations. Continue the existing checkout and branch.

**Goal:** Recover normal customer behavior on isolated Staging, prepare persistent authenticated Voice Auto-Save, and provide evidence without crossing live deployment or financial approval boundaries.

**Architecture:** Reuse the existing authoritative financial executor, ledger, batch occurrence identities, authenticated operating epochs and grouped Home components. Repair missing seams through narrowly scoped code changes, atomic server provisioning and existing notification/provider interfaces. Keep source implementation, disposable verification, deployment and physical acceptance separately graded.

**Tech Stack:** TypeScript, NestJS, React Native/Expo, PostgreSQL/Supabase, Jest, GitHub Actions, Python operator controls and Android ADB.

**Spec:** User attachments ea07b464-ce02-417b-990e-ecc6aa9735b7 (overnight mission), 721bb5f3-e304-40fb-88b0-114e3ec740b6 (Home and multi-event Voice), and 5e1103a5-b8c1-49e7-8df0-f7adc7f7f78f (persistent customer Staging), each `C:/Users/DELL/.codex/attachments/<id>/Pasted text.txt`.

## Global Constraints

- Worktree `D:/Masarifi-integration-2026-10-10`; branch `codex/voice-auto-save-restoration-2026-10-11`; initial verified clean HEAD `ed4aac197b03ed50a347789de20e3438dd7ae00c`.
- Preserve all original branches, dirty Voice worktree, backups, ignored evidence, newer Tracking, security, ledger and Savings functionality. No reset, clean, deletion, force-push, main update, Production change or unnecessary checkout.
- Preserve approved grouped expense/income cards, outside headings/View All, contained divided rows, RTL/LTR and accessibility. No Home redesign.
- Only Redmi `f66a40694eca`; no app-data clearing or APK install without approval.
- One-event 10 SAR canary completed: one committed transaction and posting; Test −50 to −60 SAR; current global financial counts 31/31; posting OFF. Its approval is consumed. No historical replay or new live financial effect.
- Persistent live posting, migration/service rollout, wider financial tests and provider spending beyond approved routes/budgets require exact separate approval.
- Unknown account currency requires explicit onboarding selection. No guessed currency, fake opening transaction or ledger initialization effect.
- Keep SMS/Notification automatic financial posting separate and unchanged.

## Review Focus

- Concurrent first login and normal account creation must not produce duplicate Cash accounts or replace an existing preference.
- Explicit invalid/ambiguous account names must never fall back to a different account; compatibility includes currency and active owner status.
- A repeated amount can represent distinct occurrences; delivery retry must preserve per-occurrence identities without another ledger effect.
- Committed receipts remain truthful through failed finance refresh and notification delivery; neither failure may resubmit financial commands.
- Large Today lists, local midnight and large text must preserve all eligible rows and the exact grouped layout.

## Task 1: Preservation, source identity and integration map

Files: this plan; `docs/evidence/2026-10-11-customer-staging-recovery/` reports; external protected evidence under `E:/Masarifi-redmi-acceptance-2026-10-10/regression/`.

- [x] Verify branch, HEAD, clean state and existing worktrees; read all requirements and prior actual acceptance report.
- [x] Verify preservation archives and create a recoverable candidate Git bundle before commits; keep original worktrees unchanged.
- [x] Inspect accessible task history and all requested branch ancestry; record exact ahead/behind and active-session constraints.
- [x] Record a non-destructive consolidation packet, without moving any checked-out branch or merging main.

## Task 2: Default Cash provisioning and account onboarding

Files: existing `apps/api/src/identity/` and finance account repository/controller seams as determined by source trace; additive migration after `20261010221534`; real DB and account/onboarding tests; existing mobile profile/currency onboarding interfaces.

Interface: authenticated currency selection/profile configuration → idempotent owner-scoped default-account result, or explicit currency/account-selection requirement. Reuse existing Account contracts; no parallel balance model.

- [x] Trace authoritative account creation/profile sync and unknown-currency behavior.
- [x] Write and run failing no-account/concurrent-login/normal-create race/ownership/unknown-currency tests.
- [x] Implement atomic, concurrency-safe Cash provision and safe sole-account default selection; preserve multiple-account preferences.
- [x] Verify zero opening balance with no transaction/posting effect, retries/reinstall/multiple-device idempotency and Manual/Voice compatibility.
- [x] Run scoped checks, review migration privileges/search path and record a small commit.

## Task 3: Multi-event Voice and account resolution

Files: `apps/api/src/ai/voice-batch.ts`, existing AI worker/context and authoritative Voice SQL, their unit/disposable integration/security tests. No mobile Home or provisioning edits in this task.

Interface: bounded ordered provider events → independently resolved validated events → existing event receipts and financial executor.

- [x] Compare original batch implementation, prompt/schema, occurrence identities and current operating worker; record current partial-acceptance policy.
- [x] Test two expenses, three mixed events, Arabic/English explicit accounts, compatible default/sole-account fallback, invalid explicit references, duplicate delivery, repeated distinct amounts, currency mismatch and invalid partial events.
- [x] Repair only reproducible missing behavior; keep canary one-effect validator unchanged.
- [x] Exercise real disposable ledger/balance and receipt recovery, concurrent claims/interruption/retry, supported transfer accounting or explicit safe unsupported status.
- [x] Record separate extraction/posting/transfer/physical statuses and commit verified parser/account changes. Additive negotiated per-event reads are undergoing final consistent-snapshot review before their own commit.

## Task 4: Home completeness and approved presentation

Files: `apps/mobile/src/features/home/`, `apps/mobile/src/services/home-today-activity.ts`, existing TransactionCard presentation and focused tests.

Interface: paginated authoritative committed Today effects → account/date-scoped expense/income groups in unchanged approved containers.

- [x] Compare preserved original grouped wrappers and current screenshots/reference availability; report exact storage/API/page/render limits.
- [x] Test more than 100 eligible records, timezone midnight, account scope, large text, RTL/LTR, category/account/sign fidelity and committed receipt refresh behavior.
- [x] Recover any real omission and introduce efficient complete access for large lists without nested-scroll virtualization defects or design changes.
- [x] Retain existing 50 SAR Manual evidence: on 11 October it is Yesterday and must not be mislabeled Today.
- [x] Run scoped rendering/visual checks and record source-versus-installed-APK acceptance separately; commit. New native large-list visual acceptance is pending installation approval.

## Task 5: Assistant, Voice confirmations and refresh recovery

Files: `apps/mobile/src/features/voice/useVoiceBatches.ts` and tests; existing notification emitter/storage contracts; Assistant routes/live adapter/API admission/provider-worker tests as indicated by diagnosis.

Interface: authoritative newly committed batch receipt → existing owner-scoped notification path, exactly once and without raw recording content; provider-enabled authenticated Assistant → bounded existing routes and persisted responses.

- [x] Locate the exact Assistant unavailable condition in current APK/source/API/routes; reproduce the actual boundary, not hide its message.
- [x] Test committed multi-event confirmation, duplicate receipts/remount, failed delivery, owner switch, analysis-only/failed events and finance-read retry without financial resubmission.
- [x] Reuse the existing central Voice notification path; preserve privacy/permissions and honest failure status.
- [x] Verify Arabic/English Assistant, timeout/recovery, usage limits and masked results with inert tests; inspect authenticated admission/consent and effective routes read-only. Current user consent is false; no unapproved provider request or consent change was made.
- [x] Audit unpublished outbox and historical backlog read-only; prepare narrowly owned delivery recovery instead of starting the broad scheduler or draining history.
- [x] Commit verified Assistant/confirmation fixes with actual provider/native acceptance gaps recorded. Final per-event UI commit follows snapshot correction.

## Task 6: Persistent authenticated Staging operation preparation

Files: existing `scripts/staging-voice/operating-host.py`, operating control/manifest/health tests and a current-cohort adapter where necessary; deployment packet and rollback report.

Interface: version-1 operating manifest (no owner/device/amount allowlist) → dedicated pinned financial worker, compatible API admission, continuous health/queue monitoring and explicit incident close/rollback.

- [x] Implement binding of the current six-file API cohort, new owned worker identity, tested image/migration and independent financial kill switch. Preserve old containers and controls. Real final packet cannot be completed before image/APK/CI and postmigration backup qualification.
- [x] Test OFF rehearsal, healthy startup/heartbeat, incident suspension, restart/retry, connection/provider limits and fail-closed restoration in offline environments. Actual Linux/systemd/Docker rehearsal remains pending approval.
- [ ] Prepare exact activation, impact, baseline/backups, rollback, monitoring and fresh-only acceptance limits. Never execute with the consumed Redmi approval.
- [ ] Prepare separately bounded new-customer/multi-user/multi-event Staging financial acceptance, with explicit pending physical speech and install approvals.

## Task 7: Exact-commit release verification and final report

Files: existing CI workflows/scripts; `docs/evidence/2026-10-11-customer-staging-recovery/` final report and consolidation packet.

- [ ] Review all diffs and financial/security interfaces; fix real failures with RED→GREEN tests.
- [ ] Run full mobile/API/admin, fresh and upgrade DB/security/ledger/worker/provider, browser, Android, container/vulnerability, dependency and performance/stress gates on the final exact commit.
- [ ] Build the standalone Staging APK if mobile bundle changes, preserve package/signing identity, and do not install without approval.
- [ ] Push completed commits to this authorized branch; exact CI evidence must match final SHA, with skipped/pending gates explicit.
- [ ] Verify Redmi and Staging non-destructively; report source, deployed and physical acceptance separately.
- [ ] Produce final feature matrix, financial baseline, worker versions, exact blockers/approval packet and verdict READY / READY WITH CONDITIONS / NOT READY.

## Execution Ledger

- 2026-10-11: Previous approved single-event task fully executed and restored; evidence in `Redmi-Voice-Auto-Save-Actual-Acceptance-ed4aac19.md`. No current source work lost.
- 2026-10-11 03:18 Riyadh: User requested status-only pause. Parallel work interrupted; read-only live query confirmed posting=false, zero active epochs, one committed canary, global31/31, Test−6000. No edits/deployment/financial writes during status answer.
- 2026-10-11: User renewed overnight mission with persistent customer behavior requirement. Parallel Home/Cash/Voice work resumed. Ruling: do not request ordinary plan approval; explicit user instruction requires autonomous execution within existing consequential-action boundaries.
- 2026-10-11: Verified original Voice archive and all-ref preservation; retained 630 source dispositions and 11,410 ignored-evidence entries. Recorded all 47 selected recovery paths and the nine evolved implementations. The old development-only automatic-client flag is superseded by the standalone Staging profile, not permission to activate server posting.
- 2026-10-11: Assistant standalone route, complete grouped Home windowing, fresh owner-scoped confirmations and multi-account/ordered parsing committed independently. Cash review fixes passed 30 real PG/API and 73 mobile tests plus both typechecks. Persistent host adapter passed 46 normal/optimized tests; no live activation.
- 2026-10-11 08:53 Riyadh: Read-only live baseline remains posting OFF, zero active epochs, 31 transactions/postings, Test −60 SAR. Protected schema105 backup restored in isolated PG with exact financial hashes and zero ledger mismatch. Source candidate changes have not been deployed.
- 2026-10-11: Final review identified a negotiated Voice receipt/outcome snapshot race; two real concurrent regressions reproduced it before a narrow opted-in REPEATABLE READ correction. Rollout document corrected to temporary OFF API qualification followed by exact ac7bc92 restoration, preserving the adapter's common rollback pins.
