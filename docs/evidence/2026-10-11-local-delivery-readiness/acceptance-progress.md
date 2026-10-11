# Existing acceptance procedure: progress after recovery 15488cd7

This records execution of the existing Redmi acceptance and deployment plans. It
does not replace them or authorize protected operations.

## Backup and local restore

The read-only Staging backup at 14:03 UTC was stream-verified against all 139
tables (547,004 rows). Its DPAPI archive SHA-256 remains
`d177b5d4e8743b77b85b3177a23b3e8cba8947714c2ab5b35bc594c906a25359`.
The isolated financial restore passed: five accounts, 31 transactions, 31 ledger
postings, five balance checks and zero reconciliation mismatches. That local
cluster was stopped after verification.

The initial restore destination on E: was exFAT; a successful icacls command did
not establish persistent confidentiality permissions. That incorrect storage
claim is explicitly superseded by the retained correction and relocation receipt.
The stopped restore was moved to D: NTFS under a protected owner/SYSTEM-only
directory. All 991 files matched their pre-move SHA-256 hashes, every file's ACL
was checked, and the original plaintext directory is absent. A subsequent check
found 43,978,870 bytes, zero unsafe file ACL entries, protected parent inheritance,
no postmaster.pid, and `pg_ctl status` reporting no server running. D: had over
100 billion bytes free. The encrypted source archive was not changed.

Evidence root: `E:/Masarifi-staging-acceptance-2026-10-11/backup/`.
The relocated cluster is
`D:/Masarifi-private-staging-rehearsals/acceptance-secured-20261011T141452Z/financial-20261011T141452Z`.

## Redmi diagnostic and bootstrap correction

The exact approved diagnostic-only scope installed the separate diagnostic after
the user allowed the phone's installation confirmation. Its one instrumentation
invocation failed bootstrap before journal qualification. The original client
remains installed and stopped. The physical journal gate is **INDETERMINATE**;
the invocation approval is consumed. There was no client APK update, journal
replay, Staging deployment or financial action.

Independent review identified that upstream API35 can return an empty split-name
array for a base-only package. The diagnostic rejected any non-null array. It now
accepts only null or length zero and continues to reject every nonempty array,
including malformed entries. The exact APK, certificate, UID, process and store
guards remain mandatory. This is a demonstrated metadata incompatibility and a
plausible cause of the previous bootstrap failure; the physical failure's exact
stage was not retained and is not claimed as proven.

Bootstrap errors expose only a closed enum stage. Original exception messages,
causes and suppressed exceptions are discarded. Runtime source inventories now
bind the actual wrapper; disposable bootstrap exercises its synthetic wrapper,
so inventory matching is not actual-target runtime acceptance.

Local regression evidence includes fail-before-fix checks and the complete reader
suite on NTFS temporary storage: 43 identity checks, 45 failure disclosure checks,
215 schema checks, 98 whole-store checks and four packaging checks passed. Windows
native-file/POSIX cases were explicitly unexecuted; fresh Linux CI must execute
the existing fail-on-unexecuted checks. An earlier exFAT root-replacement test
failure remains retained and is not treated as a passing run.

The fixed real-target wrapper compiled into an unsigned offline APK. All 248
emitted DEX platform references passed against the pinned official Android35 r02
stub. Offline APK SHA-256:
`815cca20c21afacf3acfe894fe6dc9ea9d703bef6ec94b4daac1100ff30dff7e`.
It has not been signed, installed or executed. Fresh exact-source CI/runtime
evidence is required before signing a replacement probe. A new exact approval is
required before another physical diagnostic invocation.

Evidence: `probe-splits-fixed-full-local.log`,
`probe-fixed-unsigned-offline/build-receipt.json`,
`review/bootstrap-guard-readonly-review.md`, and
`redmi-diagnostic-install-retry-result.json` under the same acceptance evidence
root. Upstream tagged Android15 sources are retained in
`review/android15-package-metadata-primary-evidence.json`.

## Remaining acceptance gates

At 14:35:15 UTC the read-only Staging baseline remained Posting OFF, zero active
epochs, five accounts, 31 transactions/31 postings, Test balance -60 SAR and zero
ledger balance mismatches. Four historical uploaded/processing Voice jobs and
497,071 unpublished outbox items were untouched.

Fresh dependency audits retained zero API findings, mobile 53 high/27 moderate
findings and admin eight high findings. These are unresolved and unwaived;
previous dependency-security evidence and release blockers remain authoritative.

The qualified application APK, backend image and completed application tests
remain preserved. Next gates are fresh probe qualification and separately
approved Redmi journal execution, then approved client installation and Staging
deployment, real Posting-OFF monitor/worker rehearsal, security disposition, and
separately approved activation and bounded fresh financial tests. No claim of
full device, live auto-posting or client acceptance is made. Production,
Integration and main remain untouched.
