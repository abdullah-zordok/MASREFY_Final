# Masarifi Staging Setup and Acceptance Guide

Last reviewed: 2026-09-23

Canonical repository: `masarifiratibi-spec/masarifi.ratibi_app`

Accepted runtime SHA: `6a2beb83420ac3c6fd19b42c18b42257ae4f97b8`

Execution plan: [2026-09-22-masarifi-staging-environment](../superpowers/plans/2026-09-22-masarifi-staging-environment.md)

Repository workflow evidence: [Backend Foundation run 35790588649](https://github.com/masarifiratibi-spec/masarifi.ratibi_app/actions/runs/35790588649) (release-critical jobs passed; tag-only signing skipped)

This is the operator checklist and redacted evidence ledger for staging work. It does not authorize a production deployment. Replace every `<PLACEHOLDER>` locally; never paste a secret into Git, a ticket, a pull request, CI output, or this document.

## Priority and readiness definitions

| Label | Meaning |
| --- | --- |
| **BLOCKING (P0)** | Must pass before the shared staging environment can be called configured or verified. |
| **REQUIRED (P1)** | Required before staging acceptance or a repeatable release, but can follow the first isolated bring-up. |
| **RECOMMENDED (P2)** | Risk reduction that is not required for the first controlled staging slice. |
| **OPTIONAL** | Useful only when the related optional provider/path is enabled. |

| Readiness state | Current state | Exit condition |
| --- | --- | --- |
| **CODE READY** | Yes | Repository lint, typecheck, tests, builds, migrations, contract checks, and image checks pass on the accepted SHA. |
| **CI READY** | Yes, with governance work pending | Required jobs pass on the accepted staging SHA. Protect `main` before relying on CI as a merge gate. |
| **STAGING CONFIGURED** | No | Separate hosted identity/database resources, VPS services, provider credentials, EAS environments, TLS, and observability are configured. |
| **STAGING VERIFIED** | No | Section 19 passes on the same immutable release and its evidence is retained. |
| **CLIENT APK READY** | No | A signed internal Android build from the accepted SHA passes physical-device acceptance. |
| **PRODUCTION READY** | Out of scope | Staging acceptance, public-store permission decisions, production isolation, DR, monitoring, signing, and rollback evidence all pass. |

Current repository verdict is **READY WITH CONDITIONS**. The system is not yet staging configured or staging verified.

## 1. Freeze the staging release and evidence

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0)** | One immutable SHA and image digest must identify every service. Mutable branches or tags make rollback and incident correlation unreliable. | Canonical GitHub repository, Actions, image registry, VPS | Record the accepted commit SHA. Build/publish one backend image and deploy it by digest, never by `latest`. Record Admin and EAS build commit metadata. | `git rev-parse HEAD`; registry digest; API `/health/live` release value; EAS build details; Admin release metadata all name the same SHA. |
| **REQUIRED (P1)** | External evidence is not stored yet. | A restricted release record outside Git, plus redacted links in the Phase 14 evidence files | Create an evidence folder named with the release SHA. Store screenshots/exports without tokens, passwords, user PII, SMS text, or audio. | A reviewer can trace every Section 19 row to dated evidence and an owner. |

Before any external action:

```powershell
git fetch ratibi
git status --short
git rev-parse HEAD
gh run view 35790588649 --repo masarifiratibi-spec/masarifi.ratibi_app
```

Expected: clean worktree, the accepted SHA, and all repository release jobs passing. `signed-release-evidence` may be skipped because it is intentionally limited to authorized `backend-v*` tags.

