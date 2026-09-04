# Recovery Verification

Date: 2026-09-04
Scope: SPEC-BE-010

Runnable recovery checks pass for post-DATA SMTP ambiguity, duplicate suppression,
orphaned Storage cleanup before a generation replay, failed Storage deletion
retry, schedule advisory fencing, bounded oldest-first lag recovery, immutable
snapshot replay, and graceful worker stop.

N-1 database compatibility and backup/restore reconciliation remain tied to the
final local Supabase run recorded in `database-verification.md`.
