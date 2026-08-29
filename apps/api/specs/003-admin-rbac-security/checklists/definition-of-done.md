# Definition of Done

- [x] Scope and ownership match Phase 03; no later Spec or client cutover is implemented.
- [x] Specification, plan, data model, research, contracts, quickstart, tasks, and analysis are internally consistent.
- [x] All 16 owned tables and supporting indexes/constraints/triggers are additive and checksummed.
- [x] Exact database authorization, forced RLS, minimum grants, recent MFA, self-approval, and continuity controls are implemented.
- [x] Immutable audit/security/timeline evidence and validated outbox events are transactional and redacted.
- [x] Support, incident, privacy export, deletion, retention, and hold lifecycles are bounded, retry-safe, and fail closed.
- [x] Runtime OpenAPI exposes 38 paths / 45 operations and matches the client mapping without client edits.
- [x] Seven system roles and exactly 151 permissions seed deterministically.
- [x] Five jobs and ten event payload contracts are implemented and validated.
- [x] Unit, contract, security, non-live integration/E2E, build, checksum, dependency, scope, and performance syntax gates pass locally.
- [x] Million-row permission/owner-query budgets pass with retained dataset hash and artifact.
- [x] Four operational recovery runbooks, alert ownership, OWASP traceability, security evidence, and acceptance mapping are complete.
- [x] Official Codex Security diff scan completed 40/40 items with zero findings.
- [x] Clean Linux migration/lint/pgTAP/live integration/E2E/performance gates pass for the final commit.
- [x] Final image builds non-root and passes container plus Critical/High vulnerability gates.
- [ ] SBOM, provenance/attestations, and keyless signature evidence pass on a release tag.
- [ ] Final commit/tag evidence is recorded and every task is checked only after its required proof exists.

The remaining release items are closed only after the immutable tag workflow publishes and verifies its evidence.
