# US2 — Bootstrap Evidence

- `npm run test:sync:logic`: sync unit/contract/e2e path passed (19 suites, 64 tests; recovery suite intentionally environment-gated in that run).
- `npm run typecheck` in `apps/api`: passed.
- Mobile focused run covering `database`, `sync-database`, `sync-repository`, `sync-delta`, `sync-tombstones`, `sync-conflicts`, HTTP boundary, and conflict screen: 8 suites, 16 tests passed; Mobile typecheck and scoped lint passed.
- Live `delta.integration.spec.ts`: owner bootstrap returned only the owner account and the domain starting cursor; the foreign owner's row was absent.
- `sync-database.test.ts` and `sync-sqlite-migration.integration.test.ts`: populated schema v9 account data remained unchanged while v10 added `sync_state`, `sync_mutation_queue`, `sync_id_mappings`, and version/tombstone state in `sync_resource_state`.
- Legacy money conversion uses each currency's exact minor-unit scale; an ambiguous value remains intact and is flagged `legacy_amount_review_required` instead of being rounded or dropped.
- Regression: a server bootstrap upsert mapped to a pending local ID is skipped, so pending local work cannot be overwritten.

Result: PASS. No database wipe, primary-key rewrite, or Admin sync integration was introduced.
