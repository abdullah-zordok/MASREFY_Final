# US2 — Admin governance evidence

- [x] Strict Admin/invitation/role/assignment DTO and response redaction tests pass.
- [x] Invitation tokens use 256-bit process-local entropy; only a SHA-256 hash persists and responses expose masked email only.
- [x] Clerk verified-primary-email acceptance and selected/all eligible session revocation are provider-bounded and fail closed.
- [x] System-role mutation, active-assignment disable, self-elevation, stale version, and last-super-admin protections exist in SQL and pgTAP 010.
- [x] Bootstrap is route-disabled, advisory-locked, repeat-safe, and documented with two-person approval/recovery.
- [x] Canonical Admin invitation/session and RBAC HTTP routes pass E2E wiring tests.

Coverage: FR-006–FR-011, FR-016–FR-019, FR-039–FR-041, FR-047, AC-003–AC-006, SC-003.
