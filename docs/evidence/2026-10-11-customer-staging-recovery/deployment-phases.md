# Customer Staging rollout and acceptance boundaries

This is a reviewable preparation document, not an executable activation packet or deployment approval. Continue on `codex/voice-auto-save-restoration-2026-10-11`. Production and main are outside this rollout.

## Current financial and operational state

The completed, separately approved Redmi coffee canary created exactly one confirmed 10 SAR expense and one ledger posting. Test changed from −50 to −60 SAR. The canary closed and its original API/Analysis configuration was restored. Its authorization is consumed; neither that recording nor the later analysis-only capture may be replayed.

The latest recorded live baseline has 5 accounts, 31 transactions and 31 postings, with no active financial epoch and Voice posting OFF. The API and the dedicated Analysis/Assistant services use revision `ac7bc92ab2e6e6c2e50a969de6c69463688febae`, image digest `sha256:a4f6c1ad71621b645d09880e943b5c15d27a8d8a4bd038ef4913fd3aebf3d383`. Fresh observations must replace these historical pins before execution.

API currently admits authenticated analysis while its analysis-only flag is true. Permanent financial operation requires both compatible API financial admission and an active normal operating epoch with a healthy dedicated financial worker. Merely changing one flag is insufficient. The old financial/general containers remain stopped and preserved.

The unpublished outbox has approximately 497,000 historical records. No general scheduler or bulk outbox drain is proposed. Only fresh, current-epoch committed Voice sources may enter the existing owner-isolated confirmation pipeline through the new scoped functions.

## Phase 1: qualify the exact release while posting stays OFF

Finish source review, commit preservation and exact-SHA release CI first. Pin the resulting scanned image digest and standalone Staging APK hash and existing signing certificate. A pending or skipped required job does not qualify the candidate.

Separate approval is required to apply migrations 106–109 and temporarily qualify only the API with the exact candidate image while retaining analysis-only admission and posting OFF. Preserve the existing compatible ac7bc92 Analysis and Assistant containers and the original six configuration files. The additive migrations are:

1. `20261011002702_authenticated_default_cash_account.sql`
2. `20261011004500_operating_voice_confirmations.sql`
3. `20261011004600_voice_account_availability.sql`
4. `20261011005920_voice_event_results.sql`

The execution packet must bind their normalized checksums, deployment-role permissions, current financial row hashes, verified protected backup and exact current service identities. Existing migration 105 must not be reapplied. Use a separate byte-pinned temporary API-only qualification overlay; do not overwrite the original six files. Assistant may retain its compatible pinned image after exact contract verification; do not update it merely to make the revisions visually match. Preserve all old containers and environment files.

