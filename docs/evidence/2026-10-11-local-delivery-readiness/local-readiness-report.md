# Masarifi recovery continuation — local delivery readiness

Safe implementation, product CI, patched backend image qualification, encrypted Android qualification and compatible APK preparation are complete. The signed diagnostic preparation and final preservation receipts are recorded below. Full Staging and client acceptance remain **NOT READY** because the external safety, security and approval gates remain open.

## Preserved recovery and completed product work

Continued `68e198e0e689a406b439d13e6d82f96e9a9f9312` in `D:/Masarifi-integration-2026-10-10`, branch `codex/voice-auto-save-restoration-2026-10-11`. The original checkout, dirty Voice worktree, branches, stashes, preservation archive, old APKs and financial evidence were retained. The original handoff remains untracked and preserved. Only the recovery branch was committed and pushed.

The recovered Voice event pipeline, zero-balance Cash onboarding, account/currency ownership checks, configured Assistant route, grouped Home/Today design, manual finance, Savings, Tracking, notification policies and fresh epoch-scoped confirmations remain present. No UI redesign, historical replay or general-worker activation was added. Detailed existing implementation and automated-versus-real acceptance mapping is in `feature-acceptance-matrix.md`.

New safe implementation comprises complete multi-owner/legacy/RKStorage/key/WAL no-replay classification and JNI boundaries; retained exact-identity operational helpers and bounded independent shutdown; a strict OFF-only rehearsal adapter; atomic scoped Analysis/Assistant health; bounded extraction decision diagnostics without financial payloads; and compatible dependency fixes. The offline actual-target probe adds strict archived identity, process isolation, existing-only keys, RAM classification, ownership/unchanged checks and signing provenance gates. Its exact-source encrypted Android qualification passed; offline signing and independent artifact review are recorded in the final artifact receipt.

The full product qualification baseline is `e6def119b047c54fbaf36877fdd23b3bc367ad6a`. Later diagnostic/control commits preserve its production API source, mobile/admin applications, shared packages, database and Compose configuration. Commit `4bec7295` adds a pinned compatible glibc runtime patch and a container regression test, qualified by successful exact-source run 38142445486 at `093b5d0c`. The following are the historical baseline tree identities; the patched Docker runtime is qualified separately:

| Tree | Git object |
| --- | --- |
| apps | `55f5f6913452035a4601399fc08edbdca27a23bb` |
| packages | `6dc5cb5af44d25c8b6b52d5487903a7194aed80e` |
| docker | `a7caa3f921f1caaf1e9a1c8cd03b62f16494409f` |

The unchanged production trees independently rechecked after the runtime patch are: API source `04bf17e81828fc3c41cdbf9c4eedb92a0585075b`; mobile `2181030b3976cb588016f8ed984f0a7eb3f1a4b6`; admin `0c1a8ea1e5f1dcce05a394173a846a2d0b54bf9d`; packages `6dc5cb5af44d25c8b6b52d5487903a7194aed80e`; Supabase `4077662282bcf7a85206e40eea28e3abcd49e60f`. Thus the fully qualified mobile APK remains the latest compatible application candidate despite later runtime/control fixes.

## Completed automated evidence

