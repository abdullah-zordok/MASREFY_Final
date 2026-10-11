# Voice Private Journal Qualification Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the existing branch. User authorization requires autonomous local implementation, with separate approval before any Redmi installation/execution or Staging operation.

**Goal:** Produce a reviewed native diagnostic that can establish whether launching the existing Redmi app would resume retained Voice work, without modifying its journals or starting its application recovery paths.

**Architecture:** Separate same-certificate instrumentation uses a dedicated target process and plain Application. It inventories allowlisted stores into bounded memory, verifies stable original bytes, decrypts existing database keys in memory, and reads reconstructed committed database snapshots through an independent SQLCipher reader. It emits counts and hashes only, and fails closed on pending or indeterminate state. Android startup suppression and encrypted/WAL behavior require disposable rehearsal before any device proposal.

**Tech Stack:** Portable Java17 preparation tests, Android native instrumentation, deployed Expo SQLCipher format, existing-only AndroidKeyStore AES-GCM access. No React/Expo/AsyncStorage/SecureStore application loaders.

**Spec:** `E:/Masarifi-redmi-acceptance-2026-10-10/regression/Client-readiness-7967007-after-approved-API-qualification.md`; independent investigation `C:/Users/DELL/.codex/visualizations/2026/10/10/01a1246b-1e96-7402-a61c-35bd296d00c7/actual-no-replay-instrumentation-feasibility.md`.

## Global Constraints

- Continue on `codex/voice-auto-save-restoration-2026-10-11`; preserve the qualified7967007 source/image/APK as historical artifacts.
- Never execute on Redmi without a separately reviewable exact approval; never touch Samsung, Production or main.
- No application Activity, React runtime, target provider, service, Voice request, journal migration, key creation/deletion, or financial effect.
- Diagnostic process name is `com.masarifi.mobile:voicequalify`; target package `com.masarifi.mobile`; certificate SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Cover all owner databases and sidecars, legacy `masarifi.db`, RKStorage and existing database-key preferences. No original file write, deletion or checkpoint.
- No raw owner/session IDs, transcripts, audio paths, keys, tokens or payloads in output. Unknown/corrupt/unstable state yields INDETERMINATE, never zero.
- Local/disposable success does not prove the Redmi journal empty or complete physical acceptance.

## Review Focus

- Committed Voice rows present only in WAL must be included; incomplete/invalid WAL must not produce a false empty result.
- Symlinks, unknown owner-store filenames and inventory changes must fail closed; no traversal outside the expected data root.
- Multiple owners and legacy keys must all be counted; current sign-in alone is insufficient coverage.
- Missing/invalid keys must never invoke application getters or generate a replacement.
- Dedicated-process instrumentation must prove that main Application/provider tripwires do not execute on Android15 before a Redmi proposal.

### Task1: Stable bounded store snapshot

**Files:** `scripts/android-voice-qualification/src/com/masarifi/voicequalification/VoiceStoreSnapshot.java`, `scripts/android-voice-qualification/tests/com/masarifi/voicequalification/VoiceStoreSnapshotTest.java`, `scripts/android-voice-qualification/run-local-tests.ps1`.

**Interfaces:** `VoiceStoreSnapshot.capture(Path)` returns an AutoCloseable snapshot; package-private byte access supports the later reader; `summary()` returns sanitized counts/hash; `verifyUnchanged()` rechecks original inventory and bytes.

- [x] Write and run failing tests for owner/legacy/RKStorage/key-store coverage, sidecars, unknown names, size limits, mutation/inventory drift and sanitized output.
- [x] Implement bounded allowlisted memory reads using no-follow file access, stable before/after inventories and zeroing on close. Never create a file in the target tree.
- [x] Run portable tests and a Linux symlink case; record any unavailable platform check honestly. Linux run38125448594 passed31 checks plus the64MiB/96MiB-heap test on42565f8e; Windows passed30 and explicitly lacked POSIX/native identity checks.
- [x] Review and commit the component without changing application code or qualified binaries. Commits1620d5b9 and42565f8e; the first CI failure (runner lacked ripgrep) remains preserved.

### Task2: WAL commit reconstruction

**Files:** `scripts/android-voice-qualification/src/com/masarifi/voicequalification/CommittedWalSnapshot.java`, corresponding portable Java tests.

**Interfaces:** `reconstruct(byte[] database, byte[] wal)` returns a bounded materialized raw database snapshot and committed-frame count; invalid headers, checksum/salt mismatches, bounds and unclassified hot journals fail closed.

