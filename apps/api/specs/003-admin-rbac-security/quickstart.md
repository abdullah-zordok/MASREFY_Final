# Quickstart: SPEC-BE-003

This is an implementation/release evidence runbook. It contains no usable secret,
credential, Clerk subject, email, token, database URL, customer data, export body,
or signed URL.

## 0. Verify the Main Baseline

Run from the repository root. Do not create a backend worktree.

```powershell
git branch --show-current
git rev-list --left-right --count HEAD...origin/main
git status --short
git log -1 --format='%H'
```

Required planning baseline: branch `main`, divergence `0 0`, base
`ecaa54a7291d8cd06b0e44e871a84790a19f3d4c`, SPEC-BE-001/002 source and migrations
present, and the active feature pointer targets `003-admin-rbac-security`. Preserve
unrelated user files including `.agents/plugins`.

Before implementation, run `speckit-tasks`, then `speckit-analyze`. Any unresolved
ownership, contract, Constitution, or Critical requirement conflict blocks code.

## 1. Record Required Approvals

Do not enable production Admin/privacy/retention routes until evidence identifies
the owners and approved values for:

- first super-admin verified Clerk identity and two-person bootstrap procedure;
- Admin invitation HTTPS redirect;
- retention resources, days, modes, and legal bases;
- deletion cooling-off period;
- export retention, maximum size/entries, and signed-URL duration;
- complete deployed privacy-handler manifest;
- alert owners, thresholds, escalation, and closure checks.

Use opaque evidence references and hashes, not identities or policy text in command
output.

## 2. Configure Secrets Privately

Extend `apps/api/.env.example` with names from
[contracts/environment.md](contracts/environment.md). Set real values only through
the approved ignored local secret file/store; never paste them into terminal
arguments, chat, screenshots, logs, SQL, or Git.

API receives the Storage signing credential, invitation redirect, and IP hash key.
Worker receives Storage upload/delete credential, IP hash key, job bounds, and
privacy manifest. Migration receives neither Clerk nor Storage service secrets.
`MASARIFI_ADMIN_ROUTES_ENABLED=false` remains the default.

Validate configuration without printing values:

```powershell
npm --prefix apps/api run test:unit -- environment.schema
npm --prefix apps/api run test:container -- image-secrets
```

## 3. Apply and Prove the Database

Use only the disposable local Supabase project:

```powershell
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
npm --prefix apps/api run db:lint
npm --prefix apps/api run test:db
npm --prefix apps/api run migration:checksums
```

Required result:

- migrations `01400`–`01900` (or their next generated timestamps) apply after the
  existing immutable history and checksums match;
- 16 tables, four named functions, triggers, indexes, schemas, seeds, and grants
  match [data-model.md](data-model.md);
- all seven system roles and all 151 client keys plus explicit aliases reconcile;
- forced RLS and the owner/non-owner/Admin/worker/service/anonymous/migration-owner
  matrix pass;
- no client role can update/delete audit, security, timeline, or grant history;
- no customer/Admin fixture or super-admin is created by migration.

Generate new migrations with `supabase migration new <name>`; never rename or edit
an applied file.

## 4. Prove Static and Runtime Contracts

```powershell
npm --prefix apps/api run typecheck
npm --prefix apps/api run lint
npm --prefix apps/api run test:unit
npm --prefix apps/api run test:contract
npm --prefix apps/api run test:openapi
npm --prefix apps/api run build
```

Contract evidence must compare runtime OpenAPI with
[contracts/openapi.yaml](contracts/openapi.yaml), validate all event payloads,
parse the environment contract, and compare the exact Admin permission/role map
and Mobile service mappings. Unknown fields, unsafe Unicode/control text,
unbounded arrays/text/cursors, missing idempotency keys, unmapped permissions, or
mock confirmation authority must fail.

## 5. Bootstrap the First Super Administrator

Keep routes disabled. Run the implemented one-off bootstrap command through the
deployment job with the approved verified Clerk subject supplied privately. The
command must:

1. verify the active SPEC-BE-002 profile and authoritative MFA evidence;
2. take the bootstrap advisory lock;
3. verify there is no existing effective super-admin assignment;
4. create/activate the Admin profile and assignment;
5. append immutable audit and enqueue the role event in the same transaction;
6. emit only safe counts, IDs/hashes, and the evidence reference.

Independently verify at least one effective active super-admin and the permission
manifest hash. Only then set `MASARIFI_ADMIN_ROUTES_ENABLED=true` in the approved
environment and redeploy. Re-running bootstrap must not create a second assignment.

## 6. Start API and Worker

Use separate terminals and process-scoped secret injection:

```powershell
npm --prefix apps/api run start:dev
```

```powershell
npm --prefix apps/api run start:worker:dev
```

Expected: API exposes only configured routes; worker opens no HTTP listener;
startup fails closed on invalid manifest/secret/config; readiness reflects required
database/queue/Clerk/Storage capability without exposing provider detail; SIGTERM
stops claims and completes/abandons bounded work within 30 seconds.

## 7. Run Exact Authorization and RBAC Evidence

