# Definition of Done

Recorded 2026-08-29 for SPEC-BE-004.

## Acceptance traceability

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-001 seeds/migrations | Pass | clean reset, pgTAP 016, checksums |
| AC-002 RLS/grants | Pass | pgTAP 017, live ownership matrices |
| AC-003 category invariants | Pass | pgTAP 018 plus unit/integration/E2E |
| AC-004 account invariants/no balance | Pass | schema plus unit/integration/E2E |
| AC-005 opening-balance boundary | Pass | zero-effect `LEDGER_NOT_AVAILABLE` cases |
| AC-006 FX resolution | Pass | deterministic resolver tests; no fabricated/provider rate |
| AC-007 atomic audit/outbox | Pass | injected rollback and successful pairing tests |
| AC-008 Admin authorization | Pass | exact permission/MFA/reason/version contract and E2E cases |
| AC-009 client/OpenAPI parity | Pass | mapping and drift contracts; no client diff |
| AC-010 performance | Pass | `performance.md` budgets and indexed plans |
| AC-011 cache | Pass | canonical validator, bounded cache, invalidation/failure tests |
| AC-012 complete gates | Pass | formatting baseline commit plus all named local gates |
| AC-013 operations/evidence | Pass | metrics, alerts, security/performance/recovery/runbook and signed release evidence |
| AC-014 scope | Pass | no later-Spec/client/unrelated modification; `.agents/plugins/` preserved |

SC-001 through SC-007 pass in executable unit, contract, pgTAP, live integration,
live E2E, and performance evidence. The five owned tables, four ordered migrations,
RLS/grants, permission additions, ten safe events, 24 API operations, metrics,
alerts, and recovery procedures are implemented. The optional FX worker remains
absent and fails safely.

## Code and test review

- Clean Code/SOLID/DRY/KISS/YAGNI review removed unused exports, consolidated
  controller and audit arguments into bounded parameter objects, reused existing
  platform guards/errors/audit/outbox/metrics, and added no dependency, Redis,
  provider worker, or speculative later-Spec abstraction.
- Test-guard review kept real database coverage for RLS/atomicity, removed
  duplicate assertions, uses observable behavior rather than private internals,
  isolates created outbox rows, and keeps deterministic fixed data.
- No release-blocking correctness or security finding remains in the Phase 04
  diff. `git diff --check`, typecheck, lint, build, dependency audit, scoped
  formatting, tests, database, performance, and container gates pass.

## Remote evidence

- Release tag `backend-v0.4.0` at
  `81b20ac1ad468cc64540a065667cba7a17f3693a` passed workflow run
  [33268699691](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33268699691):
  application, database, sentinel-redaction, secrets, image/container/Trivy,
  CycloneDX SBOM, SLSA provenance, and all Cosign sign/attest/verify gates.
- The exact image ID and all GitHub artifact IDs, digests, and retained file
  hashes are recorded in `remote.md`.

## Remaining external evidence

- Upstream external-only SPEC-BE-002 evidence remains incomplete for Apple Team
  ID, two protected Phone OTP identities, and hosted schema-owner/non-owner plus
  provider rotation/outage rehearsals. These verified external omissions do not
  invalidate or block Phase 04 behavior; no unavailable upstream evidence is
  represented as a pass.

The Phase 04 specification, implementation, migrations, RLS/grants, audit/outbox
flows, endpoints, tests, operational evidence, pushed release tag, and signed
release artifacts satisfy its Definition of Done. No later Spec was implemented.

## 2026-09-06 Item #45 Additive DoD

The account field, minimum grants, DTO/OpenAPI/repository/event/audit mapping,
clean migration replay, focused/full automated gates, and independent review
pass locally. Slice 2 remains open only for its scoped push and remote CI evidence.