- [x] Write failing fixtures with a committed pending row represented only by WAL, valid uncommitted tails, repeated pages, commit truncation, both checksum byte orders and corrupt/truncated input. Missing component failed first;35 synthetic checks and a genuine disposable SQLite fixture passed locally.
- [x] Verify the SQLite WAL algorithm against the deployed amalgamation; reconstruct only through the last valid commit without changing originals. Invalid/stale tails fail closed rather than being silently dropped. Commit growth cannot resurrect truncated pages or manufacture missing pages.
- [x] Run fixtures plus real disposable SQLite/SQLCipher WAL tests. Exact6c485109 CI38126229230 passed both Linux portable checks and the checksum-pinned SQLCipher encrypted-WAL fixture. This qualifies raw-page reconstruction on disposable data, not the complete native reader.
- [x] Commit separately; WAL implementationc9558415 and independently reviewed changes were preserved. Subsequent CI environment corrections are separate retained commits; a portable raw-page test alone is not encrypted reader acceptance.

### Task3: Existing-only key and independent SQLCipher reader

**Files:** Android-only `ExistingDatabaseKeys.java`, native read-only snapshot VFS/SQLCipher adapter, strict journal classifier and disposable fixture tests beneath `scripts/android-voice-qualification`.

**Interfaces:** Existing key lookup returns an in-memory32-byte key or typed INDETERMINATE reason; reader consumes snapshot bytes only and returns sanitized journal counts, recovery ownership and unknown counts.

- [ ] Pin current/legacy schema coverage and full-owner key mapping from exact installed91213b4 and candidate7967007.
- [ ] Test missing/invalid/ambiguous AES-GCM entries without alias creation/deletion; test SQLCipher, committed WAL and all journal phases on disposable data.
- [ ] Reject incomplete/unknown schema, malformed payloads, recovery-owned audio, frozen confirmations and pending legacy records. Never export key or payload material.
- [ ] Verify the SQLCipher build/crypto configuration matches the deployed app, and that reader opens only the in-memory reconstructed snapshot.

Partial Task3 preparation: the existing-only AES-GCM primitive has22 host checks using public synthetic keys. It rejects unsupported/authenticated envelopes before key lookup, sanitizes provider failures, validates plaintext key format and clears buffers. The bounded strict-JSON parser has35 host checks; the bounded streaming XML owner-key index has48 host checks, including actual synthetic AES256-GCM decryption through both current and older aliases and sanitized XML-provider failures. Ownership mapping derives from installed91213b4 and qualified7967007 database naming plus the locked Expo SecureStore source. Missing entries, duplicate forms, owner-prefix collisions, unsupported mapping names and malformed envelopes fail closed. The independent RAM-only native VFS now passed53 disposable checks on exact6be30ccb, including encrypted committed-WAL rows, wrong keys, unrelated-page HMAC damage, denied writes/paths, zeroing and concurrent independent readers. Its Androidarm64 compilation/link passed; no Android runtime or AndroidKeyStore read occurred. Full schema/store classification and JNI/bootstrap remain incomplete; these components alone cannot satisfy Task3.

Row-semantic classifier preparation: `VoiceJournalClassifier` matches the pinned batch/singleton/legacy payload contracts and verifies SQLite identity/revision against payload identity/revision. Its result contains only pending/terminal/audio/confirmation booleans, not private identifiers or payloads. All8 batch and12 singleton phases, optional fields, missing required fields, bad bodies/dates/types/limits and legacy entries are tested. It is not a full-store schema/owner/WAL verdict; that binding remains required before device proposal.

Static Task4 evidence: the preserved APK pulled from the installed91213b4 release was rehashed as0c0dd12035bd22eeb6f45b1597731462b967533cb394a23d3f9430a0d7a78685 and its binary merged manifest decoded read-only. All four providers have no explicit process assignment; the application has no explicit process assignment and usesMainApplication/CoreComponentFactory. No `:voicequalify` collision was found in that archived manifest. This is not a fresh package-state check or a runtime startup-suppression rehearsal; Task4 remains open.

### Task4: Native bootstrap rehearsal and device proposal

**Files:** Minimal probe manifest/instrumentation, disposable target with startup tripwires, build/integrity receipts and exact proposed device approval packet.

**Interfaces:** Sanitized qualification receipt includes probe identity, expected target/process/UID, complete-store coverage, unchanged hashes and determinate Voice no-replay verdict.

- [x] Rehearse same-signature instrumentation against a non-debuggable disposable Android15 target; prove no main Application/providers/Activity or network request executes. Exactcddc708a run38132147302 passed the six-write/six-request positive control and three unchanged private-process/plain-Application runs with zero new requests. This qualifies bootstrap suppression, not the complete encrypted diagnostic or Redmi.
- [ ] Inspect the actual installed912 merged manifest/provider process assignments read-only; reject any collision with the dedicated process.
- [ ] Build/sign and verify the separate probe APK, source, package, certificate and no component/network surprises.
- [ ] Present exact installation/execution scope, target force-stop/process start and sensitive-memory key access for separate approval. Do not execute it while approval is pending.

The operating financial OFF-monitor rehearsal remains a separate exact Staging approval scope. Neither this diagnostic nor a synthetic receipt authorizes persistent financial activation.

## Execution rulings and preserved evidence