Provision controlled aliases for active super-admin, each other seeded role,
inactive Admin, active customer-only identity, expired/future/revoked assignment,
and a second customer. Tokens stay in the harness secret source.

```powershell
npm --prefix apps/api run test:integration -- security
npm --prefix apps/api run test:e2e -- security
npm --prefix apps/api run security:scope
```

Prove every privileged route succeeds only with its exact permission; related or
wildcard keys, role/header/query/sessionStorage/fixture/Clerk metadata, missing
profile/Admin, expired/revoked/future role, stale version, missing MFA, self-
approval, and last-super-admin removal all deny. Permission/role changes become
effective on the next operation with no shared cache.

Exercise invitation creation and acceptance through Clerk test delivery: response
and logs never contain token/email, wrong identity cannot accept, expiry is final,
identical accepted retry returns safe current state, and exactly one assignment/
audit/event results. Exercise Admin disable/session revocation with provider outage;
local authorization denial remains fail-closed and reconciliation records outcome.

## 8. Run Audit, Support, and Incident Evidence

```powershell
npm --prefix apps/api run test:contract -- security
npm --prefix apps/api run test:integration -- support-access
npm --prefix apps/api run test:e2e -- audit security-incidents
```

Required:

- privileged mutation, audit append, and outbox event commit or roll back together;
- audit/security/timeline evidence rejects update/delete for every runtime role;
- lists are cursor-bounded and redacted; owner A never sees owner B;
- raw IP, token, email, provider payload, purpose, unbounded user agent, before/
  after values, and support workspace content stay out of logs/metrics/errors;
- support requester cannot approve; customer approval is enforced when required;
  approved scope/duration cannot widen; 5–60 minute client and 24-hour hard bounds
  hold; each use rechecks grant/target/scope/time/revocation and appends evidence;
- revoke/use and expiry/use races deny after revocation/expiry;
- incident transitions, version races, timeline order, audit, event, and alerts pass;
  delivery failure preserves committed evidence.

## 9. Run Privacy, Deletion, Retention, and Storage Evidence

Use synthetic canary data and the private test bucket only.

```powershell
npm --prefix apps/api run test:integration -- privacy retention
npm --prefix apps/api run test:e2e -- privacy retention
```

Prove one active export/deletion request per owner, identical retry returns the same
resource, cross-owner access is hidden, and ready download requires fresh auth.
ZIP evidence must include every registered handler once, deterministic manifest,
bounded safe paths/types/count/bytes, matching checksums, no executable/path
traversal entry, no missing-domain success, and no full-memory buffering. Lists
contain no URL/key; ready URL lasts only the configured minutes; object expiry and
deletion are independently enforced.

Deletion must respect cooling-off/cancellation, recheck each hold, invoke every
handler idempotently, revoke sessions, transition the profile through the owned
identity handler, and store only safe counts/policy outcomes. Retention must use
the registered owner handler, recheck holds immediately before each object, bound
batches/cursors, and never accept a client table name or SQL statement.

## 10. Measure Performance and Plans

Seed a disposable production-like dataset with role fan-out, expired assignments,
one million redacted audit/security rows, concurrent support grants, privacy/
deletion backlog, retention candidates/holds, and failed/retry job state. Never run
seed/cleanup against production.

```powershell
npm --prefix apps/api run perf:check
npm --prefix apps/api run test:performance -- security
npm --prefix apps/api run test:stress -- security
```

Capture redacted `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for exact permission,
Admin/assignment/invitation lists, owner/Admin security events, audit cursor,
support grant assertion, incident list, privacy/deletion claims, and retention
hold/candidate checks.

Block release if any threshold in the plan Evidence Plan fails, an active path uses
an unbounded sequential scan/N+1, or the single polling worker exceeds approved
backlog age. Do not add Redis or split workers without measured evidence and an
approved plan change.

## 11. Security, Image, Restore, and Rollback Gates

```powershell
npm --prefix apps/api run security:dependencies
npm --prefix apps/api run security:sast
npm --prefix apps/api run test:container
npm --prefix apps/api run verify
```

Run approved repository/image secret and evidence scans in filename-only/redacted
mode. Expected result is no Clerk/Storage key, invitation token/hash, JWT/cookie,
raw IP/email, signed URL, export body, support purpose/workspace value, or customer
data in Git/image/log/evidence.

Rehearse and record:

- backup restore plus migration/checksum/permission/audit reconciliation;
- migration failure followed by a forward corrective migration;
- previous compatible API/worker image against the additive schema;
- route disable and worker stop without deleting queued/history rows;
- worker crash during ZIP/upload/deletion and safe retry/reconciliation;
- Clerk and Storage outage/rotation; invitation/session/export recovery;
- super-admin recovery with two-person approval;
- support emergency revocation, audit append failure, incident alert failure,
  export leak/expiry, deletion pause/resume, retention hold conflict.

Completion requires fresh evidence for every acceptance criterion and zero
exploitable Critical/High, cross-user RLS access, exact-permission/MFA bypass,
self-approval, last-super-admin loss, mutable audit, over-broad support access,
privacy/URL leak, hold bypass, missing handler success, secret/PII log leak, or
critical alert/runbook ownership gap.
