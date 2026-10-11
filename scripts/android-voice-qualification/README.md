# Private Voice journal diagnostic preparation

This directory contains **local preparation code**, not an installed or approved Redmi diagnostic. No class calls the Masarifi app, a service, API, provider, database loader or key-generation routine. The qualified application7967007 and its APK/image are preserved.

`VoiceStoreSnapshot` captures allowlisted owner/legacy SQLite stores and WAL/SHM/journal sidecars, legacy RKStorage, and existing key preferences into bounded memory. It reads using no-follow leaf access and checks parent directories, file stamps and before/after inventories. Limits are64MiB total and512 files. Verification streams64KiB chunks instead of allocating a second snapshot. Unknown Voice store names, orphan sidecars, preference backups, symlinks, unreadable files, root/inventory changes and exceeded limits fail closed. Only a genuine missing-file exception is treated as absence; denied/unknown access is indeterminate. Failed captures clear already retained byte arrays through finally cleanup, including allocation failures; `close()` clears a completed capture. The public summary contains counts and an aggregate fingerprint; it has no no-replay verdict, filenames, keys, IDs or contents.

Capture requires an independently verified quiescent target package. Java desktop providers may omit inode-like file keys, so creation identity is retained as well and `nativeFileIdentityAvailable=false` explicitly reports that limitation. NTFS can preserve creation time when a filename is replaced, so metadata fallback cannot attest identical-byte inode replacement. A future Android wrapper must additionally verify native UID/inodes and quiescence; the portable component is not a proof against hostile concurrent directory replacement. Native encrypted/committed-WAL reading, strict full-owner journal classification, bootstrap suppression and disposable Android rehearsal are still required by the [implementation plan](../../docs/superpowers/plans/2026-10-11-voice-private-journal-qualification.md).

Run portable preparation tests in a **new** evidence directory:

```powershell
./scripts/android-voice-qualification/run-local-tests.ps1 -OutputDirectory E:/Masarifi-redmi-acceptance-2026-10-10/regression/voice-private-reader-new-run
```

These tests touch only synthetic files created in the host temporary directory and retain those fixtures. Unavailable host symlink/POSIX permission cases are explicitly reported unexecuted; Linux CI requires both to execute. A desktop-only JDK17 SecurityManager boundary denial also tests sanitized failure on Windows; its expected deprecation warning does not apply to production source. A separate96MiB-heap test checks a full64MiB capture and streaming verification. No Android device, real key or application data is read. Passing these tests is not Redmi acceptance or permission to execute instrumentation.
