# Database Verification

Date: 2026-09-04
Scope: SPEC-BE-010

- Migration checksums: PASS for all four Phase 10 migrations.
- Earlier clean reset and pgTAP run: PASS, 41 assertions across tests 041-043,
  before the final Admin activity/delete changes and webhook receipt reuse.
- Final clean reset, lint, pgTAP, and up/down/up rerun: PENDING because Docker
  Desktop 4.88.1 recreates inaccessible Unix-socket reparse points before the
  Linux engine can start. Moving the exact stale `Docker/run` and
  `docker-secrets-engine` runtime directories to timestamped sibling backups
  exposed the same newly-created `sailor-ingest.sock` failure; project data,
  images, and volumes were not reset.

No final database task is marked complete until the final migration sources are
applied and retested on a clean local stack.