Product [Backend Foundation run 38137175993](https://github.com/masarifiratibi-spec/masarifi.ratibi_app/actions/runs/38137175993) completed successfully at exact source `e6def119`. No product test lane failed; the tag-only signed-release lane is deliberately outside this branch run.

| Qualification | Actual result |
| --- | --- |
| Mobile | 481 suites, 2,979 tests; type/lint/frontend quality and native/deep-link profile checks passed |
| Admin | 87 test files, 926 tests; type/lint/build passed |
| API unit, contract, OpenAPI | 160/1,403; 79/237; 1/4 respectively, all passed |
| Fresh disposable database integration | 122 suites, 610 tests, zero skips/failures |
| Canonical-main upgrade integration | 122 suites, 610 tests, zero skips/failures; earlier local-main and current canonical-main ledger/Savings baselines preserved |
| Database E2E/security/sync | 81 / 151 / 47 tests passed respectively |
| Performance/stress | All required lanes passed, including 301,602 outbox checks and 300,000 stress checks, each 100% successful |
| Browser layouts | All five jobs passed: desktop 1440 124/9, desktop 1280 47/86, tablet 1024 47/86, tablet 768 63/70, mobile 390 74/59 passed/project-excluded cases |
| Container/configuration/security | 11 suites, 25 container tests passed; actual rendered Compose health configuration, nonroot identity, secret/redaction gates and configured Trivy HIGH/CRITICAL scan passed |
| Financial Voice boundary | 53 disposable tests passed; normal-user client regression: 6 tests passed |
| Operational preparation | Exact-source run 38138946678 passed at `aea34326`; 216 Python executions and 41 related Node cases. Independent review also passed 16 normal and 16 optimized OFF cases |
| Bootstrap isolation | Exact-source run 38143858579 passed at `238968b8`: five stable framework samples, exact six-effect positive control and three private-process, plain-Application, unchanged/no-network probes |
| Private whole-store host/encrypted | Exact-source run38143858679 passed all three jobs at `238968b8`: Linux ownership/snapshot tests, 603 native schema cases, 55 RAM-reader checks, 42 encrypted/JNI cases and all 42 Android encrypted cases three times, with existing-only key and unchanged-fingerprint guards |

Browser project exclusions and database-less suite skips remain visible; they are not represented as additional acceptance passes. Broad local runs interrupted by host memory pressure or timeout are retained as incomplete evidence. Complete disposable CI replaces those partial local attempts, not their factual outcomes.

Raw source-pinned CI logs and JSON/artifacts are retained under `ci-e6def119`, `operating-monitor` and `private-journal` beneath this evidence root. The first operating workflow failed because clean checkout lacked the API's `pg` dependency; its unchanged tests passed after frozen dependencies were installed without lifecycle scripts. Failed private Android runs are retained and remain failures; no gate was waived or masked.

Private Android failures were narrowed using retained actual runtime observations. Fully materialized disposable APK installation removed incremental installation, but a subsequent fresh-emulator asset configuration change still restarted the positive-control activity; this retained fixture failure led to the bounded pre-control framework stability check described below. A Java17 covariant Buffer descriptor and then fixture-only `Files.readString(Path)` were unavailable on Android; both were corrected without changing the production reader. The builders now pin the official API35 jar and verify every emitted DEX platform method, and signing binds those exact inputs. Independent checks passed 263 fixture and 248 real-probe platform references, six bounded strict UTF8 metadata cases, fifteen provenance rejection cases and the complete portable suite. A transient pinned OpenSSL Maven download failure was verified separately before one failed-job retry. Earlier run 38142569506 passed Linux and encrypted JNI gates, but failed its startup control before encrypted Android qualification; signing was blocked at that stage. Bootstrap 38142569557 and Voice boundary 38142569504 passed at tool source `e0bd7b3e`.

The reviewed fixture precondition at `238968b8172cd416663d5e980f244022d274c080` now requires user0 boot/unlock, explicit successful framework barriers and five stable global-configuration/overlay observations before the single control launch. Its total 120-second deadline includes every command and rejects late success; the bounded parser accepts the actual nested Android configuration format. Independent 15 host cases and three packaging gates passed. Bootstrap run38143858579 passed on real disposable API35: five stable samples, exactly six positive writes/requests, one application/activity, and three unchanged private-process runs with zero new requests. Full encrypted run38143858679 completed successfully, including its actual Android step: five stable samples, exact six writes/requests and one application/activity, three unchanged zero-network bootstrap runs, missing-existing-alias fail-closed seeding, and all 42 encrypted cases three times with identical fixture fingerprint. Root independently validated the retained raw receipt. Voice boundary38143858693 also passed all 53 cases at that source. The startup-stability hypothesis is not represented as universal immunity to future configuration changes.

## Prepared APK and backend artifact

Prepared, signed and verified **`client-e6def119/Masarifi.Ratibi-staging-e6def119-universal.apk`**; never installed or launched.

- APK SHA256: `be33158e282efa4d8ae6b5f1ad9541e1a90ac9a3a42d0d830bbbf7d601346c9f`; 131,853,839 bytes.
- Existing certificate SHA256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Package `com.masarifi.mobile`, name `Masarifi.Ratibi`, versionCode 1, minSDK 24, nondebuggable standalone Hermes96 runtime, all four existing ABIs.
- Exact-source native APK and standalone Staging bundle; 2,347 other native/resource entries unchanged, assets verified, required Voice/Home/Assistant/Tracking/manual sources and native classes present.
- APK ZIP/signature/16 KB ZIP alignment passed; all 46 packaged 64-bit libraries have 16 KB or greater PT_LOAD alignment. All 92 packaged libraries were inspected. Physical 16 KB compatibility remains unperformed.
- Staging API/Clerk/Firebase/project identities verified; production endpoint and privileged-key pattern scan passed. SMS/Notification automatic posting rollout remains disabled. The financial database policy was never enabled.

The latest qualified CI backend artifact is **`ghcr.io/masarifiratibi-spec/masarifi-backend@sha256:8ee5100f2f9de7b5930867eb7cf901c94344452ba8a3ed62954223bbc8fb2bab`**, exact source `093b5d0c42f3d68eb2de619aff94b44fbf088a02`. [Runtime qualification 38142445486](https://github.com/masarifiratibi-spec/masarifi.ratibi_app/actions/runs/38142445486) passed all 11 container suites / 26 tests, type/lint, rendered configuration, nonroot identity, protected actual-Node/library checksum checks and an all-severity Trivy scan without suppressing unfixed findings. Its guard verifies production applications, packages, database and every Docker configuration against the fully qualified baseline, allowing only the reviewed runtime Dockerfile and regression test to differ. Two medium libc6 findings were removed by the pinned compatible point update; **23 medium / 8 low / 0 high / 0 critical** remain visible. Node, Debian release, base digests and application dependencies are unchanged. The first focused run failed before build because clean checkout lacked shared mobile contract dependencies; frozen dependency installation corrected the runner setup. Both failed and successful receipts remain preserved. Publishing this immutable CI artifact did not deploy or replace any Staging service.

The separate arm64 diagnostic was strictly signed offline after the successful current-source encrypted Android receipt: `private-journal/probe-signed-238968b8-review-only/private-journal-diagnostic.apk`, SHA256 `938da77e4750ca24165e218fe025848f30f6a5edb09418887341f4863021fe05`, 3,400,241 bytes. Its certificate matches the existing archived target. The probe uses a plain Application, no permissions or application components, and only instrumentation targeting `com.masarifi.mobile:voicequalify`. Signing validates the complete current source/harness, pinned API35 emitted-method checker, NDK/configuration, native dependencies and exact ARM library bytes against runtime provenance. No signature, synthetic result or historical target APK observation supplies fresh installed-target/UID evidence or execution approval. The diagnostic remains uninstalled and unexecuted.

Final independent review passed the actual signed APK certificate/manifest, all248 API35 platform references, embedded DEX and both arm64 ELF hashes, all33 canonical source bindings and all nine identity-packet file hashes. No actionable code finding remains. The exact identity packet SHA256 is `a1607114ce09f24a90cd52a67ad62feb1c9959a051766fd805af6f19792c5e4f`; fresh identity/UID/device and execution approvals remain null. Residual dependency and actual acceptance blockers remain unwaived.

Delivery files are [the signed Staging APK](<E:/Masarifi-local-readiness-2026-10-11/client-e6def119/Masarifi.Ratibi-staging-e6def119-universal.apk>), [the diagnostic build receipt](<E:/Masarifi-local-readiness-2026-10-11/private-journal/probe-signed-238968b8-review-only/build-receipt.json>), [the inert acceptance packet](<E:/Masarifi-local-readiness-2026-10-11/staging-client-acceptance-review-packet.json>) and [the final source/artifact provenance](<E:/Masarifi-local-readiness-2026-10-11/final-delivery-provenance.json>). The final provenance identifies the documentation HEAD separately from each tested component source and retains additive all-ref/source preservation. The probe is a safety diagnostic, not the client application APK.

## Security and external acceptance blockers

API npm audit: **0**. Mobile: **27 moderate / 53 high / 0 critical**. Admin: **8 high / 0 critical**. Compatible fixes removed the known critical findings. Residual findings remain visible and unwaived. The repository's `docs/evidence/2026-10-11-local-delivery-readiness/dependency-security.md` records primary advisories, locked dependency paths, observed exposure and incompatible/no-patch boundaries. No forced framework or module-contract migration was used to hide audit findings.

Before actual acceptance, remaining required evidence/actions are:

1. Obtain exact device approval and a fresh installed-target/UID observation for real private-journal clearance using the separately reviewed diagnostic. Disposable runtime success and offline signatures do not establish physical journal clearance.
2. Resolve remaining dependency findings or establish a separately governed release decision with the client. No waiver is recorded.
3. At approved execution time, obtain fresh protected service/source/image/environment/CA inventory and verified backup/restore scope; perform the separately approved OFF-only retained-helper rehearsal. Its adapter has **no financial epoch closure authority**. Real closure/shutdown evidence requires a separate exact owned-epoch scope.
4. Obtain explicit candidate API/Analysis/Assistant/financial-worker Staging deployment approval with interruption, compatibility and rollback scope; verify real worker/provider health, consent, quota/reset/budget and Arabic/English behavior using fresh permitted work.
5. Obtain separate financial activation/transaction scope after all safety gates pass. Persistent Voice targets authenticated eligible normal users with fresh epoch captures, not a reused canary allowlist. Full multi-event, multi-account, retry/duplicate, onboarding, manual/Home, notification/background and Tracking acceptance is open. Unsupported Voice transfers and any in-scope iOS acceptance require separate completion/qualification.
6. Obtain explicit Integration/main merge/ref-update approval after final review and actual acceptance. The Integration target is `codex/masarifi-complete-integration-2026-10-10` at `42bcb8ca93b3018d6c6e8a875de39579f0936ac3`; canonical main remains `ecfba4d7de40555c122bd3b5e53e7e7fd71f6294`. Main requires a reviewed three-way diff; its historical merge commit is not an ancestor of this recovery. No protected ref was changed.

The review-only `staging-client-acceptance-review-packet.json` is inert, `executable: false` and `approval: null`. Current pins and exact future approval are absent. Financial activation, old Voice replay, blanket outbox drain, general-worker start and Production operations are outside this task.

## Financial and preservation boundary

No live financial transaction, phone/ADB operation, Staging deployment/service change, Integration/main update or Production change was performed. All exercised databases and Android runtimes were disposable CI fixtures. The single approved Redmi 10 SAR canary remains consumed and was not repeated.

The most recent preserved real Staging observation remains **11 October, 13:59:51 Riyadh**: Posting OFF, zero active epochs, 31 transactions/31 postings, Test −60 SAR, 497,071 unpublished outbox items. This session did not refresh that live observation; it is historical evidence. Old uploaded Voice rows and historical outbox were not consumed or replayed.

The product source archive, source/artifact manifests and verified all-ref bundles are retained on E:. The `aea34326` all-ref bundle SHA256 is `42dc8654cdeeefa2cf822bf26e476fa51914d48e942831d84e3f44ed110225db`. The additive final source/ref receipt supersedes that source pin without removing earlier evidence and verifies protected remote refs and production-tree equivalence. The original handoff and preservation archives remain intact.
