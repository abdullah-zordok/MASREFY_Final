# Phase 07 Image and Recovery Evidence

Fresh local rehearsal date: 2026-09-01.

## Release image

| Check | Result |
|---|---|
| `npm run test:release-image` | PASS; image rebuilt and container project passed 9 suites / 21 tests |
| Local tag | `masarifi-backend:spec-be-001` |
| Immutable local image ID | `sha256:06df4122eaed8c112df0ccc437866964ea822c9ac0f63e5f8b9249e3824e96ed` |
| Base/runtime | Pinned distroless Node.js 24 Debian 13 non-root image |
| Configured identity | `65532:65532` |
| Runtime identity probe | PASS: UID 65532, GID 65532 |
| Architecture | `linux/amd64` |

The local image digest is evidence for the rebuilt local artifact only. Registry
publication, signature, SBOM publication, and remote provenance remain pending
in `remote.md`.

## Recovery and worker rehearsal

| Check | Result |
|---|---|
| `npm run test:planning:recovery` with `MASARIFI_LIVE_DATABASE_TESTS=1` | PASS: 1 suite / 4 tests, zero skips |
| Ordered additive migration and checksum/N-1 compatibility | PASS |
| Failed migration transaction rollback followed by forward repair | PASS |
| Exact Mobile planning import with invalid-row quarantine | PASS |
| Backup/delete/restore planning row while preserving ledger signature and N-1 query shape | PASS |
| `npm run test:planning:integration` with live DB | PASS: 8 suites / 27 tests, zero skips |
| All five job kinds: expired lease reclaim and stale execution fence rejection | PASS |
| Reconciliation dry-run and repair, including differences beyond the first page | PASS |
| Graceful worker stop/recoverable leases | PASS in worker unit/integration release gates |

An initial recovery invocation without the explicit live-database environment
was skipped (4 tests) and is not counted as a pass. It was immediately rerun
with the local database enabled, producing the passing result above.
