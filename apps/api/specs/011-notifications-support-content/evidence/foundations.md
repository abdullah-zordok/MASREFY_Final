# Foundations

Phase 11 adds four ordered, forward-only migrations, seven pgTAP files, 14 owned
tables, least-privilege functions/RLS/grants, immutable migration checksums, and
one Nest engagement module shared by the API and worker. Scope tests reject
SPEC-BE-012+ resources and reuse the existing auth, audit, outbox, idempotency,
rate-limit, Storage, queue, and observability seams.

Local TypeScript, lint, module-contract, configuration, scope, and checksum checks
pass. A clean database reset applied every migration through Phase 11; schema lint
returned zero issues and all 50 pgTAP files (1,615 assertions) passed.
