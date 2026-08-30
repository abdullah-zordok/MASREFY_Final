# Phase 05 Local Release Evidence

Date: 2026-08-30 (Asia/Riyadh)
Branch: `codex/spec-be-005`
Database: disposable local Supabase PostgreSQL 17
Image: `masarifi-backend:spec-be-001`

## Final gate results

| Gate | Final result | Exact evidence |
|---|---|---|
| Formatting | PASS | `npm run format:check`; all matched files use Prettier style |
| TypeScript | PASS | `npm run typecheck`; 0 errors |
| ESLint | PASS | `npm run lint`; 0 errors/warnings |
| k6 syntax | PASS | `npm run perf:check`; 10 scripts parsed |
| Unit | PASS | 56 suites, 445 tests passed; 0 failed/skipped |
| Contract/OpenAPI | PASS | 32 suites, 119 tests passed; 0 failed/skipped |
| Full live integration | PASS | 41 suites, 100 tests passed; 0 failed/skipped |
| Focused ledger integration/concurrency | PASS | 10 suites, 30 tests passed; 0 failed/skipped |
| Full live E2E | PASS | 29 suites, 46 tests passed; 0 failed/skipped |
| Migration E2E | PASS | 4 suites, 4 tests passed; apply/checksum/concurrency/backup |
| Ledger recovery | PASS | 2 suites, 6 tests passed; backup plus 5 recovery cases |
| Full live security | PASS | 16 suites, 86 tests passed; 0 failed/skipped |
| Focused ledger security | PASS | 2 suites, 15 tests passed; 0 failed/skipped |
| Fresh database | PASS | `npm run db:reset`; all ordered migrations applied from empty state |
| Database lint | PASS | `npm run db:lint`; 0 findings in `public`, `private`, `audit` |
| pgTAP | PASS | 22 files, 606 tests passed; 0 failed |
| Ledger performance | PASS | 55,079 checks/operations passed, 0 failed/errors, 1,808.80 ops/s; detailed percentiles in `performance.md` |
| Build | PASS | API, worker, and migration Nest targets built |
| Migration checksums | PASS | all checksums verified |
| Dependency audit | PASS | `npm audit --audit-level=high`; 0 vulnerabilities |
| Image/container | PASS | rebuilt image; 7 suites, 19 tests passed; 0 failed/skipped |
| Diff hygiene | PASS | `git diff --check`; 0 whitespace errors |

The local image ID/digest is
`sha256:659828a970e4b4cb30a99ec623d5a58a231200453fa8879dde77c24cdae3a578`.
The immutable tag workflow remains authoritative for registry scan, CycloneDX
SBOM, Sigstore signature, SLSA provenance, and attestations.

## Resolved red-to-green diagnostics

- Static gates initially exposed Phase 05 lint/type debt and a Windows CRLF-only
  Prettier failure. Type-safe fixes were applied; `endOfLine: auto` made the
  existing formatter portable without rewriting unrelated files; all final
  static gates pass.
- Contract composition initially rejected a conflicting idempotency parameter,
  validation response, and scalar `Currency` name. Phase 05 now reuses the
  platform idempotency alphabet and `CurrencyCode`, and namespaces its response;
  the focused and full contract reruns pass.
- Full integration initially exposed an outbox fixture that could claim unrelated
  rows and a query-count wrapper that dropped the database promise. Both test
  boundaries were corrected without weakening assertions; the focused 2/4 and
  full 41/97 reruns pass.
- The final performance run initially rejected PostgreSQL's bounded sequential
  scan of a 251-row dimension. The guard now rejects sequential scans only on
  the 100k/200k fact tables and has a dedicated two-test unit check; the final
  load run passes.
- The final contract audit found that stale-write responses omitted the current
  authoritative row version. Service prechecks and database race failures now
  return the same sanitized `currentVersion`; focused unit, HTTP E2E, clean
  migration, and live concurrent-revision checks pass.
- Independent review then exposed Admin-promotion access, replay ordering,
  refund lifecycle, historical-account projection, canonical hash, overflow
  error, client mapping, and dashboard-label gaps. Each was reproduced red-first,
  fixed at the shared boundary, and covered by the refreshed counts above.
- One full-suite run exposed a pre-existing probabilistic ciphertext tamper
  fixture whose last Base64 character can preserve decoded bytes. It was
  diagnosed without changing unrelated Phase 02 files; the exact Phase 05 tree
  subsequently passed the complete live security suite 16/86.

## Skips and external-only evidence

Final live Jest/pgTAP/container suites contain zero skips. The previously
documented SPEC-BE-002 Apple registration, protected Phone identities/full
three-user matrix, hosted canonical-schema proof, provider rotation/outage,
deployed webhook secret/URL, and protected historical release evidence remain
external-only and are not counted above. Phase 05 protected-tag scan/SBOM/
signature/provenance/attestation evidence is collected only by T109-T110 after
the exact committed revision passes main CI.