Run `35790588649` built CI-local image ID `sha256:e6c823226deb63030108e09065cc52638e62d769485caa35bf3a145923fa45bd`, passed all 10 container suites, and passed Trivy with zero fixable High/Critical findings. The [image-evidence artifact](https://github.com/masarifiratibi-spec/masarifi.ratibi_app/actions/runs/35790588649/artifacts/10722668878) records that local image ID. It is not a registry digest and must not be deployed until an authorized registry publish produces an immutable pullable digest.

## 2. Hosted Supabase staging project

Official references: [environment management](https://supabase.com/docs/guides/deployment/managing-environments), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), and [backups](https://supabase.com/docs/guides/platform/backups).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **PASS** | An isolated hosted staging project exists with no production users or data. | Supabase organization `masarif_Rratibi` → project `Masarifi Staging` | Keep project ref `qcffvfbpzvpwcwxwjyro` restricted to staging configuration. Region is `eu-central-1`; plan is Free. | Connector inventory on 2026-09-22 returned one organization, no prior projects, then project status `ACTIVE_HEALTHY`. |
| **PASS** | All canonical migrations are applied to hosted staging. | Supabase migration history | Keep hosted history aligned with the timestamped files; never use `db reset --linked`. | Remote history has exactly 70 entries matching `supabase/migrations` by version and name, with no missing or extra migration. Latest: `20260922220434_refresh_voice_zdr_models`. |
| **PASS (credential activation pending host)** | Separate least-privilege API and worker login roles exist, but intentionally have no password until a restricted VPS secret store is available. | Hosted Supabase project `qcffvfbpzvpwcwxwjyro` | Set separate generated passwords only through the restricted host secret workflow, then use the session/direct connection string for each process. | `masarifi_api_login` and `masarifi_worker_login` are `LOGIN NOINHERIT`, non-owner, non-superuser roles without create-db/create-role/replication/`BYPASSRLS`; passwords are unset. Each can `SET ROLE` only to its matching repository role and cannot set the migration or sibling runtime role. |
| **BLOCKING (P0)** | Hosted RLS owner isolation is proven, but the separate Clerk staging tenant, third-party trust, real tokens, webhook, and Admin authorization remain pending. | Supabase dashboard → Authentication → Third-Party Auth; Clerk staging application; staging API | Add the separate staging Clerk domain, then run token, webhook, and Admin tests through the deployed API. | Rollback-only SQL proof: Owner A saw only A, Owner B saw only B, and a missing subject saw no rows. Follow-up confirmed zero test rows. Real Clerk/API evidence remains required. |
| **REQUIRED (P1)** | Backup and restore evidence is missing. Supabase Free has no automatic backups or PITR; database backups do not include Storage objects. | Supabase dashboard; isolated restore target | On Free, take encrypted off-host logical database and separate private Storage backups, then restore to an isolated target. Use PITR only if an already authorized paid plan provides it. | Measured RPO/RTO, row/count reconciliation, application smoke results, and Storage recovery evidence; PITR marked `BLOCKED` if unavailable. |

On 2026-09-23 Supabase quoted an isolated database branch at USD `0.01344/hour`. No branch was created because that would incur a recurring charge; branch-based restore testing remains a billing-approval gate.

Hosted structural evidence captured on 2026-09-22 and refreshed on 2026-09-23:

- Supabase security advisors returned zero lints.
- No `SECURITY DEFINER` function in `public`, `private`, or `audit` is executable by `PUBLIC`; the two tracking guard triggers remain enabled while `anon`, `authenticated`, `service_role`, API, and worker roles cannot execute their trigger functions directly.
- All public tables have RLS enabled; 296 policies are installed.
- `report-exports`, `support-attachments`, `tracking-imports`, and `voice-temp` are private buckets.
- `masarifi_api`, `masarifi_worker`, and `masarifi_migration` are `NOLOGIN`, `NOINHERIT`, non-owner group roles without superuser, database/role creation, replication, or `BYPASSRLS` attributes.
- `masarifi_api_login` and `masarifi_worker_login` are matching `LOGIN NOINHERIT` roles with the same restricted attributes. They have no passwords yet, cannot assume each other or `masarifi_migration`, and remain unusable externally until separate credentials are generated directly into the restricted VPS environment.
- `private.sync_cursor_positions` intentionally has RLS disabled, but both `anon` and `authenticated` lack schema usage and every table privilege. Supabase security advisors therefore report no security lint; do not enable RLS without first defining the worker-only access policy.
- Performance advisors reported informational unused-index and unindexed-foreign-key findings on a new, empty database plus six multiple-permissive-policy warnings. These are not being changed without staging workload evidence because several policies encode distinct authorization paths.
- API/Admin/Mobile protected-route checks passed locally: API unit 23/23, API security 15/15, Admin proxy contract 7/7, and Mobile auth/session 39/39.

Safe migration sequence using the repository-pinned Supabase CLI (`2.116.0`):

```powershell
Set-Location apps/api
npm ci --ignore-scripts
npm run migration:checksums
npx --no-install supabase login
npx --no-install supabase projects list
npx --no-install supabase link --workdir ../.. --project-ref <STAGING_PROJECT_REF>
npx --no-install supabase migration list --workdir ../.. --linked
npx --no-install supabase db push --workdir ../.. --dry-run --linked
npx --no-install supabase db lint --workdir ../.. --linked --schema public,private,audit --level error --fail-on error
npm run supabase:start
npm run db:reset
npm run test:db
npm run supabase:stop
```

`migration:checksums` must report no drift, `migration list` must show repository migrations in the same order as remote history, and the dry run must contain only the intended pending migrations. Local pgTAP asserts required extensions (including `pgcrypto` and `pgmq`), schemas, owners/grants, RLS, functions, fixed function search paths, triggers, constraints, and named indexes. Run mutating pgTAP cases only on a disposable database; use read-only structural queries and controlled owner-isolation tests on hosted staging. Retain the full output. Inspect Supabase Database → Extensions and Database → Tables/Policies for unexpected objects or disabled RLS; do not make dashboard-only schema edits.

This repository has no Supabase Edge Function secret contract. Do not invent Supabase secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are backend runtime inputs stored on the VPS; only the Clerk third-party-auth trust is configured in the Supabase dashboard. Clerk remains the identity system of record; Supabase validates Clerk tokens for RLS instead of creating a second native Supabase Auth identity.

After the dry run/lint/tests pass, execute the accepted image on the staging VPS:

```bash
docker run --rm --env-file /etc/masarifi/migration.env <REGISTRY>/<IMAGE>@sha256:<DIGEST> dist/src/migration.js
```

The migration environment contains only `NODE_ENV=production`, `MASARIFI_PROCESS_KIND=migration`, `MASARIFI_RELEASE_VERSION=<ACCEPTED_SHA>`, the staging owner/session `DATABASE_URL`, and migration checksum/timeout settings. Do not provide `SUPABASE_SERVICE_ROLE_KEY` to the migration process.

Create runtime logins once, using a direct/session connection and PostgreSQL 17:

```sql
create role masarifi_api_login login noinherit nobypassrls;
grant masarifi_api to masarifi_api_login with inherit false, set true;
create role masarifi_worker_login login noinherit nobypassrls;
grant masarifi_worker to masarifi_worker_login with inherit false, set true;
```

Immediately set both passwords with interactive `\password masarifi_api_login` and `\password masarifi_worker_login`. Store the resulting API and worker URLs only in `/etc/masarifi/api.env` and `/etc/masarifi/worker.env`, mode `0600`. Use the session pooler or direct database endpoint; do not use transaction pooling for migration DDL/advisory locks.

Verify without printing passwords:

```sql
select rolname, rolsuper, rolbypassrls, rolcanlogin
from pg_roles
where rolname in ('masarifi_api_login', 'masarifi_worker_login');

begin;
set local role masarifi_api;
select current_role;
rollback;
```

Repeat the transaction with the worker login and `masarifi_worker`. Before starting services, visually confirm the database hostname/project reference is staging, not production.

## 3. Clerk staging identity

Official references: [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [environment variables](https://clerk.com/docs/guides/development/clerk-environment-variables), [key rotation](https://clerk.com/docs/guides/secure/rotate-api-keys), and [Supabase Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0), partial foundation exists** | A separate `Masarifi Staging` application and Production instance exist, and Clerk's Supabase compatibility claim is enabled. The `project-rvui9.vercel.app` primary domain is still unverified because its `/__clerk` proxy is not deployed. Supabase rejects that path-based proxy URL and requires `https://clerk.<owned-domain>` for Production; using the development issuer would fail the repository's production-key checks and weaken staging fidelity. | Clerk Production instance → Domains; Supabase → Third-Party Auth | Obtain an owned staging domain in the next phase, configure and verify its `clerk` CNAME, then register that exact HTTPS issuer in Supabase. Do not bypass Supabase validation or switch to development keys. | Clerk domain is Verified; Supabase lists the Production issuer; staging-only users authenticate and do not exist in production; startup/build accepts live-prefixed keys. |
| **BLOCKING (P0)** | Required token claim and allowed parties are not configured. | Clerk dashboard → Sessions/token customization; VPS API env | Add `role: authenticated`. Set `CLERK_INSTANCE_DOMAIN` to the hostname only and `CLERK_AUTHORIZED_PARTIES` to the exact HTTPS Admin staging origin(s). | A valid Admin/mobile token succeeds; wrong issuer, expired/revoked token, and unapproved `azp` fail. Native tokens without `azp` remain supported by the repository verifier. |
| **BLOCKING (P0)** | Webhook synchronization is not connected. | Clerk dashboard → Webhooks | Endpoint: `https://<STAGING_API_HOST>/webhooks/clerk`. Subscribe only to `user.created`, `user.updated`, and `user.deleted`. Store the signing secret only in API env. | Create/update/delete a staging user; webhook delivery is 2xx; profile state changes once; replay/invalid signature is rejected or safely deduplicated. |
| **REQUIRED (P1)** | MFA/recent-auth and provider flows lack real acceptance evidence. | Staging Clerk application and Admin app | Enable the approved Phone and Google methods. Use test accounts/numbers allowed by Clerk. Exercise OTP expiry, refresh, revocation, MFA, and recent-auth. | Dated screenshots/log correlations without OTPs or PII. |

Do not copy the development Clerk domain from `supabase/config.toml` into hosted staging. Rotate any credential exposed during setup using Clerk's key-rotation procedure.

## 4. API, worker, and migration environment contracts

Store API, worker, and migration values separately in `/etc/masarifi/api.env`, `/etc/masarifi/worker.env`, and `/etc/masarifi/migration.env`, owned by the service account with mode `0600`. Public client values belong in EAS/VPS build environments, not these files. The table includes every key documented by `apps/api/.env.example`.

Classification rule: a row explicitly marked `secret` is confidential VPS environment data; every other backend row is internal non-secret configuration in the named process file, not a browser/mobile public value. The only public values in this guide are explicitly identified in the Admin and Mobile sections. No generic runtime rate-limit environment variable exists: ledger/planning limits, AI quotas, payload limits, batch sizes, and provider controls are implemented in the existing code/database contracts. Do not invent a `RATE_LIMIT` variable; verify the documented 409/429 behavior and metrics through staging tests.

### Core, HTTP, database, logging, and migration

| Variable | Process / storage | Priority and staging value rule | Verification |
| --- | --- | --- | --- |
| `NODE_ENV` | All backend env files | **BLOCKING** — `production` | Startup logs show production mode without debug output. |
| `MASARIFI_PROCESS_KIND` | Separate per process | **BLOCKING** — exactly `api`, `worker`, or `migration` | Wrong/missing kind fails startup. |
| `MASARIFI_RELEASE_VERSION` | All | **BLOCKING** — accepted immutable SHA | Health/log metadata matches deployed release. |
| `MASARIFI_META_MIN_ADMIN_VERSION` | API | **RECOMMENDED** — approved minimum Admin build | Older build receives the intended upgrade contract. |
| `MASARIFI_META_MIN_MOBILE_VERSION` | API | **RECOMMENDED** — approved minimum Mobile build | Older build receives the intended upgrade contract. |
| `MASARIFI_HTTP_PORT` | API | **REQUIRED** — `3000` unless the private listener changes | `GET /health/live` works on loopback. |
| `MASARIFI_CORS_ORIGINS` | API | **BLOCKING** — exact HTTPS staging Admin origin(s), comma-separated | Allowed origin succeeds; wildcard, HTTP, localhost, and foreign origin fail. |
| `MASARIFI_HTTP_BODY_LIMIT_BYTES` | API | **REQUIRED** — keep `262144` unless a tested route requires less/more | Oversized request returns the documented error without memory growth. |
| `MASARIFI_REQUEST_TIMEOUT_MS` | API | **REQUIRED** — keep `10000` initially | Slow dependency produces bounded timeout/error mapping. |
| `MASARIFI_READINESS_TIMEOUT_MS` | API | **REQUIRED** — keep `1000` initially | Failed DB dependency makes readiness return 503 promptly. |
| `MASARIFI_READINESS_CACHE_TTL_MS` | API | **REQUIRED** — keep `5000` initially | Readiness recovers after dependency recovery within the TTL. |
| `MASARIFI_DATABASE_POOL_MAX` | API/worker | **REQUIRED** — start at `10` per process; confirm total below Supabase limit | Pool saturation test and Supabase connection count stay within budget. |
| `MASARIFI_SHUTDOWN_TIMEOUT_MS` | API/worker | **REQUIRED** — keep `30000` initially | SIGTERM drains/ends within the orchestrator grace period. |
| `DATABASE_URL` | Separate secret for API, worker, migration | **BLOCKING** — staging only; API/worker non-owner logins, migration owner/session URL | Host/project is staging; role tests in Section 2 pass; value never appears in logs. |
| `MASARIFI_LOG_LEVEL` | API/worker | **REQUIRED** — `info`; production rejects `debug` | JSON logs are useful and redact secrets/PII. |
| `MASARIFI_MIGRATION_CHECKSUM_FILE` | Migration | **BLOCKING** — `supabase/migration-checksums.sha256` | Migration runner validates every checksum. |
| `MASARIFI_MIGRATION_STATEMENT_TIMEOUT_MS` | Migration | **REQUIRED** — keep `120000` initially | Long/blocked migration aborts safely and releases lock. |

### Queues and synchronization

| Variable | Process / storage | Priority and staging value rule | Verification |
| --- | --- | --- | --- |
| `MASARIFI_OUTBOX_BATCH_SIZE` | Worker | **REQUIRED** — `50` | Canary outbox items process once and backlog drains. |
| `MASARIFI_WORKER_ID` | Worker | **REQUIRED** — stable unique ID such as the staging host/service name, not a secret | Lease/audit records identify the worker; two workers use different IDs. |
| `MASARIFI_OUTBOX_LEASE_SECONDS` | Worker | **REQUIRED** — `30` | Killed worker's lease is reclaimed without duplicate effect. |
| `MASARIFI_OUTBOX_POLL_MS` | Worker | **REQUIRED** — `500` | Expected dispatch latency without DB saturation. |
| `MASARIFI_OUTBOX_MAX_ATTEMPTS` | Worker | **REQUIRED** — `10` | Poison item reaches terminal handling and alerts. |
| `MASARIFI_OUTBOX_RETRY_BASE_SECONDS` | Worker | **REQUIRED** — `1` | Retry intervals are exponential. |
| `MASARIFI_OUTBOX_RETRY_MAX_SECONDS` | Worker | **REQUIRED** — `300` | Backoff caps at five minutes. |
| `MASARIFI_OUTBOX_RETRY_JITTER_MS` | Worker | **REQUIRED** — `1000` | Concurrent retries are de-correlated. |
| `MASARIFI_SYNC_BATCH_SIZE` | Worker | **REQUIRED** — `100` | Offline queue batch completes within lease. |
| `MASARIFI_SYNC_DELTA_LIMIT` | API | **REQUIRED** — `500` | Pagination/delta boundary behaves per contract. |
| `MASARIFI_SYNC_PAYLOAD_LIMIT_BYTES` | API | **REQUIRED** — `524288` | Oversized sync payload is rejected. |
| `MASARIFI_SYNC_LEASE_SECONDS` | Worker | **REQUIRED** — `60` | Crash/retry reclaims work without double ledger mutation. |
| `MASARIFI_SYNC_POLL_MS` | Worker | **REQUIRED** — `500` | Queue latency is acceptable. |
| `MASARIFI_SYNC_MAX_ATTEMPTS` | Worker | **REQUIRED** — `10` | Poison sync item becomes visible/alertable. |
| `MASARIFI_SYNC_RETRY_BASE_SECONDS` | Worker | **REQUIRED** — `1` | Retry cadence is correct. |
| `MASARIFI_SYNC_RETRY_MAX_SECONDS` | Worker | **REQUIRED** — `300` | Retry cap is respected. |
| `MASARIFI_SYNC_RETRY_JITTER_MS` | Worker | **REQUIRED** — `1000` | Retries are de-correlated. |
| `MASARIFI_SYNC_RETENTION_DAYS` | Worker | **REQUIRED** — `30` | Retention job removes only expired sync records. |

### Identity, authorization, privacy, and storage

| Variable | Process / storage | Priority and staging value rule | Verification |
| --- | --- | --- | --- |
| `CLERK_PUBLISHABLE_KEY` | API | **BLOCKING** — staging Clerk Production-instance publishable key | Production-mode startup passes; key prefix is valid. |
| `CLERK_SECRET_KEY` | API/worker secret | **BLOCKING** — staging Clerk secret, never Mobile/Admin public config | Auth/reconciliation work; secret is redacted. |
| `CLERK_INSTANCE_DOMAIN` | API | **BLOCKING** — staging Clerk hostname only | Wrong issuer is rejected. |
| `CLERK_AUTHORIZED_PARTIES` | API | **BLOCKING** — exact HTTPS Admin staging origin(s) | Unapproved browser party is rejected. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | API secret | **BLOCKING** — staging webhook signing secret | Valid signature accepted; altered payload rejected. |
| `MASARIFI_PUSH_TOKEN_HASH_KEY` | API/worker secret | **BLOCKING** — exactly 32 random bytes encoded as 43-character base64url | Push registration works; raw token never appears in DB/logs. |
| `MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS` | API/worker secret ring | **BLOCKING** — `id:<43-char-base64url>`, 1–3 entries; different from hash key | Current key encrypts; older listed key decrypts during rotation. |
| `MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS` | API | **BLOCKING** — `600` initially | Sensitive operation fails after threshold and succeeds after MFA/re-auth. |
| `MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS` | API | **OPTIONAL** — only approved integer-minor-unit threshold overrides | Boundary tests pass; omit to use repository defaults. |
| `MASARIFI_CLERK_API_TIMEOUT_MS` | API/worker | **REQUIRED** — `2000` | Clerk outage fails bounded and observably. |
| `MASARIFI_CLERK_WEBHOOK_POLL_MS` | Worker | **REQUIRED** — `500` | Webhook queue drains. |
| `MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS` | Worker | **REQUIRED** — `10` | Repeated failure becomes terminal/alertable. |
| `MASARIFI_CLERK_RECONCILE_PAGE_SIZE` | Worker | **REQUIRED** — `100` | Reconciliation paginates without missed users. |
| `MASARIFI_ADMIN_ROUTES_ENABLED` | API only | **BLOCKING** — `false` until bootstrap, then `true`; never set on worker | Bootstrap completes before routes open; worker rejects the variable. |
| `MASARIFI_ADMIN_INVITATION_REDIRECT_URL` | API | **BLOCKING** — exact non-root HTTPS Admin invitation route | Invitation lands on staging Admin; root/HTTP URL fails config validation. |
| `MASARIFI_SECURITY_IP_HASH_KEYS` | API/worker secret ring | **BLOCKING** — same key-ring format as encryption, separately generated | Audit/security events contain irreversible hashes, not client IPs. |
| `SUPABASE_URL` | API/worker | **BLOCKING** — hosted staging HTTPS URL | Production-mode validation passes; Storage/API operations target staging. |
| `SUPABASE_SERVICE_ROLE_KEY` | API/worker secret only | **BLOCKING** — staging service-role key; never migration/mobile/admin client | Private Storage and security jobs work; key is absent from client bundles/logs. |
| `MASARIFI_EXPORT_MAX_BYTES` | Worker | **REQUIRED** — `16777216` | Oversized export is rejected safely. |
| `MASARIFI_EXPORT_MAX_ENTRIES` | Worker | **REQUIRED** — `100` | Entry cap enforced. |
| `MASARIFI_EXPORT_RETENTION_HOURS` | API/worker | **REQUIRED** — `24` | Expired export is removed/unavailable. |
| `MASARIFI_EXPORT_SIGNED_URL_SECONDS` | API/worker | **REQUIRED** — `300` | Link works before and fails after expiry. |
| `MASARIFI_DELETION_COOLING_OFF_HOURS` | API/worker | **REQUIRED** — `72` | Cancel/execute boundaries pass. |
| `MASARIFI_SECURITY_WORKER_POLL_MS` | Worker | **REQUIRED** — `500` | Security/privacy jobs are claimed promptly. |
| `MASARIFI_SECURITY_JOB_BATCH_SIZE` | Worker | **REQUIRED** — `25` | Batch completes without lease starvation. |
| `MASARIFI_PRIVACY_HANDLER_MANIFEST` | Worker | **BLOCKING** — `ai@1,engagement@1,identity@1,tracking@1` unless code changes | Startup accepts only registered handlers; deletion/export covers all domains. |

### AI, reports, SMTP, engagement, scan, and push

| Variable | Process / storage | Priority and staging value rule | Verification |
| --- | --- | --- | --- |
| `MASARIFI_AI_PROVIDER_ENABLED` | Worker | **BLOCKING for AI** — start `false`; set `true` only after Section 5 approval | Disabled path never contacts provider; enabled canary is traceable. |
| `MASARIFI_AI_WORKER_POLL_MS` | Worker | **REQUIRED** — `500` | AI queue latency is acceptable. |
| `MASARIFI_AI_JOB_BATCH_SIZE` | Worker | **REQUIRED** — `25` | Batch and quota behavior pass. |
| `MASARIFI_AI_LEASE_SECONDS` | Worker | **REQUIRED** — `120` | Killed job is reclaimed safely. |
| `MASARIFI_AI_MAX_CONCURRENCY` | Worker | **REQUIRED** — `4` initially | Provider and DB limits remain stable. |
| `MASARIFI_AI_SIGNED_UPLOAD_SECONDS` | API/worker | **REQUIRED for voice** — `300` | Voice upload URL expires as expected. |
| `OPENROUTER_API_KEY` | Worker secret | **BLOCKING for AI/voice** — approved staging key with budget limit | Provider call succeeds; key is absent from API/Admin/Mobile/logs. |
| `MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS` | Worker | **REQUIRED** — `5000` | Connection failure is bounded. |
| `MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS` | Worker | **REQUIRED** — `10000` | Hung SMTP exchange is bounded. |
| `EMAIL_DELIVERY_WEBHOOK_SECRET` | API secret | **OPTIONAL/REQUIRED when delivery webhook is enabled** — provider-specific random secret | Valid callback accepted; invalid signature rejected. |
| `EMAIL_FROM` | Worker | **BLOCKING for email** — verified staging sender | Canary has correct From domain. |
| `EMAIL_SMTP_HOST` | Worker secret config | **BLOCKING for email** — staging provider hostname | TLS connection succeeds. |
| `EMAIL_SMTP_PORT` | Worker | **BLOCKING for email** — provider port; `465` uses implicit TLS, otherwise STARTTLS | TLS 1.2+ with certificate verification. |
| `EMAIL_SMTP_USERNAME` | Worker secret | **BLOCKING for email** — staging/sandbox credential | Authentication succeeds. |
| `EMAIL_SMTP_PASSWORD` | Worker secret | **BLOCKING for email** — staging/sandbox credential | Authentication succeeds and value is redacted. |
| `MASARIFI_REPORT_BATCH_SIZE` | Worker | **REQUIRED** — `25` | Report queue drains. |
| `MASARIFI_REPORT_POLL_MS` | Worker | **REQUIRED** — `500` | Report latency is acceptable. |
| `MASARIFI_REPORT_LEASE_SECONDS` | Worker | **REQUIRED** — `120` | Crash/retry recovery works. |
| `MASARIFI_REPORT_MAX_ATTEMPTS` | Worker | **REQUIRED** — `5` | Terminal failure is visible. |
| `MASARIFI_REPORT_MAX_ROWS` | Worker | **REQUIRED** — `100000` | Row cap enforced. |
| `MASARIFI_REPORT_MAX_BYTES` | Worker | **REQUIRED** — `52428800` | Byte cap enforced. |
| `MASARIFI_REPORT_RETENTION_HOURS` | API/worker | **REQUIRED** — `24` | Expired report is unavailable/deleted. |
| `MASARIFI_REPORT_SIGNED_URL_SECONDS` | API/worker | **REQUIRED** — `300` | Signed link expiration passes. |
| `MASARIFI_NOTIFICATION_BATCH_SIZE` | Worker | **REQUIRED** — `100` | Notification queue drains without provider burst failure. |
| `MASARIFI_CAMPAIGN_BATCH_SIZE` | Worker | **REQUIRED** — `500` | Approved staging campaign is batched. |
| `MASARIFI_ATTACHMENT_SCAN_BATCH_SIZE` | Worker | **REQUIRED** — `25` | Scan queue drains. |
| `MASARIFI_NOTIFICATION_MAX_ATTEMPTS` | Worker | **REQUIRED** — `5` | Retry/terminal behavior is visible. |
| `MASARIFI_SUPPORT_REOPEN_HOURS` | API/worker | **REQUIRED** — `168` | Reopen boundary passes. |
| `MASARIFI_CAMPAIGN_APPROVAL_THRESHOLD` | API | **REQUIRED** — `10000` initially | Campaign at/over threshold requires approval. |
| `MASARIFI_SUPPORT_ATTACHMENT_MAX_BYTES` | API/worker | **REQUIRED** — `10485760` | Oversized upload is rejected before scanning/storage use. |
| `MASARIFI_SUPPORT_SIGNED_URL_SECONDS` | API/worker | **REQUIRED** — `300` | Private attachment URL expires. |
| `MASARIFI_ENGAGEMENT_PROVIDER_MODE` | Worker | **BLOCKING for provider delivery** — `disabled` during bring-up; enable only the approved non-deterministic provider mode | Production rejects deterministic mode; disabled mode sends nothing. |
| `MASARIFI_CLAMAV_HOST` | Worker | **BLOCKING for attachments** — private ClamAV service hostname/IP | Clean/EICAR outcomes pass; scanner is not Internet-exposed. |
| `MASARIFI_CLAMAV_PORT` | Worker | **BLOCKING for attachments** — `3310` unless scanner differs | Worker connects only over the private network. |
| `MASARIFI_EXPO_ACCESS_TOKEN` | Worker secret | **BLOCKING for current Mobile push path** — Expo access token | Expo receipt flow passes; token redacted. |
| `MASARIFI_FCM_PROJECT_ID` | Worker | **OPTIONAL** — only for direct native FCM tokens | Configure only if a client registers `fcm` tokens; current Mobile registers Expo tokens. |
| `MASARIFI_FCM_ACCESS_TOKEN` | Worker secret | **OPTIONAL** — direct FCM access token with an external rotation mechanism | Do not treat a short-lived static token as durable staging config. |
| `MASARIFI_APNS_BUNDLE_ID` | Worker | **OPTIONAL** — `com.masarifi.mobile` for direct APNs | Configure only if a client registers `apns` tokens. |
| `MASARIFI_APNS_KEY_ID` | Worker secret config | **OPTIONAL** — Apple key ID for direct APNs | Direct APNs canary passes. |
| `MASARIFI_APNS_TEAM_ID` | Worker secret config | **OPTIONAL** — Apple team ID for direct APNs | Direct APNs authentication passes. |
| `MASARIFI_APNS_PRIVATE_KEY` | Worker secret | **OPTIONAL** — PEM content for direct APNs | Key loads without logging and can be rotated. |

Generate key material locally with a cryptographically secure tool and place it directly in the target secret store. Do not record generated output in shell history or CI logs. OpenTelemetry runtime variables are supported but are not part of `.env.example`: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_RESOURCE_ATTRIBUTES`; store headers as secrets and verify exporter failure cannot crash the service.

## 5. OpenRouter and AI provider acceptance

Official references: [provider catalog](https://openrouter.ai/providers), [Zero Data Retention](https://openrouter.ai/blog/insights/zero-data-retention/), and [privacy policy](https://openrouter.ai/privacy/).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) for AI/voice** | The intended browser session reaches a personal OpenRouter Default Workspace with one pre-existing general key, no staging-specific guardrail, and no staging privacy approval. The account currently permits free endpoints that may retain or train on prompts; that is not acceptable evidence for financial staging data. | OpenRouter dashboard and `/etc/masarifi/worker.env` | Create a separate staging key with the smallest practical spend limit only after confirming workspace ownership and privacy policy. Require ZDR/no-training routing and store the key only on the worker. Do not reuse or expose the existing general key. | Redacted staging-key metadata, budget limit, approved privacy decision, and provider canary correlation. |
| **PASS (catalog metadata only)** | Current model IDs, capabilities, ZDR eligibility, and prices were revalidated; provider execution is still blocked without an approved staging key. | OpenRouter model/provider catalog and Admin AI configuration | Keep Voice disabled until a redacted live canary and governed prompt/route publication pass. Revalidate metadata again immediately before enablement. | On 2026-09-23, the Models API showed `openai/gpt-audio-mini` is not ZDR-eligible, while `google/gemini-2.5-flash` supports audio, structured output, and ZDR. Migration `20260922220434` changed the disabled Voice route to Google Flash with Flash Lite fallback and marked the OpenAI audio model unapproved. |
| **BLOCKING (P0) for AI/voice** | Routes are seeded disabled and prompts are not published in staging. | Admin → AI configuration | Keep provider globally disabled. Run redacted evaluations, publish approved prompt versions, enable one route, then set provider enabled. Use recent MFA and idempotency. | Audit event identifies approver/version; normal, fallback, timeout, malformed, quota, and outage tests pass. |

The gateway already requests provider-only routing, disables provider fallback, requires `data_collection: deny` and `zdr: true`, enforces price/token/schema limits, performs at most one application fallback, and has timeout/circuit-breaker controls. Verify those fields in a redacted outbound capture; do not log prompts, audio, tokens, or financial PII.

Current disabled Voice configuration is primary `google/gemini-2.5-flash` with `google/gemini-2.5-flash-lite` fallback and a Google-only allowlist; its 128k input/1,200 output-token bounds, 120-second route timeout, and USD 25 monthly route budget are unchanged. Financial assistant remains primary `openai/gpt-5.2` with an Anthropic fallback, 32k input/4,096 output-token bounds, 60-second route timeout, and a USD 50 monthly route budget. The repository's default accepted-work quota is five AI items per user in a rolling 24 hours, its global monthly guard is USD 200, and budget events are expected at 70/85/95 percent. These are staging-test expectations, not authorization to spend: rerun metadata checks, obtain privacy approval, and set a stricter OpenRouter account limit before enablement.

Run these staging cases: valid financial request; unsupported request; malformed provider JSON; primary outage with approved fallback; both providers unavailable; connection and overall timeout; per-user rolling quota; global monthly budget at 70/85/95 percent; unauthorized user; circuit open/recovery. An unrelated/unsupported request must return before enqueueing: confirm no OpenRouter Activity entry and no new `ai_usage_events` row.

## 6. Push notifications: Expo and Android FCM

Official references: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0), partial foundation exists** | The no-cost Firebase Spark project `Masarifi Staging` (`masarifi-staging`) is isolated under the intended Google account, and Android app `com.masarifi.mobile` is registered. Expo ownership and FCM v1 credentials are not proven. | Masarifi-owned Expo/EAS project → Credentials; Firebase project | After the intended Expo owner is authenticated, create its project and upload a tightly scoped FCM v1 service-account credential only to EAS. Configure worker `MASARIFI_EXPO_ACCESS_TOKEN`; never commit the service-account key. | Physical Android receipt, foreground/background/killed delivery, tap routing, denial flow, retry, expiry, dedupe, and redacted worker logs. |
| **PASS (repository configuration only)** | `app.json` now declares `android.googleServicesFile`, and the committed Firebase client file matches project `masarifi-staging` and package `com.masarifi.mobile`. A contract test rejects a wrong project/package or server-secret fields. | `apps/mobile/app.json`; `apps/mobile/google-services.json`; `apps/mobile/scripts/firebase-config.test.mjs` | Keep the client file public-only and rerun the contract plus Expo prebuild on every change. This is not FCM delivery evidence. | `npm run test:firebase-config`, Mobile quality checks, typecheck, lint, and `expo prebuild --platform android --no-install` pass; generated Android applies the Google Services plugin. |
| **OPTIONAL** | Direct FCM/APNs worker providers are unused unless clients register native `fcm`/`apns` tokens. | Worker env | Leave direct-provider variables unset for the current app. Do not use them as a substitute for EAS credentials. | Registered token provider is `expo`; no direct-provider calls occur. |

Test transactional, reminder, and AI-result notifications on physical devices with notifications allowed and denied. Verify quiet hours, duplicate suppression, expired tokens, provider rejection, receipt processing, and token removal/rotation.

| Test | Expected result | Evidence |
| --- | --- | --- |
| Transaction notification | One notification for one committed event; tap opens the intended transaction/context. | Outbox/job ID, Expo ticket/receipt, device capture. |
| Reminder notification | Only an eligible, non-stale reminder is delivered; tap opens Home or Tracking as configured. | Eligibility row, notification ID, device capture. |
| AI notification | Delivered only for an enabled completed AI job; no prompt/financial detail leaks on the lock screen. | AI job ID, redacted payload, receipt. |
| Foreground | App handles the event once without a duplicate system/in-app presentation. | Device log and screen capture. |
| Background | System notification appears and deep link restores the correct authenticated screen. | Device capture and navigation log. |
| Killed app | Tap cold-starts, authenticates if needed, and resolves the deep link once. | Cold-start recording and request correlation. |
| Permission denied | No delivery is claimed; UI explains how to re-enable without blocking core finance flows. | OS settings/UI capture and server delivery state. |

## 7. SMTP and email acceptance

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0)** | Worker production startup requires all SMTP variables; no staging provider is configured. | Approved SMTP provider/sandbox and `/etc/masarifi/worker.env` | Create a staging subaccount/sandbox, verify the From domain/address, allowlist internal recipients, and set the SMTP variables from Section 4. Never import a customer list. | Successful TLS-authenticated canary, provider event, worker delivery state, and no credential/body in logs. |
| **REQUIRED (P1)** | Failure/retry/webhook behavior is unproven. | SMTP provider, API webhook, Admin/report flows | Test accept, hard reject, transient failure, timeout, ambiguous response, retry, terminal failure, delivery callback signature, and link expiry. | One intended email per idempotency key; retry counts and final state match; webhook forgery fails. |

The client requires TLS 1.2+, certificate verification, implicit TLS on port 465 or STARTTLS otherwise, and disables file/URL access. Preserve these controls. Send only to controlled staging inboxes.

Notification/email templates are database-backed, versioned, allowlisted-variable templates managed through Admin—not SMTP-provider dashboard templates. Preview and publish Arabic/English staging versions, verify placeholder rejection and the 4,096-character email-body bound, and require the existing campaign approval threshold. Provider account throughput plus `MASARIFI_NOTIFICATION_BATCH_SIZE`, retry/backoff, and campaign approval are the staging rate controls; begin with provider sandbox limits and test throttling rather than raising them.

## 8. Mobile and EAS staging builds

Official references: [EAS environment variables](https://docs.expo.dev/eas/environment-variables/), [environment-variable usage](https://docs.expo.dev/eas/environment-variables/usage/), and [`eas.json`](https://docs.expo.dev/build/eas-json/).

| Variable | EAS `preview` environment | Priority / value |
| --- | --- | --- |
| `EXPO_PUBLIC_CLIENT_MODE` | Plaintext, public by design | **BLOCKING** — `live` |
| `EXPO_PUBLIC_API_URL` | Plaintext, public by design | **BLOCKING** — `https://<STAGING_API_HOST>` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Plaintext, public key | **BLOCKING** — staging Clerk Production-instance publishable key |
| `EXPO_PUBLIC_APP_ORIGIN` | Plaintext | **OPTIONAL** — approved staging app origin if the configured flow uses it |

The preview profile explicitly selects the EAS `preview` environment. Verify that the Masarifi-owned Expo project has that environment and only staging values before building.

The configured Expo project belongs to `@abdallazordok`, not the intended Masarifi staging owner. Create or select a Masarifi-owned project and verify its preview environment before building. A fresh signed preview build from the accepted SHA is **BLOCKING (P0)**.

```powershell
Set-Location apps/mobile
npx eas-cli env:list --environment preview
npx eas-cli credentials --platform android
npx eas-cli build --platform android --profile preview
```

Set values in the EAS dashboard or with `eas env:set`; avoid placing values directly in shared terminal logs. Record build ID, source SHA, runtime version, signing identity, and expiration. Install Android through the EAS link/QR or `adb install -r <SIGNED_STAGING_APK_PATH>`. iOS is outside this Android staging slice.

Expo Go is not acceptance evidence for SMS/notification listener behavior, app signing, secure storage, native local modules, biometric lock, background behavior, full push, or voice. Test a physical Android device for first launch, auth, secure storage, biometric allow/deny/cancel, offline enqueue, force-stop/restart recovery, upgrade from the previous staging build, deep links, accessibility, microphone, and notifications.

| Build type | Intended use | Native capability / staging status |
| --- | --- | --- |
| Expo Go | Quick JavaScript/UI exploration using Expo Go's bundled native modules | Cannot validate this app's custom/native SMS, listener, secure-store/signing, or full release behavior; not staging evidence. |
| Development build | Developer client with the project's native modules and debugging tools | Useful for local diagnosis; debug behavior and credentials are not release acceptance. |
| Preview/Staging build | Internally distributed signed standalone build using EAS `preview` and staging services | Required for staging device acceptance. |
| Production build | Store/release artifact using production profile, production identities, and public-policy approvals | Out of scope; do not create or deploy it under this guide. |

## 9. Voice assistant staging acceptance

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) for voice** | Signed-build microphone/upload/provider/proposal/confirmation flow is not verified. | Physical devices, staging private Storage, API, worker, OpenRouter | Complete Sections 2, 5, 6, and 8. Publish/enable the approved voice route. Use controlled, non-sensitive audio. | Correlated session/job/action IDs without audio or PII in logs; ledger changes only after explicit confirmation. |

Trace the complete flow: permission → record → create session → short-lived signed private upload → process → worker/provider → proposal → explicit confirm endpoint → ledger mutation. Test permission denied, silent audio, noisy/unclear audio, valid income, valid expense, unsupported transfer, multiple transactions, obligation request, expired upload URL, upload interruption, duplicate process/confirm, provider timeout, fallback, app background/restart, cancellation, and confirmation tampering. No proposal may mutate the ledger before confirmation; repeated confirmation must not duplicate a transaction.

Record an explicit result for: permission granted; permission denied; permission permanently denied with OS-settings recovery; recording start indicator; recording stop; re-record replacing the prior draft; cancel deleting/expiring the draft; silent audio; unclear speech; supported expense; supported income; unsupported transfer; multiple transactions; AI timeout; provider failure; session expiration; retry; background/restart; and confirm. For every pre-confirmation case, compare ledger count/balance before and after and require no change.

## 10. Android SMS and notification tracking

Official references: [Google Play SMS/Call Log policy](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en) and [permissions declaration](https://support.google.com/googleplay/android-developer/answer/9214102?hl=en).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) for internal tracking acceptance** | Real Android financial-message capture is unverified. | Fresh signed internal APK on a controlled Android device | Show prominent disclosure/consent before access. Test `READ_SMS` import and notification-listener capture independently using controlled messages. Confirm local minimization before upload. | Supported/unsupported/parser/dedup/review/ledger evidence with message text and identifiers redacted. |
| **BLOCKING (P0) for any Google Play track using `READ_SMS`** | Google Play restricted-permission approval is not obtained. Internal sideloading does not satisfy Play policy. | Play Console → Policy/App content → sensitive permissions/SMS declaration | Submit the money-management core-functionality use case, video/instructions, disclosure, privacy policy, and data-handling justification. Do not upload to a Play track until the console requirement is understood and approved. | Written Play approval for the exact package/build and declared use case. |
| **REQUIRED (P1)** | iOS has no raw SMS API and must use the assisted capture path. | Signed iOS staging build | Test only the supported assisted/manual flow; do not promise Android-equivalent background capture. | iOS acceptance record matches documented capability. |

Test expense, income, transfer, supported/unsupported sender, malformed amount/currency/date, duplicate SMS, duplicate notification, the same transaction arriving through both channels, offline capture, retry, restart, review/edit/reject/accept, and resulting integer-minor-unit ledger reconciliation. Verify the documented local retention limits and deletion/export behavior. Notification-listener success is not evidence of `READ_SMS` policy approval.

For each accepted tracking event, verify the resulting transaction notification is emitted once. Re-import the same SMS, replay the same notification, and deliver the same transaction through both sources; expect one review/ledger outcome and no duplicate push/local notification. A rejected/unsupported/transfer item must not create an income/expense ledger transaction.

## 11. Financial AI chat acceptance

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) for AI chat** | A published prompt/route and real privacy-safe evaluation are missing. | Admin AI configuration, worker, OpenRouter | With provider disabled, run the approved redacted evaluation corpus. Publish one version, enable it with recent MFA, then enable the worker provider flag. | Versioned evaluation results, audit events, request/job correlation, and budget/quota metrics. |

Verify the architecture as separate evidence points:

- **Domain Gate / Intent Router:** `routeAssistantMessage` maps supported intents and routes `unrelated`/`unsupported` to deterministic execution before availability/quota/provider work.
- **Deterministic zero-token path:** spending/income/category/budget/savings/obligation/salary/recent-transaction answers use backend tools and repository truth without a provider call. Confirm no OpenRouter Activity event and no `ai_usage_events` row.
- **Backend financial truth:** tool context comes from `ReportsService`, `PlanningService`, and `LedgerService` under the authenticated principal; the model is not the ledger/calculation authority.
- **Multi-turn context:** only the last four non-unrelated conversation turns are selected and redacted before provider enqueue. Test follow-up period comparison and ensure unrelated history is excluded.
- **Provider path:** only supported reasoning/action intents enqueue provider work under route/model/privacy/quota controls.
- **Action safety:** create/update proposals remain previews and require the existing confirmation endpoint/recent-auth rules before a domain service writes anything.

Test Arabic and English supported questions, insufficient context, unsupported/non-financial prompt, prompt injection, sensitive-data request, malformed provider output, schema mismatch, quota exhaustion, token-limit rejection, global budget guard, primary outage, fallback outage, timeout, retry, duplicate request, user isolation, deletion/export, and circuit recovery. Verify tool/action proposals require explicit user confirmation and that no AI output directly mutates financial records.

## 12. User reminders and engagement jobs

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) for existing reminder scope** | Registered-user reminders have no hosted scheduler/provider/device evidence. | Worker scheduler, database, Expo push, physical device | Follow `docs/runbooks/user-reminder-staging.md`. Test app-inactive 3-day/7-day and financial-inactive 7-day reminders, UTC evaluator cadence, baseline dedupe, dispatch-time stale eligibility, quiet hours, and Home/Tracking deep links. | Exactly one eligible reminder, none when ineligible, correct deep link, retries/dedupe, and redacted logs. |
| **Scope decision** | No pre-signup 24h/72h “new user reminder” implementation was found in current Mobile source. It cannot be verified by external configuration. | Product requirement and repository | If the requirement means the existing registered-user 3-day reminder, rename the acceptance wording. If true pre-signup reminders are required for staging, create a separate reviewed implementation plan; treat it as **BLOCKING (P0)** only when it is in the accepted staging scope. | Written scope decision or a separately approved implementation/evidence record. |

Keep `MASARIFI_ENGAGEMENT_PROVIDER_MODE=disabled` until the chosen provider is configured. Production mode rejects deterministic delivery; test utilities are not a live provider.

For implemented reminders, record: new registered user below threshold (no reminder); inactive at 3 days; inactive at 7 days; financial inactivity at 7 days; cooldown/baseline duplicate prevention; notifications disabled; opening the app from a reminder; correct Home/Tracking deep link; user activity before dispatch; and stale queued reminder cancellation. Re-run the evaluator and dispatcher for the same eligibility window and require no duplicate delivery.

## 13. Admin staging application and bootstrap

| Variable | Build/runtime location | Priority / value |
| --- | --- | --- |
| `NEXT_PUBLIC_CLIENT_MODE` | Admin host, build and runtime | **BLOCKING** — `live` |
| `NEXT_PUBLIC_API_URL` | Same; public value | **BLOCKING** — `https://<STAGING_API_HOST>` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same; public key | **BLOCKING** — staging Clerk Production-instance publishable key |
| `CLERK_SECRET_KEY` | Same; server-only secret | **BLOCKING** — staging Clerk secret |
| `NEXT_PUBLIC_ENABLE_MOCKS` | Same | **BLOCKING** — `false` |

Set these in the staging Vercel project's environment when Vercel is the permitted Admin host; use restricted `/etc/masarifi/admin.env` only when hosting Admin on the VPS. Public `NEXT_PUBLIC_*` values are embedded at build time; rebuild after changing them. Never point a staging Admin build at production. Build and start with the repository scripts under Node 24:

```powershell
npm --prefix apps/admin-web ci --ignore-scripts
npm --prefix apps/admin-web run build
npm --prefix apps/admin-web start
```

Bootstrap the first superadmin only after the staging Clerk user exists and its webhook-created profile is active. Keep `MASARIFI_ADMIN_ROUTES_ENABLED=false`, use the one-off migration/owner database environment, and require a different approved-by identity:

```powershell
npm --prefix apps/api run admin:bootstrap -- --user-id <STAGING_CLERK_USER_ID> --approved-by <SECOND_APPROVER_ID> --reason "<APPROVED_REASON_AT_LEAST_10_CHARACTERS>"
```

Then set API `MASARIFI_ADMIN_ROUTES_ENABLED=true` and restart only the API. Verify authorized superadmin, lower-role Admin, normal user, disabled user, stale recent-auth, fresh MFA, invitations, support access, notifications, tracking review, AI configuration, jobs, incidents, maintenance controls, immutable audit records, and sign-out/revocation. Every request must target the staging API.

## 14. Hostinger VPS deployment

Official Hostinger references: [VPS support](https://www.hostinger.com/support/vps/), [Docker VPS template](https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/), [VPS firewall](https://www.hostinger.com/support/4805502-how-to-set-up-a-firewall-at-vps/), and [Docker project domains](https://www.hostinger.com/support/how-to-change-the-domain-of-a-docker-project/).

A secret-free hardened backend Compose contract exists at `docker/staging/compose.backend.yml` for one digest-pinned migration, API, and worker image; CI validates its process separation, non-root/read-only controls, private API binding, and distinct environment files. Reverse-proxy configuration, a VPS service unit, Admin Dockerfile, ClamAV service, and deployment workflow are still absent. The minimum staging deployment is:

1. **BLOCKING (P0):** Provision a dedicated supported Ubuntu VPS. Create a non-root deployment/service account, disable password/root SSH after confirming key access, apply security updates, and install Docker Engine/Compose, Node 24/npm, Nginx, and the TLS client only when absent. Record versions.
2. **BLOCKING (P0):** Create DNS A/AAAA records for `<STAGING_API_HOST>` pointing to this VPS; add `<STAGING_ADMIN_HOST>` only if Admin will be hosted here. Issue trusted TLS certificates. Redirect HTTP to HTTPS.
3. **BLOCKING (P0):** Allow public 80/443 only. Restrict SSH to approved administrator IPs/VPN. Bind the API upstream port to `127.0.0.1` and the Admin upstream port only if hosted here; never expose PostgreSQL, ClamAV, or `/health/ready` publicly.
4. **BLOCKING (P0):** Create `/etc/masarifi/{api,worker,migration}.env` and `/etc/masarifi/admin.env` only if Admin is VPS-hosted; make them owner-readable only (`chmod 600`). Keep process contracts separate. Confirm no production hostname/project/credential appears.
5. **BLOCKING (P0):** Pull the backend image by immutable digest. Run the migration entrypoint once. Start API with the image default/API entrypoint. Start worker from the same image with `dist/src/worker.js` and override/disable the inherited Docker health check because the worker has no HTTP server.
6. **BLOCKING (P0):** Run containers as the image non-root UID, read-only root filesystem where compatible, dropped Linux capabilities, no-new-privileges, bounded CPU/memory/PIDs, local/private networking, restart policy, and writable mounts only where proven necessary.
7. **BLOCKING (P0) if Admin uses this VPS:** Build Admin from the accepted SHA with its build-time env. Run `npm start` under a non-root systemd service on loopback. Proxy the Admin host through Nginx and preserve forwarded protocol/host/IP handling expected by the apps. Otherwise verify the separate permitted Admin host in Section 16.
8. **REQUIRED (P1):** Configure journald/container log rotation, disk monitoring, OS security updates, service restart alerts, and encrypted off-host backups for VPS-only state. The database remains hosted Supabase.

After the operator has verified the exact image digest and the `masarifi` private Docker network exists, the minimum backend command shape is:

```bash
docker run --rm \
  --name masarifi-migration \
  --network masarifi \
  --env-file /etc/masarifi/migration.env \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  <REGISTRY>/<IMAGE>@sha256:<DIGEST> dist/src/migration.js

docker run -d \
  --name masarifi-api \
  --network masarifi \
  --env-file /etc/masarifi/api.env \
  --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 256 --memory 512m --cpus 1 \
  -p 127.0.0.1:3000:3000 \
  <REGISTRY>/<IMAGE>@sha256:<DIGEST>

docker run -d \
  --name masarifi-worker \
  --network masarifi \
  --env-file /etc/masarifi/worker.env \
  --restart unless-stopped --no-healthcheck \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 256 --memory 512m --cpus 1 \
  <REGISTRY>/<IMAGE>@sha256:<DIGEST> dist/src/worker.js
```

The resource limits are conservative starting values, not measured capacity. Raise them only from staging evidence. If Admin is hosted on this VPS, install dependencies/build as the service account, then use a systemd unit with `EnvironmentFile=/etc/masarifi/admin.env` and an `ExecStart` equivalent to `npm --prefix <ADMIN_RELEASE_DIRECTORY>/apps/admin-web start -- --hostname 127.0.0.1 --port 3001`. Use an absolute release directory for each SHA; switch the service's release symlink only after a successful build. Nginx proxies the API hostname to `127.0.0.1:3000` and, only for VPS-hosted Admin, its hostname to `127.0.0.1:3001`. Preserve `Host` and `X-Forwarded-Proto`, set conservative request/body timeouts, and expose only the API routes intended by the application.

Service checks:

```bash
curl --fail --silent https://<STAGING_API_HOST>/health/live
curl --fail --silent http://127.0.0.1:3000/health/ready
docker inspect --format '{{.Config.User}} {{.Image}}' <API_CONTAINER>
docker inspect --format '{{.Config.User}} {{.Image}}' <WORKER_CONTAINER>
```

If Admin is VPS-hosted, also run `systemctl is-active <ADMIN_SYSTEMD_UNIT>`; otherwise verify its separate hosting deployment. Expected: public liveness 200; internal readiness 200 only when dependencies are ready and 503 when deliberately unavailable; Admin active; containers non-root and pinned to the recorded digest. Monitor worker process state, `platform.started`, queue age/depth, and job outcomes instead of an HTTP health endpoint.

Rollback rehearsal is **BLOCKING (P0)** for staging verification: retain the N-1 API/worker digest and N-1 Admin artifact, stop traffic/worker safely, switch application artifacts, and repeat smoke checks. Schema rollback uses forward fixes or a verified hosted restore; do not run down migrations. Prove N-1 is compatible with the additive schema before the rehearsal.

## 15. GitHub, CI, release controls, and deployment automation

Official references: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) and [deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).

| Priority | What is missing / why | Where | Safe action | Verification evidence |
| --- | --- | --- | --- | --- |
| **BLOCKING (P0) before relying on merges** | `main` has no ruleset/protection. | GitHub → Settings → Rules → Rulesets | Protect `main`; require pull requests, approvals, resolved conversations, and the passing Backend Foundation checks: `secrets`, `sentinel-redaction`, `application`, `mobile`, `admin`, all five `admin-e2e (...)` jobs, `database`, and `image`. | Test PR cannot merge with one required check failing. |
| **REQUIRED (P1)** | No protected `staging` environment or repeatable deployment workflow exists. | GitHub → Settings → Environments; future reviewed workflow | Create `staging` with required reviewers, prevent self-review where available, and restrict deployment branches. Add a minimal workflow only after the manual procedure is proven; it must deploy by digest, run migration once, health-check, and retain rollback metadata. | Approval gate and a successful repeatable deployment from an immutable SHA. |
| **REQUIRED (P1)** | GitHub currently has no repository secrets/variables and no workflow consumes deployment credentials. | `staging` environment secrets after workflow review | Add only names the reviewed workflow consumes, for example `STAGING_VPS_HOST`, `STAGING_VPS_USER`, `STAGING_VPS_SSH_PRIVATE_KEY`, and `STAGING_VPS_HOST_KEY`; add registry/Supabase deployment credentials only if the workflow truly needs them. Keep provider runtime secrets on the VPS. | Workflow uses least privilege, masks values, verifies SSH host key, and cannot target production. |

Do not require `signed-release-evidence` on ordinary PRs because it is intentionally skipped unless an authorized `backend-v*` tag is used. Do not require obsolete Vercel project contexts. Pin third-party Actions to reviewed immutable revisions when modifying workflows.

## 16. Vercel project cleanup and hosting boundary

Official reference: [manage Vercel projects](https://vercel.com/docs/projects/managing-projects).

The intended Vercel workspace `masarifiratibi-1546` is authenticated on the Hobby plan. It contains an empty `project-rvui9` project with default domain `project-rvui9.vercel.app`; the project has no Production or Preview deployment. It was created only to reserve a temporary staging origin and no code, environment variables, or secrets have been deployed. The Vercel GitHub App is scoped to `masarifiratibi-spec/masarifi.ratibi_app`, but installation is incomplete pending user-performed GitHub sudo email verification. Do not read or enter that verification code, and do not alter or delete older projects based on historical PR contexts.

Use one Masarifi-owned staging Admin project on Vercel only if its plan permits the project's use; Hobby is limited to personal/non-commercial use. Otherwise host staging Admin on the isolated VPS using Section 14. In either case, use the exact staging API origin, staging Clerk keys, live client mode, and mocks disabled. Do not keep competing staging origins.

## 17. Security and privacy acceptance

| Priority | Gate | Safe action | Evidence |
| --- | --- | --- | --- |
| **BLOCKING (P0)** | Private support/voice/export/report Storage | Confirm buckets are private, signed URLs are short-lived, object paths enforce ownership, and service-role credentials never reach clients. Test cross-owner denial and expired URLs. | Supabase policy test, API response, and redacted Storage audit. |
| **BLOCKING (P0)** | Malware scanning | Run ClamAV privately. Upload a clean file, EICAR test file, oversized file, and disallowed MIME/extension. Quarantine/reject until a clean result. | Scanner result and user-visible status; no public scanner port. |
| **BLOCKING (P0)** | Auth/RBAC/RLS | Use two owners plus authorized/unauthorized/stale-MFA Admin accounts across API, Admin, Mobile, private Storage, sync, tracking, AI, reports, and support. | Denial/success matrix and immutable audit events. |
| **BLOCKING (P0)** | Secret/data leakage | Inspect client bundles, EAS build metadata, HTTP responses, structured logs, provider dashboards, crash output, exports, and database rows for secrets, tokens, raw IPs, full SMS text, audio, and unnecessary financial PII. | Redacted scan output and explicit exceptions approved by the data owner. |
| **REQUIRED (P1)** | Abuse and boundary controls | Verify body/file limits, rate/request limits, CORS, webhook signatures/replay handling, idempotency, validation, CSP/security headers, dependency advisories, and TLS. | Negative tests and external TLS/header scan. |
| **REQUIRED (P1)** | Privacy lifecycle | Exercise data export, cancellation/cooling-off, deletion, provider data deletion where applicable, retention jobs, and backup implications. | Complete export, deletion manifest coverage, and documented backup-retention exception. |

Never use real customer messages, audio, email addresses, phone numbers, accounts, or production database snapshots for staging acceptance.

## 18. Observability, alerts, backup, and recovery

Use the thresholds and event names already documented in the repository runbooks, especially the platform alerts, readiness, outbox, sync, tracking recovery, planning recovery, and AI/voice operations documents. Do not add an enterprise observability stack solely for staging.

| Priority | What is missing / why | Minimum staging action | Verification evidence |
| --- | --- | --- | --- |
| **BLOCKING (P0)** | No hosted log/metric/alert routing evidence | Collect JSON stdout/journald centrally or retain it durably; add uptime check for public `/health/live`; keep `/health/ready` private. Alert on API/worker down, readiness failure, disk/CPU/memory pressure, queue age/depth, provider failures, Clerk webhook/auth failures, AI circuit/quota/budget, push/SMTP failure, and outbox terminal items. | Trigger each release-blocking alert and capture delivery to the on-call/test destination. |
| **REQUIRED (P1)** | Distributed correlation/export is unproven | If using OTLP, set endpoint, secret headers, and resource attributes on VPS only. Preserve request/job/release correlation and redaction. | One API→DB/outbox→worker→provider trace or correlated log chain; exporter outage does not break service. |
| **BLOCKING (P0)** | Graceful shutdown/restart/lease recovery is not proven | Send SIGTERM during requests and jobs; kill worker while holding outbox/sync/AI/report leases; restart services. | No lost committed work, no duplicate financial effect, lease is reclaimed, readiness transitions correctly. |
| **BLOCKING (P0)** | Hosted backup/restore and rollback are not rehearsed | Complete Section 2 isolated restore and Section 14 N-1 application rollback. Reconcile ledger totals/counts and private Storage separately. Mark PITR blocked on Supabase Free. | Measured RPO/RTO, reconciliation, incident timeline, and rollback/restore sign-off. |

Document an owner and response link for every alert. A dashboard without a tested notification route is not an acceptance result.

## 19. Final end-to-end staging acceptance matrix

Run this matrix against the same immutable release after Sections 1–18 are configured. As of 2026-09-22, every row is `BLOCKED` because the isolated hosted foundation and signed Android build are not available; repository CI is not a substitute for hosted/device evidence. Update each row to `PASS` or `FAIL` with dated evidence when exercised. The status vocabulary is `PASS/FAIL/BLOCKED`; never convert a skipped check into a pass.

| Feature | Test | Expected result | Required evidence | Status | Blocking |
| --- | --- | --- | --- | --- | --- |
| Auth | Phone/Google sign-in; OTP expiry; refresh/revoke; MFA/recent-auth; create/update/delete webhook; disabled user; two-owner isolation | Valid staging identities work; invalid/expired/production tokens and cross-owner access fail closed; webhook is signed/idempotent | Clerk delivery/auth logs, API request IDs, denial responses, audit rows | `BLOCKED` | **P0** |
| Onboarding | First login, locale/currency/profile steps, interruption/restart, completion | Progress resumes once and completed state is valid; no production identity/data | Device recording, profile/onboarding rows, API IDs | `BLOCKED` | **P0** |
| Home | Fresh and returning user, empty/loading/error/populated/offline states, deep-link return | Totals/navigation use staging data and recover without duplicate fetch/mutation | Screen capture, request IDs, reconciled totals | `BLOCKED` | **P0** |
| Transactions | Account/category/transaction create/update/delete/refund/transfer where supported; invalid/conflict/idempotent replay | Integer-minor-unit balances reconcile; validation/conflict contract holds; replay has one effect | API responses, ledger versions, SQL reconciliation | `BLOCKED` | **P0** |
| Offline/sync | Queue mutations offline; reconnect; conflict/tombstone; duplicate; force-stop/restart; lease recovery; delta pagination/retention | Eventual single correct state with documented conflict result and no lost committed work | Device DB state, sync IDs, queue/lease rows, final API state | `BLOCKED` | **P0** |
| Tracking review | Supported/unsupported/malformed/duplicate/transfer import; edit/reject/accept | Only accepted supported income/expense produces one reconciled ledger effect | Import/review IDs, parser result, ledger row | `BLOCKED` | **P0** |
| Android SMS/listener | Consent and both capture paths independently; offline/restart; same event via both sources | Minimal data leaves device; one review item; retention/deletion works | Permission capture, redacted local/API records, dedupe key | `BLOCKED` | **P0 for Android scope** |
| Notifications | Transaction/reminder/AI; Android; foreground/background/killed/denied; quiet hours; retry/receipt/deep link | One eligible notification, correct safe content and destination, no duplicate | Expo ticket/receipt, worker job ID, device recording | `BLOCKED` | **P0** |
| Reminders | 3-day/7-day/financial-inactive; cooldown; re-evaluation; activity before dispatch; disabled notification | Eligible reminder once; stale/ineligible work canceled; correct Home/Tracking destination | Eligibility/job rows, notification ID, device recording | `BLOCKED` | **P0 for implemented scope** |
| AI Chat | Domain/intent routing; deterministic/provider; tools/truth; multi-turn; injection; malformed; quota/token/budget; outage/timeout; action confirmation | Deterministic/unrelated paths use zero provider tokens; provider output is schema/privacy bounded; no unconfirmed mutation | OpenRouter Activity absence/presence, `ai_usage_events`, tool evidence, audit/action rows | `BLOCKED` | **P0 if enabled** |
| Voice AI | Permission states; record/re-record/cancel; silent/unclear; expense/income/unsupported/multiple; expiry/retry/outage; confirm/replay | Private short-lived upload; structured proposal; no ledger change before confirm; one change after replayed confirm | Device recording, Storage/session/job/action IDs, ledger before/after | `BLOCKED` | **P0 if enabled** |
| Budgets | Create/update/status/boundaries and concurrent/conflicting update | Valid remaining/used values reconcile with ledger; invalid version/amount rejected | Planning versions, API IDs, calculation sheet/output | `BLOCKED` | **P0** |
| Savings | Create/update/contribution/progress/boundaries | Progress and balances reconcile in minor units; isolation holds | Planning/ledger rows and API IDs | `BLOCKED` | **P0** |
| Obligations | Create/update/due/payment/upcoming/retry boundaries | Payment is idempotent, status/due calculations reconcile, reminder is correct | Obligation/payment versions, ledger/event IDs | `BLOCKED` | **P0** |
| Reports/email | Generate/download/expire; SMTP accept/reject/timeout/retry; webhook signature | Report matches financial truth; private link expires; exactly one controlled email | Report/job IDs, checksum/counts, SMTP provider event, expiry response | `BLOCKED` | **P0** |
| Support/files | Clean/EICAR/oversized/wrong-type; scan outage/recovery; cross-owner URL | Only clean in-policy private object becomes available; signed URL expires | Scan/object/job IDs, denial/expiry responses | `BLOCKED` | **P0** |
| Admin | Bootstrap; roles; stale/fresh MFA; users; notifications; AI; monitoring; tracking; jobs; audits; incidents/maintenance | Least privilege and recent-auth hold; every sensitive action audited; staging API only | Admin recording, API/audit IDs, configured API origin | `BLOCKED` | **P0** |
| API | CORS; body/validation/error limits; auth; liveness/readiness; SIGTERM; dependency outage | Contract-safe errors; foreign origins denied; liveness/readiness differ correctly; graceful drain | HTTP captures, structured logs, shutdown timing | `BLOCKED` | **P0** |
| Worker | Outbox/sync/AI/report/security jobs; lease loss; provider failure; SIGTERM/restart | Jobs process once or retry/terminalize visibly; leases recover; no HTTP health dependency | Worker logs, queue rows, metrics/alerts | `BLOCKED` | **P0** |
| Database | From-zero migrations; checksums/order; lint/pgTAP; RLS; constraints/indexes/functions/triggers; isolated restore; PITR only if available | Schema matches repository, isolation holds, restore reconciles | CLI output, migration history, pgTAP TAP output, restore comparison | `BLOCKED` | **P0** |
| Release/rollback | Deploy immutable digest; smoke; switch to compatible N-1; switch forward | Release identity is traceable; both transitions preserve data and restore service within target | Digests/build IDs, timestamps, health/smoke output, RTO | `BLOCKED` | **P0** |
| Accessibility/performance | Mobile screen reader/focus/text scale/contrast; Admin keyboard/focus/viewports; staging load | Agreed accessibility checks and p95 latency/error budget pass | Device/browser recordings and load summary | `BLOCKED` | **P1** |

### Evidence record template

For each row record:

- Accepted Git SHA, backend image digest, Admin build ID, EAS Android build ID.
- UTC start/end, operator, environment hostnames/project names with secrets redacted.
- Exact command or test case, result, log/request/job correlation IDs, and evidence link.
- Any skipped or blocked step, its owner, risk, due date, and release decision.
- Migration list/checksums, database restore target, measured RPO/RTO, and rollback outcome.
- Provider route/prompt versions and credential version identifiers, never credential values.

### Final decision rule

- **READY:** every P0 and P1 gate, including hosted services, signed devices, providers, alerts, backup, and rollback, passes on the accepted release.
- **READY WITH CONDITIONS:** every repository/CI gate and the agreed staging slice passes, while explicitly named optional or out-of-slice provider/device gates remain pending with owners and no hidden dependency on them.
- **NOT READY:** any critical CI, migration, RLS/auth, secret/privacy, production build, hosted smoke, signed-device flow in scope, provider flow in scope, alert, backup, or rollback gate fails or lacks evidence.

Current final verdict: **NOT READY for full staging acceptance**. Code and CI are ready; hosted resources, service deployment, signed builds, providers, observability, backup/restore, and rollback still require execution and evidence.

### External dependency inventory

The Android staging slice depends on: hosted Supabase PostgreSQL/Storage and a tested backup; a separate Clerk application; persistent isolated VPS compute, DNS/TLS, Docker, and ClamAV; Masarifi-owned Expo/EAS; Firebase FCM; an SMTP sandbox/subaccount; OpenRouter for enabled AI/voice; GitHub Actions and an image registry; one permitted Admin host (Vercel or VPS); and log/uptime/alert destinations. Apple Developer/APNs and Google Play restricted-SMS approval are later iOS/public-distribution gates, not blockers for an internal Android APK. Record an owner, account/organization, staging resource name, access-review date, and rotation/recovery contact for each without recording credentials.

### Ready for Staging checklist

- [ ] Accepted Git SHA, backend digest, Admin build, and EAS builds are immutable and recorded.
- [ ] Supabase and Clerk are separate staging resources; migrations, pgTAP, RLS, login roles, JWT trust, and webhooks pass.
- [ ] API, worker, and migration have separate validated staging-only environment files and least-privilege credentials; Admin uses only the selected host's staging environment.
- [ ] VPS DNS/TLS/firewall/reverse proxy/process isolation/health/logging are configured and no private port is public.
- [ ] A fresh signed Android preview build passes physical-device auth, secure storage, offline/restart, permissions, push, and deep links; iOS is separately marked `BLOCKED` or out of scope.
- [ ] SMTP, ClamAV, Expo/FCM, and every enabled AI/voice provider path pass positive and negative canaries; APNs is a later iOS gate.
- [ ] Android tracking passes controlled device tests; Google Play approval exists before a Play track uses `READ_SMS`.
- [ ] Admin bootstrap/RBAC/recent-auth/audit and every enabled business flow in the matrix are `PASS` with evidence.
- [ ] Release-blocking alerts reach the responsible operator; an isolated database/Storage backup restore and N-1 application rollback meet recorded RPO/RTO. PITR is `BLOCKED` on Supabase Free.
- [ ] Every `BLOCKED`, skipped, or conditional item has an owner and accepted release decision; no failed P0 is waived silently.
- [ ] Final verdict and evidence are reviewed by engineering, security/privacy, and the staging release owner.

## P0 / P1 / P2 execution order

### P0 — establish and prove the staging slice

1. Freeze the accepted SHA and immutable backend image digest.
2. Create isolated Supabase and Clerk staging resources; bind non-owner DB runtime logins; apply migrations; configure JWT trust/webhooks; prove RLS/auth isolation.
3. Configure process-separated VPS environment files, DNS/TLS/firewall, migration, API, worker, the selected Admin host, and first-superadmin bootstrap.
4. Configure the Android `googleServicesFile`, EAS preview variables, signing, FCM/Expo, SMTP, ClamAV, and—when in scope—OpenRouter routes/prompts/privacy.
5. Produce a fresh signed Android build; run the in-scope identity, financial, sync, tracking, notification, email, Admin, AI/voice, and file-flow matrix.
6. Trigger alerts, restore a database and Storage backup to an isolated target, and rehearse N-1 application rollback. Record PITR as `BLOCKED` if unavailable.
7. Obtain Google Play restricted-SMS approval only before a Play track uses `READ_SMS`; internal Android staging does not require store submission.

### P1 — make staging repeatable and governed

1. Protect `main`, create the protected GitHub `staging` environment, and add a reviewed digest-based deployment workflow after the manual deployment succeeds.
2. Inventory existing Vercel projects; do not disconnect or delete any project during this staging task.
3. Complete SMTP/provider negative tests, accessibility/performance checks, OTLP correlation if selected, secret rotation rehearsal, and retained external evidence.

### P2 — reduce operational ambiguity

1. Keep the EAS preview profile explicitly bound to the `preview` environment after the Masarifi-owned project is selected.
2. Automate evidence indexing and scheduled restore drills only after the manual process is stable.
3. Tune pool, queue, timeout, and alert thresholds from measured staging behavior without changing business rules.
