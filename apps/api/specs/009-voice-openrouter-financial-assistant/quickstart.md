# Phase 09 Verification Quickstart

Run from the repository root with Node 24, Docker, and Supabase CLI available.
The feature-specific commands added by implementation are authoritative; the full
repository gates remain mandatory.

```powershell
npm --prefix apps/api ci
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test:ai:logic
npm --prefix apps/api run test:ai:integration
npm --prefix apps/api run test:ai:security
npm --prefix apps/api run test:ai:recovery
npm --prefix apps/api run test:performance:ai
npm --prefix apps/api run test:stress:ai
npm --prefix apps/api run verify
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run test -- --runInBand
npm --prefix apps/admin-web run lint
npm --prefix apps/admin-web run typecheck
npm --prefix apps/admin-web run test -- --run
npm --prefix apps/admin-web run build
```

When a usable `OPENROUTER_API_KEY` and reviewed account policy are supplied in an
isolated nonproduction environment, run the explicitly opt-in live evaluation
command. Never print the key or provider content. Absence of the key records the
external provider gate as pending; it does not make the live evaluation pass.

Required retained evidence includes:

- exact 20-table inventory, constraints, indexes, forced RLS and grant matrix;
- strict OpenAPI/provider schema parsing and Mobile/Admin contract parity;
- Arabic/English/noisy voice and assistant evaluation corpus results;
- owner/nonowner/Admin/worker authorization and consent/revocation races;
- proposal/preview edit, expiry, confirmation replay/concurrency, and proof that
  only existing domain commands can mutate finance;
- prompt injection/tool/SQL/URL attempts, data minimization/redaction, ZDR,
  no-training, allowlist, fallback-equivalence, and secret scans;
- five-per-24-hour quota, 70/85/95 once-only alerts, 100 percent pre-call stop,
  accounting reconciliation, circuit/outage, timeout, cancellation, and recovery;
- media upload/object ownership, duration/size/type, eager/expiry purge, and orphan
  reconciliation;
- million-row SQL plans, k6 latency/payload/memory/connection thresholds;
- clean/repeat/N-1/failed-forward migration, backup/restore, route/prompt rollback,
  privacy export/deletion, non-root image, CI, SBOM/signature/provenance where run.

Live provider endpoints, hosted identities/alerts, registry attestations, and
production approval remain genuine external gates only. All local mock-provider,
database, worker, client, security, recovery, and performance gates still run.
