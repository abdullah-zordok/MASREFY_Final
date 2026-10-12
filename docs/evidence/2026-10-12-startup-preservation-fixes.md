# Startup preservation fixes — 12 October 2026

The approved Admission Collector observed zero local pruning, finance-queue, Tracking-queue or schema/legacy-cleanup blockers on Redmi. Source review then identified startup operations that the local counters cannot make safe.

## Legacy Voice recovery

Automatic startup called the legacy recovery GET before returning without replaying an unconfirmed operation. The SQL recovery function can expire sessions/proposals or reconcile confirmations and emit outbox events. A confirmed response could also replace the local operation with Saved and remove its audio reference. The automatic path additionally migrated old AsyncStorage pending sessions before returning.

The mobile service now reads the existing singleton directly during automatic recovery, leaving legacy AsyncStorage untouched. An unconfirmed operation returns before remote recovery or audio replay. Saved receipts, explicit cancellation, manual recovery and frozen authorized confirmations retain their prior behavior.

Regression tests first exposed unwanted GET calls and confirmed-response audio-reference clearing, then passed after the guard moved before recovery. A separate real-storage fixture exposed the AsyncStorage migration and passed after automatic recovery stopped invoking that migration. All 63 focused Voice tests passed, including manual and frozen-confirmation positive controls. These changes have not yet been installed on Redmi.

## Decoder dependency

The installed CommonJS decoder's recursive malformed-percent fallback could consume unbounded processing time through query-string and React Navigation. Upstream 0.5.0's bounded UTF-8 scanner was backported into a clearly identified private `0.2.2-masarifi.1` package, retaining the callable CommonJS export, plus-to-space handling and legacy outer replacement behavior. No framework version or UI change is required.

The checked-in source, MIT license and local tarball are matched by lockfile integrity and a regression test. Only the root decoder declaration and its installed package entry change in the lockfile. Eight inherited variable declarations were modernized for the existing lint rules without changing their behavior.

Validation: eight dependency-security tests, 82 auth/callback tests, actual React Navigation query parsing, 4,913 bounded short-input comparisons against the old decoder with zero differences, scoped lint, and a clean disposable five-package query-string install passed. The final tarball SHA256 is `3bed4f9548faf9d763d2716a858f1e928e55b37851fb493ca8ce2b3e6a066dbd`.

The entire mobile dependency graph still requires the exact-source CI clean install. The interrupted local full install is not counted. This backport addresses the recursive fallback; the retained outer replacement algorithm is not claimed universally linear, and remaining dependency advisories are not waived.

Local provenance: `E:/Masarifi-staging-acceptance-2026-10-12/decoder-backport-qualification/provenance.json`. Independent review verified CommonJS compatibility, the narrow override, archive/source equality and license preservation.

## Native Tracking cold restoration

Successful cold authentication previously ran the same Tracking reset as sign-out, clearing native encrypted notification queues and their owner context even when the authenticated owner was unchanged. The reset now passes the verified restoring owner to a serialized continuity check. Matching owner and generation preserve the original context and ciphertext while native intake is suspended. Missing or malformed context, unmatched generation, orphaned ciphertext and ambiguous target-owner queues block restoration without deleting retained work. Explicit logout and a clean authenticated owner switch retain their cleanup behavior.

Suspension is enforced under the native owner monitor before queue reads, acknowledgements, additions, worker drains and rescheduling. Clearing a runtime retains the suspension flag so a delayed bridge call cannot create an unbound queue. JavaScript generation fences prevent stale configuration and background work from crossing restoration. Disabling SMS while preserving notifications retains the owner context.

Regression tests reproduced the destructive cold path, orphaned ciphertext, suspended queue access, ambiguous owner switching and post-logout queue access before their fixes. Final qualification passed 17 native tests using Android preferences, retained synthetic ciphertext and WorkManager, plus 39 focused JavaScript tests, typecheck and frontend boundary checks. Independent review closed all reported findings. Retained native XML is at `E:/Masarifi-local-readiness-2026-10-12/mobile-preservation/native-final/`. Robolectric does not prove physical-device or Android Keystore behavior.

The earlier concurrent full mobile run passed 2,995 of 2,996 tests; its sole failure loaded the pre-fix SMS/notification continuity implementation and subsequently passed in the focused rerun. Full lint now passes with zero errors and 111 existing warnings after a narrow CommonJS script rule correction. A clean exact-source CI run remains required before the new signed client is qualified.

Product launch, provider acceptance, financial activation and final client delivery remain open. No new device operation or deployment is implied by these source fixes.

## Unavailable authentication restoration

A cold live restore with no usable identity previously performed explicit logout cleanup. It now revokes in-memory access, unbinds private storage, closes the owner database and suspends native intake while retaining durable session bytes, legacy SMS data and encrypted Tracking queues. Rejected and timed-out current restorations also revoke a previous authenticated view; stale attempts cannot suspend a newer valid session. Explicit logout still clears its prior data and authenticated owner-switch cleanup is unchanged. Retained credentials are never accepted as authorization.

AppShell owner configuration now has a generation fence before and after its asynchronous migration, preventing a timed-out operation from rebinding a private owner after suspension. Actual delayed digest and SecureStore paths exposed the race before the fix. The final focused run passed 61 tests, typecheck, scoped lint and diff checks. Independent review closed both late binding and prior-owner access findings. Native source is unchanged from `52b9bdc0784688dce364724bf333d0aaf261fbb4`; fresh full mobile CI and a newly exported signed bundle remain required.

Clean CI for `52b9bdc0` passed all 481 mobile suites and 2,997 tests, including the Voice and decoder changes, and the native test job passed before APK assembly. It predates the unavailable-restoration changes above and does not qualify them.

An additional read-only Staging query at 10:03 UTC found three Tracking preference rows, two enabled, with missing preferences defaulting disabled. Voice posting was OFF and active epochs zero. This is an observed launch constraint, not a change to settings or a guarantee for any specific Redmi owner. Receipt: `E:/Masarifi-staging-acceptance-2026-10-12/redmi-launch-preparation/staging-tracking-readonly-result.json`.

## Final offline client qualification

Clean mobile CI run `38235312737` for `b7d042197da257cc6a57a50e5f6a6d25f0eae0aa` passed all 481 suites and 3,008 tests, completing the pending clean-install and final-source qualification above. Native CI run `38232896956` passed 17 tests and assembled the `52b9bdc0` base. The exact nine-file difference contains seven TypeScript files, one workflow and this evidence document; no native, configuration or dependency inputs changed.

The final offline client is `E:/Masarifi-local-readiness-2026-10-12/client-b7d04219/Masarifi.Ratibi-staging-b7d04219-universal.apk`, SHA256 `23a5653f5d5c1351189b1bc7f3de4a71c47a391b69bdb9c29edd49267b9aad83`. Independent review verified its original signing certificate, non-debuggable manifest, four ABIs, 16 KB ZIP alignment, 2,347 unchanged non-bundle entries, and six critical bundled source files against the committed export. All 68 packaged resource comparisons passed; Metro's 69 copied-file count is not a count of distinct resource checks. Separate ELF checks covered 92 libraries and confirmed 16 KB segment alignment for the 64-bit libraries.

These are offline and disposable test results. The candidate has not been installed or launched on Redmi. A reviewed installation-only controller has 13 passing mocked tests both normally and with Python optimization, including uncertain installers and final APK identity drift. A new diagnostic is being qualified against the exact candidate hash; its narrow policy change passed 51 portable checks and independent review. No device, deployment or financial approval is implied.
