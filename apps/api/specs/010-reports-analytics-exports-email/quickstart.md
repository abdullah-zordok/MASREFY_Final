# Quickstart: Validate SPEC-BE-010

Run from the repository root unless a command uses `--prefix`.

## 1. Baseline and scope

```powershell
git fetch origin --prune
git rev-parse main
git rev-parse origin/main
git status --short --branch
```

Expected: both revisions match before implementation; only the three protected
untracked paths plus SPEC-BE-010 work are present.

## 2. API static and focused tests

```powershell
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test:reports:unit
npm --prefix apps/api run test:reports:contract
npm --prefix apps/api run build
```

Expected: zero error, no OpenAPI/internal/event/client drift, no secret output.

## 3. Database, RLS and live behavior

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run test:reports:integration
npm --prefix apps/api run test:reports:security
npm --prefix apps/api run test:reports:recovery
```

Expected: clean migration/checksum; both views reconcile; owner/non-owner/Admin/
support/worker matrices pass; concurrent mutation yields one consistent snapshot;
schedule, Storage, expiry and worker recovery produce no duplicate effect.

## 4. SMTP, output and performance

```powershell
npm --prefix apps/api run test:reports:smtp
npm --prefix apps/api run test:performance:reports
npm --prefix apps/api run test:stress:reports
```

Expected: local TLS SMTP accept/reject/auth/timeout/replay passes with stable
Message-ID; CSV/PDF hostile fixtures are inert; Home <=400/800 ms P95/P99 and
250 KB, cached summaries <=800/1500 ms and 300 KB, async acceptance <=300 ms,
query plans and peak memory are bounded.

Local SMTP acceptance is protocol evidence only. It is not real provider or inbox
evidence.

## 5. Mobile and Admin parity

```powershell
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile test -- --runInBand
npm --prefix apps/admin-web run typecheck
npm --prefix apps/admin-web run lint
npm --prefix apps/admin-web test
npm --prefix apps/admin-web run build
npm --prefix apps/admin-web exec playwright test tests/e2e/overview-analytics.spec.ts
```

Expected: Phase 10 live adapter/contracts and focused UI pass; signed URLs are not
persisted; explicit mock/demo remains; production provider cutover is unchanged.

## 6. Full local release

```powershell
npm --prefix apps/api run verify
npm --prefix apps/api run security:scope
npm --prefix apps/api run test:release-image
git diff --check
git status --short
```

Expected: all applicable tests, audit, checksums, container/non-root and scoped
diff gates pass with zero open Critical/High finding.

## 7. Delivery evidence

Commit narrow verified packages directly on `main`, push to `origin/main`, and
monitor every Backend Foundation run to terminal success. Record implementation
and closeout SHAs, exact counts/results, reconciliation/performance evidence,
SMTP/security/privacy/recovery results, and only genuine external provider/
hosted-alert/release-tag gates. Confirm SPEC-BE-011+ remains absent.
