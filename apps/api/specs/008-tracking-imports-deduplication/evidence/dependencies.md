# Dependency Evidence

All programmatic dependencies from SPEC-BE-001 through SPEC-BE-007 are present in
the synchronized `main` checkout.

| Spec        | Local task state | Phase 08 dependency conclusion                                                                                                                                                                                      |
| ----------- | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPEC-BE-001 |  178/181 checked | platform, migrations, health, config, outbox, CI, and observability are implemented; remaining draft/remote evidence wording is stale                                                                               |
| SPEC-BE-002 |  125/145 checked | identity/profile/session/RLS contracts are implemented; remaining items are controlled identities, hosted provider/RLS, outage/rotation, authenticated provider load, live alerts, and tag-only provenance evidence |
| SPEC-BE-003 |  120/120 checked | Admin RBAC, recent MFA, exact permissions, audit, support/privacy boundaries are available                                                                                                                          |
| SPEC-BE-004 |    60/60 checked | owned accounts/categories/reference-data and currency contracts are available                                                                                                                                       |
| SPEC-BE-005 |  111/111 checked | `LedgerService` transaction/update/undo commands, database duplicate fence, audit/outbox, and ledger invariants are available                                                                                       |
| SPEC-BE-006 |    90/90 checked | request replay, hashed command/idempotency primitives, fenced worker leases, and transaction sync are available                                                                                                     |
| SPEC-BE-007 |  117/117 checked | planning worker, permissioned projections, retention/recovery, and prior dependency evidence are available                                                                                                          |

Phase 08 consumes rather than duplicates these boundaries:

- owner identity uses the existing Clerk request/database context;
- accepted imports call `LedgerService.createTransaction()` and existing update or
  undo commands, never ledger tables/repository/private posting directly;
- stable source/external reference plus Phase 06 hashed idempotency protect the
  commit-before-worker-complete crash window;
- existing transaction sync observes imported ledger changes; no tracking sync
  domain is added;
- Admin routes reuse checked-in `imports.*`, `parsers.*`, and
  `settings.imports.*` permissions and `AdminAuthGuard`;
- audit/outbox limits, safe envelopes, metrics registry, privacy registry, support
  purpose, and worker shutdown conventions remain authoritative.

The documented open evidence concerns real external state: Apple Team ID and
native app registration, controlled Phone identities, hosted canonical schema/RLS,
deployed webhook/provider credentials and URLs, provider outage/rotation drills,
authenticated provider HTTP load, live dashboard/alert routing, registry images,
and tag-only SBOM/signature/provenance. None prevents local Phase 08 normalized,
manual, CSV, schema, RLS, API, worker, ledger, client, security, recovery, or
performance work.
