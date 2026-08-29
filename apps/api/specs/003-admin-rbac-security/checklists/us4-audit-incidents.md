# US4 — Audit and incidents evidence

- [x] Audit, security, and incident-timeline rows are append-only by grants, forced RLS, and immutable triggers.
- [x] Privileged mutations append safe actor/action/resource/request metadata and before/after evidence hashes in the same transaction.
- [x] Incident transitions are explicit, version checked, append timeline evidence, and emit validated alert input.
- [x] Audit/security/incident query filters are allowlisted, bounded, redacted, and reverse deterministic.
- [x] pgTAP 011/014/015, contract/integration/E2E/security suites, alert worker, metrics, and recovery runbook pass.

Coverage: FR-015–FR-019, FR-026–FR-027, AC-006, AC-008–AC-009.
