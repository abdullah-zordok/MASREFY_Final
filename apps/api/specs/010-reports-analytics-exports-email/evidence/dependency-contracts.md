# Reused Dependency Contracts

Phase 10 verified these existing contracts before implementation:

- Platform configuration, database transaction, outbox, worker, cache, HTTP
  validation, observability, and Storage clients under `apps/api/src/platform/`.
- Identity subject, authentication, recent-auth, and Clerk webhook boundaries
  under `apps/api/src/identity/`.
- Admin permissions, support grants, audit, privacy export Storage pattern, and
  redaction under `apps/api/src/security/`.
- Currency/category/account contracts under `apps/api/src/reference/`.
- Posting truth, balance summary, and ledger version under
  `apps/api/src/ledger/`.
- Idempotency and sync conflict behavior under `apps/api/src/sync/` and shared
  platform modules.
- Salary, budget, obligation, and savings projections under
  `apps/api/src/planning/`.
- Tracking freshness under `apps/api/src/tracking/` and optional safe AI evidence
  under `apps/api/src/ai/`.
- Mobile `ReportsService` and report domain contracts under
  `apps/mobile/src/services/contracts/reports-service.ts` and
  `apps/mobile/src/domain/reports.ts`.
- Admin overview schemas and routes under
  `apps/admin-web/src/features/overview/` and its authoritative Phase 002
  OpenAPI contract.

All paths and named modules were resolved with `rg --files`/`rg`; Phase 10 adds
no parallel auth, queue, audit, Storage, cache, support, or financial-truth
infrastructure.