The API change introduces negotiated currency-onboarding and per-event Voice results. Legacy clients retain their response shape. Before financial activation, install the separately approved in-place APK update on Redmi `f66a40694eca` only and verify live client/API compatibility. Preserve package `com.masarifi.mobile`, certificate `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, current account/data and draft state. Do not clear app data or install on Samsung.

Verify normal sign-in, known-default onboarding, account ownership, analysis-only event results/recovery, Home and Assistant consent/admission. Real microphone speech, new identity credentials, privacy consent and financial writes remain separately controlled. Do not claim automated provider fixtures prove real Arabic/English responses.

The same phase-1 approval must explicitly include restoration of the temporary API to the preserved ac7bc92 six-file configuration, with posting still OFF, after qualification succeeds or fails. Recheck and record its new actual Docker ID; preserve the original Analysis/Assistant identities. This gives the persistent adapter one compatible ac7bc92 rollback cohort. During the restored interval, newly negotiated onboarding/event-result features are unavailable until the separately approved operating activation replaces the API again. Do not describe that interval as customer-ready. Leaving a final-revision API/Analysis deployed alongside an older Assistant would require explicit per-service source/image pins in a changed adapter; the current adapter must refuse that mixed rollback cohort rather than weaken its checks.

## Phase 2: establish operating rollback evidence

After the approved OFF qualification and exact API restoration, capture and verify a fresh backup containing all 109 migrations and the reverified ac7bc92 current cohort. Rehearse financial restoration in an isolated local database and compare exact account/transaction/posting/balance hashes. The current protected schema-105 backup is useful preservation evidence but is not sufficient for the persistent adapter's schema-109 qualification.

Run the approved posting-OFF operating rehearsal using the exact candidate source/image, unique worker identity and guard. Prove that SQL posting remains OFF, the owned writer is stopped, original API/Analysis can be restored and before/after financial hashes are equal. Hash the actual rehearsal receipt and backup restore evidence. No placeholder receipt may be accepted.

## Phase 3: separately approve persistent authenticated Voice operation

Prepare the final `customer-operating-cohort.py` packet only after phases 1–2 produce real immutable evidence. It must bind exact source/image/APK, all migrations/contracts, client compatibility and confirmation opt-in checks, all five environment hashes and database CA, protected backup and restore receipt, the current six-file API cohort, actual OFF rehearsal and direct human approval.

The intended operating policy is indefinite normal authenticated eligibility: no per-user, device, account, amount or one-event approval filter. Normal active-profile/session authorization, consent, quotas, account currency/status/ownership checks, event identity, duplicate protection and the authoritative ledger executor remain enforced. The financial kill switch remains available and separate from SMS/Notification posting.

The exact approved apply operation will briefly stop only preserved Analysis, reconcile only API admission/source/image, create a new uniquely named dedicated financial worker with `--pull never` and Docker restart policy `no`, arm its systemd monitor before financial admission and activate only its own operating generation. Do not start the old general worker, alter unrelated routes/providers or process old recordings. Assistant and Tracking remain unchanged unless their own compatibility evidence requires an explicitly approved correction.

The monitor verifies exact API/writer identity, source/image/environment, migration/contract pins and fresh same-epoch heartbeats. An owned stopped worker can restart only under the still-active same generation, full admission checks and bounded cooldown/readiness. It cannot reopen a closed epoch. Repeated faults or pin/identity loss close the owned epoch and independently stop the exact owned writer. A foreign container is never stopped through name-only matching.

Incident closure does not implicitly replace the shared API or restart Analysis. An API/Analysis restoration requires separately bound approval and exact unchanged ownership. Recovery must fail closed if those identities have changed. Preserve failed containers and journal evidence. Never attempt destructive down-migrations over committed customer finance; close posting first and choose compatible forward repair or the verified data-restoration procedure only with separate approval.

## Phase 4: approve and verify bounded live acceptance

Persistent operation is not client acceptance by itself. Prepare independently bounded financial test permissions before any new Staging writes:

- A normal new user selects a known currency, receives one default active zero Cash account without an opening transaction, signs out/in and preserves it across retries/devices.
- Manual expense and income each produce one transaction and one authoritative effect, with correct account, balances, Home/Transactions/Reports and digit/date validation.
- A fresh single-event Voice recording automatically saves without Save/Confirm, creates one effect and refreshes Home/balances immediately. Confirm notification consent and delivery honestly.
- A fresh three-event recording, for example expenses 10 and 25 SAR plus income 100 SAR, produces three distinct occurrence identities and three correct independent effects. Expected net change is +65 SAR on a single chosen account; actual approval must bind the test owner, account, baseline and phrase. This is not covered by the consumed one-event canary.
- A separately scoped multiple-account recording resolves each explicit owned account independently. Invalid/ambiguous names, currency mismatch and unsupported transfers create no incorrect effect.
- Verify duplicate delivery, interruption/recovery, app restart and normal worker recovery without another financial effect. Do not resubmit real recordings outside the approved duplicate-test scope.
- Verify a second independent authenticated identity cannot read or change the first identity's accounts, recordings, transactions or reports.
- After the human grants the app's Assistant privacy consent, verify bounded Arabic and English messages using existing approved provider routes/budgets, quotas, persisted sessions and safe errors.

Device speech and credentials require the user. ADB should handle safe navigation and verification. Physical Android permissions and notification listener consent remain honest prerequisites; do not grant them silently. iOS build/signing and platform acceptance are separate and unverified.

## Delivery verdict

Until the required exact-source gates, approved deployment, installed candidate, persistent operation, multi-user/multi-event and physical provider/notification acceptance pass, the application is **NOT READY** for the claimed full client experience. Keep implementation, disposable financial tests, deployed behavior and physical acceptance as separate statuses. The next request for approval must describe an actual pinned phase, its impact, tested rollback and baseline—not an unverified global switch.