- The user requires all evidence retained, so disposable fixture directories and plan evidence will not be deleted when the skill normally suggests cleanup.
- `reconstruct(database, wal)` has no rollback-journal argument. The later native caller must reject or explicitly classify any original rollback journal before reconstruction; portable WAL success cannot bypass that prerequisite.
- Windows file identity and permission coverage is weaker than Linux and Android. It is reported unavailable rather than equated to native inode/UID checks. Linux must execute every platform protection case.
- Separate read-only fixture files are permitted only in the test harness's fresh synthetic directory. They are never a substitute for the planned native in-memory reader of original private data.
- Ruling: A retained confirmation key/body blocks diagnostic launch qualification even on a terminal singleton — the plan requires frozen confirmation evidence preserved and explicitly accounted for; the diagnostic does not consume or reinterpret it as permission to resume. This is conservative: an already-saved receipt may need a separately approved read-only investigation rather than automatic clearance.
- Ruling: A singleton labelled saved without a transaction identifier is indeterminate — its payload alone cannot substantiate the claimed persistence. No journal is modified to repair it.
- Ruling: Preserve the legacy integer timezone contract rather than applying the new capture's +/-840 bound — otherwise valid old evidence could be dismissed simply because its schema is older.

Task4 rehearsal preparation: two synthetic same-certificate packages now reproduce a non-debuggable target with AndroidX CoreComponentFactory, four main-process providers, Application/Activity startup counters and a host-loopback HTTP tripwire. The instrumentation uses the dedicated fixture process and tests the target UID, process, plain Application, unchanged counters and repeated fixture-file hashes. The initial implementation deliberately retains Android's default Application factory so the runtime test must detect startup before the suppressing hook is added. Local fixture APK build and the complete portable suite passed; this is not runtime startup acceptance.

The Windows emulator37.2.12/API35 AOSP revision2 failed before either fixture was installed: Windows Event1000 recorded ucrtbase.dll exception0xc0000409. Its launch, SDK/AVD files, failed preflight receipt and event evidence remain under the regression evidence directory. The emulator used its own ADB server15040 with a nonexistent USB selector; the physical-device ADB server5037 remained PID26364. Port5040 was already occupied by a Windows service and was left unchanged. A separate Linux Android15 CI rehearsal is prepared; no Redmi probe installation or execution occurred.

- Task4 Ruling: Give each synthetic provider its own component class. Run38131687750 installed and launched the Android15 fixture successfully, but Android coalesced four declarations of the same provider class into one component. The six-write/six-request positive-control assertion correctly failed with three effects. Distinct provider classes repair the fixture while retaining the original assertion; this infrastructure failure is not the intended Application-suppression RED result. Its full log and artifact remain preserved.

The six-write/six-request positive control passed on56c928ae/run38131853066. Its first instrumentation command failed at Android's shell argument parser because adb concatenation discarded an empty expectedHash argument. The harness now omits that first extra and supplies the recorded64hex hash on subsequent runs. Neither that shell failure nor the earlier host crash is counted as the intended startup-suppression RED. No startup assertion was weakened; all earlier receipts remain retained.

Actual startup-suppression RED:691d0304/run38132004000 reached the correct Android15 private process under the correct target UID with non-debuggable=true, but default Instrumentation returned plainApplication=false and marksUnchanged=false. The verdict was FAIL_STARTUP_EFFECT; six positive-control writes and six loopback requests had passed first. The public newApplication override now requests plain android.app.Application through the superclass's component factory with the original target Context. The runtime test and its unchanged assertions will verify the fix; compilation alone cannot qualify it.

Task3 schema coverage preparation: installed91213b4, candidate7967007 and current HEAD share database.ts SHA256e932c00613e54ac45c59ad2f2b79f27c9090e1c0fec78a69334ee4f91f0a2b36. Actual disposable SQLite migrations1–15 generated the full sqlite_master signatures, including indexes; all45 optional-object variants and known AsyncStorage v1 passed215 portable checks. Missing implementation failed first, then malformed null object type failed sanitization before its correction. Exact SQLCipher/RAM-reader integration is now a required CI gate, including a fixed read-only user_version query that has not yet been added to the native adapter. No private app database was read.

Exactefcc2870 run38133243262 passed Linux portable schema checks and all53 prior native checks, then failed the new real-schema fixture at `production user_version query missing or incorrect`. The adapter now exposes only fixed `PRAGMA user_version`; the authorizer still rejects any non-null PRAGMA argument. Setter forms are additional regression cases. The actual encrypted schema gate must pass on the corrected commit before this subtask is qualified.

- Ruling: Validate the complete known schema plus contiguous migration history, rather than infer emptiness from available Voice tables — a missing journal table or unknown object must remain INDETERMINATE. Exact optional Android metadata and the legacy marker pair are recognized; marker row/owner binding remains separate. A legitimate unknown historical schema may require another reviewed pin, but is never discarded.
- Ruling: Prefix10 and11 legitimately share a schema signature because migration11 only changes data — history still distinguishes them, so schema identity never substitutes for migration coverage.
