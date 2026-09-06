# Acceptance Matrix

Date: 2026-08-31

| Criterion | Evidence | Status |
| --- | --- | --- |
| AC-001/002 retry, replay, hash mismatch, one effect | `us1-idempotency.md`; pgTAP 026; live mutation integration | PASS |
| AC-003/004 deterministic bootstrap/delta and monotonic cursors | `us2-bootstrap.md`, `us3-delta.md`; pgTAP 028; delta live suite | PASS |
| AC-005 tombstones and no resurrection | `us4-tombstones.md`; pgTAP 025; Mobile tombstone suite | PASS |
| AC-006 explicit deterministic financial conflicts | `us5-conflicts.md`; pgTAP 027; conflict unit/contract/live/Mobile suites | PASS |
| AC-007 RLS, grants, device/owner isolation | pgTAP 024; sync security suite; live owner-isolation tests | PASS |
| AC-008 four retry-safe observable workers | `us6-workers.md`; worker unit/live/container coverage | PASS |
| AC-009 no-loss Mobile v9 -> v10 upgrade | `us2-bootstrap.md`; native SQLite and repository/adapter suites | PASS |
| AC-010 performance budgets | `us3-delta.md`; `test:performance:sync` retained summary/plans | PASS |
| AC-011 migration/recovery/reconciliation | `recovery.md`; reset/checksum/pgTAP/live worker/backup-restore results | PASS |
| AC-012 contracts match runtime/docs | OpenAPI drift/sync contract suites; runbook; job registration tests | PASS |
| AC-013 focused/full gates and independent review | `local-release.md`, `code-review.md`, `clean-code-review.md`, `test-review.md` | PASS |
| AC-014 scope/repository boundary | `admin-review.md`, `baseline.md`, `remote.md`, final diff audit | PASS |

FR-001..006 map to US1/US6 and pgTAP 023/026. FR-007..018 map to
US2-US4 and pgTAP 025/028. FR-019..023 map to US5 and pgTAP 027.
FR-024..030 map to pgTAP 024, security/contract tests, and Admin review.
FR-031..034 map to native SQLite and Mobile repository/adapter tests.
FR-035..037 map to US6 and observability/security tests. FR-038..041 map
to performance/recovery evidence. FR-042/043 map to local release, review,
remote, and final git evidence.

SC-001..008 are covered by the same retained story evidence: zero duplicate
effects, no-loss upgrade, 100,000-resource pagination/load, tombstone safety,
single conflict decisions, isolation denial, bounded indexed performance, and
operator recovery visibility.

## 2026-09-06 Client Item #45 Sync Evidence

- Live bootstrap/delta integration proves an explicit false account value
  survives both projections and excludes the foreign owner.
- Mobile delta/storage tests prove false round-trips, omitted legacy fields
  default true, and account tombstones remain snapshot-free.
- Full database lint and pgTAP pass: 52 files and 1,659 assertions.
- Independent review found no release-blocking findings. Slice 2 shipped in
  `cd3bafc28a42b758f6670d2d5b6087cd63abaefc`; Backend Foundation run
  [`33994830522`](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33994830522)
  passed all required jobs.

## 2026-09-06 Client Items #38/#39 Local Sync Evidence

- Live bootstrap/delta integration passes with all four card terms and rejects the
  foreign owner projection; cleanup keeps the full database suite isolated.
- Mobile persistence and delta tests pass for present terms, omitted legacy terms,
  type-change clearing, and snapshot-free tombstones.
- The injectable live account seam validates authenticated create/read/update,
  idempotency keys, optimistic versions, conflict detection, and explicit retry
  without dropping card terms. Production account upload/cutover remains Phase 14.
- Release SHA and remote CI remain pending and are not claimed by this local record.
