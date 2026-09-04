# Recovery Verification

Date: 2026-09-04
Scope: SPEC-BE-010

`npm run test:reports:recovery` passed 1 suite/4 tests against the final local
database. The retained fixtures cover:

- N-1 query compatibility against the migrated schema.
- Backup, delete, and restore reconciliation of an immutable output-attempt row.
- Rejection of an illegal state transition followed by a valid forward-fix to
  `failed`, preserving the snapshot and Storage reference.
- Post-DATA SMTP ambiguity and duplicate suppression.
- Orphaned Storage cleanup before generation replay and failed deletion retry.
- Schedule advisory fencing, bounded oldest-first lag recovery, immutable
  snapshot replay, and graceful worker stop.

`npm run test:migration` also passed 4 suites/4 tests, including its independent
backup/restore compatibility check.
