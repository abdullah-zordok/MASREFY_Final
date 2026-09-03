# Dependency Evidence

Programmatic prerequisites from SPEC-BE-001..008 are present at the baseline:

| Consumed boundary                        | Evidence                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| database transaction/config              | `apps/api/src/platform/database`, `platform/config`                               |
| outbox enqueue/claim/worker              | `apps/api/src/platform/outbox`; `private.enqueue_outbox_event` migrations         |
| private Storage pattern                  | `tracking.storage.ts`, `export-storage.ts`, Phase 08 bucket migration             |
| identities/locales/devices               | `apps/api/src/identity` and identity migrations                                   |
| Admin exact permission/recent-auth/audit | `admin-auth.guard.ts`, `permission-manifest.ts`, security repository/migrations   |
| privacy export/deletion registry         | `privacy-handlers.ts`, `security.worker.ts`                                       |
| reference currency/category/account      | `apps/api/src/reference` and reference tables/functions                           |
| ledger financial mutation                | exported `LedgerService` and Phase 05 command migrations                          |
| replay/idempotency                       | ledger repository calls `private.claim_idempotency_key`; Phase 06 sync boundaries |
| planning domain commands/evidence        | exported `PlanningService`, Phase 07 functions                                    |
| tracking proposal/review context         | exported `TrackingService`, Phase 08 functions/storage/workers                    |

Search evidence located exported `LedgerService`, `PlanningService`,
`TrackingService`, `SyncService`, the idempotency claim, outbox enqueue, Admin
guard, and privacy registry. Phase 09 consumes these contracts and adds no direct
financial table mutation, second idempotency store, outbox implementation,
generalized queue, or Storage client.

Prior task ledgers 001/002 retain external/provider or stale closeout items, while
the executable dependency code and later successful phases prove the programmatic
boundaries required here. Phase 09 does not rewrite their ledgers.
