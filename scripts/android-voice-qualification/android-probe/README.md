# Existing-only private diagnostic: offline review packet

This is a separate real-target reader. Its sources contain no synthetic seeder,
fixture writer, application getters, network code or device commands. Building an
APK does not authorize installation or execution. No real target has been queried.

The pinned **historical** target is `com.masarifi.mobile`, archived installed release
91213b4, versionCode1/versionName0.0.1, API35, APK SHA256
`0c0dd12035bd22eeb6f45b1597731462b967533cb394a23d3f9430a0d7a78685`.
Both target and diagnostic must have certificate SHA256
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
The diagnostic package is `com.masarifi.voicequalification.diagnostic`; its only
entry is `com.masarifi.voicequalification.PrivateJournalDiagnostic` targeting
`com.masarifi.mobile:voicequalify`. The probe has plain `android.app.Application`,
no permissions, Activity, provider, receiver or service. It is non-debuggable.

Before returning a plain Application, the instrumentation verifies the exact
archived target APK hash/certificate/version, the internal diagnostic certificate,
target UID/process/API, main Application/CoreComponentFactory, four main-process
providers and every declared component's main-process assignment. It rejects
splits, shared UIDs, provider collisions, unknown identity and other visible
same-UID processes. The archived manifest check does not establish current device
identity. A fresh separately approved observation remains required.

Android supplies instrumentation arguments after `newApplication`. Before any
store capture, native-reader load or existing-key access, `observedTargetUid` must
exactly match the fresh approved UID and `approvedProbeSha256` must match the final
reviewed signed APK. Absent arguments fail closed. A main-loop barrier then checks
the plain Application, identity and process isolation again. Native UID/inode/mode
stamps and complete snapshot hashes are checked before and after qualification.
Only `/data/user/0/com.masarifi.mobile` and `/data/data/com.masarifi.mobile`
may resolve as the user0 system aliases. The package directory itself must pass
no-follow native directory/UID checks; package symlinks and other resolutions
are rejected. The snapshot's own canonical-root/symlink protections remain intact.
The process survey is a runtime guard, not a guarantee against a future concurrent
launch; the separately approved execution scope must independently quiesce the
package and prevent concurrent application/recovery activity.

Only allowlisted owner/legacy/RKStorage/preferences and their sidecars are copied
into bounded RAM. Existing AndroidKeyStore aliases are read solely for AES-GCM
decryption; no alias is generated, imported, removed or enumerated. Original
database pages are never opened by SQLite; committed WAL pages are reconstructed
in RAM and read by the independent SQLCipher VFS. Any rollback journal, missing
key, unknown/corrupt/incomplete/unstable state gives `INDETERMINATE`. `BLOCKED`
retains pending/audio/confirmation counts. A determinate result contains counts,
public APK/certificate identity and an aggregate fingerprint; no raw owner/session
IDs, payload, transcript, token, audio path, key or exception cause is exported.

`build-probe.py` performs offline compilation and manifest/APK-entry validation by
default and emits an **unsigned**, uninstalled artifact. `--sign` additionally
requires arm64 native inputs, the exact historical target APK, the existing
internal keystore/password environment name, and a retained successful disposable
encrypted Android runtime directory. It verifies all42 encrypted cases across
three unchanged runs, missing-alias/no-creation evidence, the six-effect positive
control, three startup/network-negative controls, and matching current Java/native
source hashes before signing. Both native receipts additionally bind the exact
builder hash, NDK27.1.12297006/API35/ABI target, full compile/link flags, disabled
test hooks, exact native source set and locked SQLCipher/OpenSSL pins. The entire
current rehearsal source inventory must also match the successful runtime build.
`--runtime-android-jar` must supply the official Android35 r02 stub, SHA256
`4566663c3876e022b4fa4ced8c8697c4ab1688267f090114fd92d027b32e619b`.
Both builders check Buffer descriptors before D8, then every emitted DEX method
reference in the Java, javax, Android and XML platform namespaces against this
actual API35 stub, including inherited interface methods and exact constructors.
Compiler bootstrap references that D8 desugars are not treated as runtime calls;
the complete emitted DEX has no method waiver. Signing also requires matching
runtime-stub and descriptor-checker hashes in the qualified build receipt.
It verifies the resulting certificate and emits
source/native/APK hashes in `build-receipt.json`. Password values are never logged.

The final review packet must contain the signed APK and its receipt/manifest,
exact source commit/hashes, retained encrypted runtime receipt, historical target
APK hash/certificate and a fresh separately approved identity/UID observation.
The proposed later scope is narrowly bounded: install only the separate reviewed
diagnostic package, explicitly quiesce/force-stop only the approved target, start
only its dedicated instrumentation process, permit existing-key RAM access and
allowlisted RAM-only classification, capture the sanitized receipt, and stop the
dedicated process. Starting the target Activity, application main process, target
providers/services, changing journals/keys, financial actions, deployment and
Production are outside that scope. Approval must name the exact final APK hash,
target/device/UID/process and these effects. No such approval is implied here.

Open gates: successful exact-source disposable encrypted Android runtime;
independent review of this actual-target wrapper; final signed arm64 artifact and
identity packet; fresh approved installed-target observation; separate exact
installation/execution approval. A local/CI success is never Redmi acceptance.
