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

- [ ] Write and run failing tests for owner/legacy/RKStorage/key-store coverage, sidecars, unknown names, size limits, mutation/inventory drift and sanitized output.
- [ ] Implement bounded allowlisted memory reads using no-follow file access, stable before/after inventories and zeroing on close. Never create a file in the target tree.
- [ ] Run portable tests and a Linux symlink case; record any unavailable platform check honestly.
- [ ] Review and commit the component without changing application code or qualified binaries.

### Task2: WAL commit reconstruction

**Files:** `scripts/android-voice-qualification/src/com/masarifi/voicequalification/CommittedWalSnapshot.java`, corresponding portable Java tests.

**Interfaces:** `reconstruct(byte[] database, byte[] wal)` returns a bounded materialized raw database snapshot and committed-frame count; invalid headers, checksum/salt mismatches, bounds and unclassified hot journals fail closed.

- [ ] Write failing fixtures with a committed pending row represented only by WAL, valid uncommitted tails, repeated pages, commit truncation, both checksum byte orders and corrupt/truncated input.
- [ ] Verify the SQLite WAL algorithm against the deployed amalgamation; reconstruct only through the last valid commit without changing originals.
- [ ] Run fixtures plus real disposable SQLite/SQLCipher WAL tests before declaring the algorithm qualified.
- [ ] Commit separately; a portable raw-page test alone is not encrypted reader acceptance.

### Task3: Existing-only key and independent SQLCipher reader

**Files:** Android-only `ExistingDatabaseKeys.java`, native read-only snapshot VFS/SQLCipher adapter, strict journal classifier and disposable fixture tests beneath `scripts/android-voice-qualification`.

**Interfaces:** Existing key lookup returns an in-memory32-byte key or typed INDETERMINATE reason; reader consumes snapshot bytes only and returns sanitized journal counts, recovery ownership and unknown counts.

- [ ] Pin current/legacy schema coverage and full-owner key mapping from exact installed91213b4 and candidate7967007.
- [ ] Test missing/invalid/ambiguous AES-GCM entries without alias creation/deletion; test SQLCipher, committed WAL and all journal phases on disposable data.
- [ ] Reject incomplete/unknown schema, malformed payloads, recovery-owned audio, frozen confirmations and pending legacy records. Never export key or payload material.
- [ ] Verify the SQLCipher build/crypto configuration matches the deployed app, and that reader opens only the in-memory reconstructed snapshot.

### Task4: Native bootstrap rehearsal and device proposal

**Files:** Minimal probe manifest/instrumentation, disposable target with startup tripwires, build/integrity receipts and exact proposed device approval packet.

**Interfaces:** Sanitized qualification receipt includes probe identity, expected target/process/UID, complete-store coverage, unchanged hashes and determinate Voice no-replay verdict.

- [ ] Rehearse same-signature instrumentation against a non-debuggable disposable Android15 target; prove no main Application/providers/Activity or network request executes.
- [ ] Inspect the actual installed912 merged manifest/provider process assignments read-only; reject any collision with the dedicated process.
- [ ] Build/sign and verify the separate probe APK, source, package, certificate and no component/network surprises.
- [ ] Present exact installation/execution scope, target force-stop/process start and sensitive-memory key access for separate approval. Do not execute it while approval is pending.

The operating financial OFF-monitor rehearsal remains a separate exact Staging approval scope. Neither this diagnostic nor a synthetic receipt authorizes persistent financial activation.
