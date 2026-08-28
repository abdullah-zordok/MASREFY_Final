# Quickstart: SPEC-BE-002

This runbook is executable only after implementation tasks exist. It intentionally
contains no usable key, token, OTP, account credential, phone number, email, Clerk
subject, webhook body, or database URL.

## 0. Verified Implementation Baseline

SPEC-BE-001 and the approved SPEC-BE-002 artifacts are integrated into `main` at
`4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`.

Before implementation, verify from the existing checkout—do not create a worktree:

```powershell
git branch --show-current
git status --short
git log --oneline --decorate -10
```

Required result:

- branch is exactly `main`;
- approved SPEC-BE-001 is present in synchronized `origin/main`;
- SPEC-BE-002 artifacts are present on `main` and no other Backend Spec has an
  active implementation diff;
- no unrelated untracked/user file is removed or overwritten;
- `apps/api/src`, root `supabase/migrations`, tests, Docker, and CI foundations are
  present from the merge rather than copied from another worktree.

If any item fails, stop implementation and update the baseline through the normal
reviewed Git flow. Do not use destructive reset/clean/checkout commands.

Verified preflight on 2026-08-28: the checkout is `main`, SPEC-BE-001 is an
ancestor, and the SPEC-BE-002 planning merge is
`4460ea56d6f53760fc6fefbfc35d0cc8c734dd75`. No worktree was created;
`.agents/plugins`, `apps/api/test/performance/artifacts`, `supabase/.branches`, and
`supabase/.temp` were preserved. Mobile/Admin diffs were empty. The merged baseline
contains migrations `00100`-`00400`, pgTAP files `001`-`003`, the three NOLOGIN/
NOINHERIT/non-BYPASSRLS roles, `private.set_updated_at_and_version()`,
`private.enqueue_outbox_event(...)`, the `platform-events` queue contract, Docker,
and the pinned CI workflow.

The mandatory pre-code cross-artifact review is recorded in
[checklists/artifact-analysis.md](checklists/artifact-analysis.md). T137 remains a
fresh final rerun after implementation rather than replacing this early gate.

Foundation gate verified on 2026-08-28 after T007-T017: TypeScript and ESLint
passed; 23 unit suites/110 tests, 8 contract suites/36 tests, and 2 ownership/scope
suites/9 tests passed; API, worker, and migration builds passed. The existing
SPEC-BE-001 validation, error, OpenAPI, scope, and build contracts remained green.

## 1. Complete the Redacted Provider Checklist

Follow [provider-configuration.md](contracts/provider-configuration.md) and leave
every item unverified until independently checked in the relevant Dashboard.

Minimum order:

1. Confirm one Development application named `Masarifi Development`.
2. Enable Phone OTP and Google only; disable password and other providers.
3. Restrict SMS to `+20`, `+966`, and `+971`.
4. Register Android/iOS `com.masarifi.mobile` under Native Applications.
5. Allowlist only `masarifi://oauth-callback` for the approved Mobile SSO flow.
6. Enable Clerk's native Supabase integration; do not create a JWT Template.
7. Register the exact Clerk instance domain in Supabase Third-Party Auth.
8. Create the webhook only after `POST /webhooks/clerk` is reachable; subscribe to
   `user.created`, `user.updated`, and `user.deleted` only.

The known SMS-tier restriction remains a production blocker until provider-side
enforcement is proven. Do not mark the checklist complete based on client-side
phone validation.

## 2. Inject Local Runtime Configuration Privately

Create the local ignored environment file from `apps/api/.env.example` only after
the BE-002 environment schema is implemented. Set values through the user's local
secret channel/editor; do not paste them into a terminal transcript, command line,
chat, screenshot, or committed patch.

Required API names:

```text
CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_INSTANCE_DOMAIN
CLERK_AUTHORIZED_PARTIES
CLERK_WEBHOOK_SIGNING_SECRET
MASARIFI_PUSH_TOKEN_HASH_KEY
MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS
```

