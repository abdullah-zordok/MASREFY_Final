# Live Android SMS Tracking Verification — 2026-09-12

## Code implemented and verified

- Live mode now selects the authenticated tracking HTTP service; demo/test modes retain fixtures.
- Android requests only `READ_SMS`, after the existing education/consent screen. No `RECEIVE_SMS` or terminated-app receiver was added.
- The local Expo module reads at most 100 recent inbox rows on app start/resume. TypeScript filters non-financial/OTP/marketing messages, minimizes accepted records, fingerprints them, and associates only an unambiguous eligible account before persistence or submission.
- The bounded local queue persists normalized events and stable idempotency keys, retries safely after reconnect, and polls submitted sessions instead of resubmitting them.
- UI states expose queued, processing, imported, review, duplicate, account-required, and safe error results using backend-returned IDs.
- A clean Expo prebuild retained `android.permission.READ_SMS` and autolinked `com.masarifi.smsinbox.MasarifiSmsInboxModule`.
- Verification: 20 focused Jest suites / 138 tests passed; TypeScript, ESLint, client-runtime, Expo config, autolinking, and `:app:compileDebugKotlin` exited successfully. ESLint reported existing warnings but zero errors.
- The completed feature branch was fast-forward merged into local `main` at `2b4746f6f7310c30019d1258b8b0176cc8460ba8` without conflicts.
- The complete mobile suite ran 2,112 tests. A tracking demo regression found by that run was fixed and passes in isolation; the only repeatable remaining failure is outside this branch in `subscription-settings-service.test.ts`, where the current user-modified auth service returns `session_expired` instead of the test's expected `provider_unavailable`. Two load-sensitive tests that timed out or exceeded their budget in the full run passed immediately in the isolated rerun.
- The generated Android tree before clean prebuild is recoverable at `C:\Users\DELL\AppData\Local\Temp\masarifi-android-backup-20260912-165603\android`.

## Physical-device result

- Device: Samsung SM_A165F (`RK8XB00N33K`), connected through ADB.
- Debug APK build, install, development-client launch, and Metro bundle succeeded. The application process was running after launch.
- Installed package inspection confirmed `android.permission.READ_SMS` is declared. With permission revoked, the tracking screen showed its permission warning and routed the previously granted/revoked state to Android App Info. Granting SMS access there returned to the app with `READ_SMS: granted=true`; the warning cleared and the tracking screen rendered without error.
- A temporary privacy-safe on-device smoke route invoked the production native bridge and reported `available=true`, `online=true`, and a bounded result count. It displayed and logged no sender, SMS body, or other inbox content, and the temporary route was removed after verification.
- A controlled end-to-end live import is **unverified**. The checkout has no configured mobile `.env` with a valid HTTPS `EXPO_PUBLIC_API_URL` (and authenticated mobile test configuration), so the app correctly rejects live mode before submission. Demo-mode UI, native permission recovery, and native bounded inbox access were verified independently.

## Backend readiness and result

- Backend readiness is verified without backend changes: the existing authenticated tracking, import-session/item, review, duplicate, idempotency, worker, and ledger paths satisfy the mobile flow. The focused backend verification previously passed 50 tests.
- No backend controllers, services, migrations, import logic, duplicate/review decisions, idempotency logic, or ledger writes were changed.
- A live import session and terminal backend result are **unverified** because the required mobile live API/auth environment is not configured in this checkout. When configured, verification must use the returned import/review/duplicate IDs and existing ledger source; no direct database insert is permitted.

## Remaining Play Store, privacy, and consent requirements

- Submit the Google Play SMS/Call Log Permissions Declaration for the `SMS-based money management` exception and make budget tracking from SMS a prominently documented core feature. Approval is required before release: <https://support.google.com/googleplay/android-developer/answer/10208820?hl=en>.
- Keep the in-app disclosure immediately before the Android permission request, explain what SMS-derived financial data is accessed and how it is used, and retain a clear decline path and graceful manual-entry fallback: <https://support.google.com/googleplay/android-developer/answer/11150561?hl=en>.
- Update the published privacy policy and Play Data safety form to match the exact collection, transmission, retention, encryption, deletion, and sharing behavior: <https://support.google.com/googleplay/android-developer/answer/10787469>.
- Do not transmit non-financial or personal SMS history, and do not use SMS-derived data for advertising or unrelated purposes. Re-submit the declaration if permission use changes.
