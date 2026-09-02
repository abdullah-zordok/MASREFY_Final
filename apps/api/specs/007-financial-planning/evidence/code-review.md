# Phase 07 Independent Code and Security Review

Date: 2026-09-01

Scope: the stable Phase 07 working-tree diff against `2eeb00bdc6687602c2fb807b88eeb1f71bfc5807`, including 29 production/config/contract/mobile/migration inventory items.

Codex Security scan: `903a515c-bab6-447f-838d-c51a7139801d` (completed and sealed). The scan reviewed every inventory item, validated three security candidates, reported one Low finding, and recorded six covered security surfaces.

## Findings and dispositions

| Finding | Disposition | Red-first regression and verification |
|---|---|---|
| `masarifi_api` could execute the worker-only salary receipt generator without binding its supplied owner id to the JWT subject. | Fixed. Removed the API-role execute grant; retained the worker grant. | New pgTAP privilege assertions failed before the migration fix and pass after a clean reset. |
| Planning job effects could run after lease expiry because only completion checked the fence. | Fixed as an integrity defect. Execution now locks and validates the exact claim id/token/job/resource, and execution plus successful completion share one transaction so stale or expired work rolls back. | Worker unit expectations failed first; exact SQL signature/fence pgTAP and stale-claim live integration coverage pass at their applicable gates. |
| Full planning sync snapshots were forwarded to the shared event publisher. | Fixed as data minimization hardening. The generic envelope builder removes the internal top-level `sync` field from a copy while preserving the durable outbox row for device delta reads. | The new envelope test failed first, then passed with all prior envelope tests. |
| Planning optimistic-version conflicts retried until exhaustion instead of rejecting explicitly. | Fixed as offline correctness. `PLANNING_VERSION_CONFLICT` is terminal and returned as the rejection reason. | The new sync worker test failed first, then passed without scheduling a retry. |
| Admin purpose wording existed in a secondary mapping artifact while the normative spec requires `planning.read`. | Deferred to T105 artifact convergence; this is not an authorization defect in the implemented route. | Primary spec and SQL permission check agree on `planning.read`. |

## Fresh verification

```text
npx jest --runInBand test/unit/outbox/event-envelope.spec.ts test/unit/sync/sync.worker.spec.ts test/unit/planning/planning.worker.spec.ts
  -> 3 suites, 17 tests passed
npx eslint <changed review files>
  -> PASS
npx tsc --noEmit
  -> PASS
npx supabase db reset --workdir ../..
  -> PASS; all Phase 07 migrations applied from scratch
npx supabase test db --workdir ../..
  -> 32 files, 1,013 assertions passed
```

Result: PASS. The reported Low finding and every verified in-scope hardening/correctness finding are fixed with regression coverage; no unresolved review finding remains.
