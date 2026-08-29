# US6 — Privacy export evidence

- [x] One active owner request, registered selected scope, retry claim, fixed evidence point, and handler-complete reconciliation are enforced.
- [x] ZIP entries reject traversal, executable/duplicate paths, excessive count, compressed size, and total uncompressed bytes; manifest entries carry SHA-256 checksums.
- [x] Private Storage upload is HEAD-validated; signing reauthorizes the owner and accepts only the exact configured origin/object path.
- [x] Ready/expiry state and validated outbox events are atomic; partial objects are removed on failure.
- [x] Unit/integration/security and canonical request/detail E2E tests pass; list contracts never return a URL or object key.

Coverage: FR-028–FR-031, AC-010, AC-013–AC-014, SC-005–SC-006.