Safe operational values may retain documented defaults:

```text
MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS=600
MASARIFI_CLERK_API_TIMEOUT_MS=2000
MASARIFI_CLERK_WEBHOOK_POLL_MS=500
MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS=10
MASARIFI_CLERK_RECONCILE_PAGE_SIZE=100
```

`CLERK_AUTHORIZED_PARTIES` contains web origins only. Do not add
`masarifi://oauth-callback`. The worker receives the Clerk Admin secret and push
keys but not the webhook signing secret. The migration job receives neither.

Generate push keys with an approved cryptographic secret generator and store only
their encoded values in the secret store. Hash and encryption key bytes must differ.

## 3. Start and Reset the Local Database

After setting the exact approved non-secret Clerk instance domain in the local
Supabase Third-Party Auth block:

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run migration:checksums
```

Expected result:

- all ordered migrations apply from a clean state;
- migration checksums match;
- required extensions/roles/foundation objects exist before BE-002 objects;
- all owned constraints, grants, functions, triggers, and RLS tests pass;
- `auth.users` has no Masarifi test identity;
- no private webhook/push field has an ordinary client grant.

Do not manually create schema objects in the Dashboard. Generate each new migration
with `supabase migration new <descriptive-name>` and commit the resulting SQL plus
updated checksum ledger.

## 4. Verify Static Contracts and Build

After dependencies and source exist:

```powershell
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test:unit
npm --prefix apps/api run test:contract
npm --prefix apps/api run test:openapi
npm --prefix apps/api run build
```

The contract gate composes the SPEC-BE-001 and SPEC-BE-002 OpenAPI fragments and
compares the complete runtime document. It also validates all five event payloads,
environment redaction, provider configuration constants, DTO unknown-field denial,
and the shared safe error envelope.

## 5. Start API and Worker

Use separate terminals with process-specific local secret injection:

```powershell
npm --prefix apps/api run start:dev
```

```powershell
npm --prefix apps/api run start:worker:dev
```

Expected behavior:

- API validates all required security configuration before binding.
- Worker starts no HTTP listener and does not require the webhook signing secret.
- `/health/ready` stays non-ready if database or required Clerk/Supabase trust
  cannot be established; it exposes no domain/key/provider detail.
- Logs contain safe route/job/result codes and request IDs only.

## 6. Run Authentication and Owner-Isolation Evidence

Provision three controlled accounts through the provider UI/test account system:

- Phone owner A;
- Phone owner B;
- Google owner.

Run the protected E2E harness so credentials and session tokens are read from the
approved secret source and never echoed:

```powershell
npm --prefix apps/api run test:e2e -- identity
npm --prefix apps/api run test:integration -- identity
npm --prefix apps/api run security:scope
```

Required results:

- Phone and Google resolve the same immutable text-subject model.
- Owner A cannot read/change owner B or Google rows at API and RLS layers.
- Anonymous, missing-subject, invalid issuer/signature/key/time/role/session,
  wrong present `azp`, and pending state fail before customer data access.
- An otherwise verified native token without `azp` succeeds.
- Suspended, deletion-pending, deleted, and missing profiles fail closed.
- No Supabase Auth identity is created.

The test report uses aliases and safe counts/hashes only.

## 7. Exercise Customer Contracts

Run contract/E2E cases for:

```text
GET/PATCH /api/v1/me
GET/PUT   /api/v1/me/preferences
GET/PUT   /api/v1/me/onboarding
GET       /api/v1/me/devices
POST      /api/v1/me/devices/register
DELETE    /api/v1/me/devices/:id
```

Evidence must prove:

- property allowlists and unknown-field rejection;
- masking and no fingerprint/session/push exposure;
- full preference replacement;
- approved onboarding vocabulary, unique canonical completed steps, and completion
  consistency;
- one winner under identical `expectedVersion` concurrency;
- deterministic cursor order and maximum 100 devices;
- same-owner device/token constraints and cross-owner token failure;
- current-device recent-auth denial/success;
- local revoke remains effective during Clerk outage and retry clears the linked
  session evidence;
- identical repeated revoke returns `204` without claiming durable response replay.

## 8. Exercise Webhook and Reconciliation

Use Clerk's supported test delivery mechanism or in-memory SDK-signed fixtures held
outside Git. Never capture the raw payload or signature in test output.

```powershell
npm --prefix apps/api run test:contract -- clerk-webhook
npm --prefix apps/api run test:integration -- clerk-webhook
npm --prefix apps/api run test:e2e -- clerk-webhook
```

Required results:

- raw bytes reach `verifyWebhook()` before JSON trust;
- valid new delivery returns `202` only after durable insert;
- identical signed duplicate returns `202` and one effect;
- same delivery ID/different hash fails `409 WEBHOOK_EVENT_CONFLICT`;
- valid unsupported type returns `204` and no inbox row;
- bad/stale/future signature, malformed schema, body overflow, and rate excess fail;
- two workers produce one effect; crash rolls back and retry converges;
- stale create/update/delete deliveries read current Clerk state and never regress;
- Clerk outage is retryable and never interpreted as deletion;
- reconciliation repairs a deliberately omitted delivery;
- payload becomes `{}` after seven days while hash/status/timestamps remain.

## 9. Performance and Query-Plan Evidence

Use only the disposable performance database/profile. Never point seed/cleanup
commands at production.

```powershell
npm --prefix apps/api run test:performance -- identity
npm --prefix apps/api run test:stress -- clerk-webhook
```

Required production-like dataset includes at least representative profile,
preference, onboarding, device, revoked-device, push-token, processed/failed inbox,
and redaction-history cardinalities. Capture redacted
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans for owner/non-owner profile lookup,
active-profile check, device cursor page, inbox claim, reconciliation scan, and
redaction batch.

Blocking thresholds:

- owner profile/preference lookup <=50 ms P95 database time;
- `/api/v1/me` and preference/onboarding <=250 ms P95 and <=500 ms P99;
- `/me` compressed response <=50 KiB;
- device query uses cursor index, returns <=100, and has no N+1;
- inbox processing/redaction remains bounded without active-path sequential scan;
- no unapproved Redis, queue, cache, or distributed lock appears.

The one-row provider-call transaction is an explicit measured ceiling. If it fails
throughput or connection-budget evidence, stop and approve a Master Plan/schema
change before adding leases or a queue.

## 10. Security, Container, and Recovery Gates

```powershell
npm --prefix apps/api run security:dependencies
npm --prefix apps/api run security:sast
npm --prefix apps/api run test:container
npm --prefix apps/api run verify
```

Run repository/image secret-file detection without printing matches:

```powershell
rg -l --hidden --glob '!.git/**' --glob '!node_modules/**' 'sk_(test|live)_' .
rg -l --hidden --glob '!.git/**' --glob '!node_modules/**' 'whsec_' .
```

Expected result is no source/evidence match. A template must name the variable,
not contain a realistic secret prefix/value.

Rehearse:

- previous compatible API/worker image against the additive schema;
- failed migration followed by a forward corrective migration;
- Clerk JWKS rotation and documented Supabase refresh delay;
- Clerk/Supabase/provider outage with fail-closed readiness;
- lost webhook reconciliation;
- worker crash during provider lookup;
- signing-secret and push encryption-key rotation;
- session-revoke retry after provider recovery;
- payload retention and recovery-evidence preservation.

Do not mark SPEC-BE-002 complete until every acceptance criterion has fresh command
output/evidence, the SMS provider restriction is resolved, the dashboard checklist
is verified, and no Critical/High, cross-user, unsigned/replayed webhook, secret
leak, Supabase Auth identity, or legacy JWT Template remains.
