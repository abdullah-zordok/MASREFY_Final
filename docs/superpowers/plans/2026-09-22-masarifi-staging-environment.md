# Masarifi Staging Environment Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` task by task. This plan uses checkboxes to track work; record actual evidence and never treat a blocked external gate as a pass.

**Goal:** Bring up an isolated, signed-Android Masarifi staging environment from the canonical repository and verify its real API, worker, Admin, database, auth, AI, voice, push, tracking, reminders, and recovery paths.

**Architecture:** A signed internal Android APK and one staging Admin origin call an HTTPS staging API. One immutable backend image runs migration once, then separate API and worker processes against an isolated Supabase project. Clerk owns staging identities; OpenRouter, Expo/FCM, and sandbox SMTP are external worker providers. No production resource or customer data is used.

**Tech Stack:** Node 24, NestJS, Next.js, Expo/EAS, PostgreSQL/Supabase, Clerk, Docker, GitHub Actions, OpenRouter, Expo Push/FCM.

**Spec:** User-provided Masarifi staging brief in this task; see also `docs/runbooks/STAGING_SETUP_GUIDE.md`.

## Global constraints

- Canonical source: `masarifiratibi-spec/masarifi.ratibi_app`, accepted runtime SHA `6a2beb83420ac3c6fd19b42c18b42257ae4f97b8`; never replace it with older `origin/main`.
- Staging only: no production deployment, app-store distribution, production users, or production data.
- Never print, commit, log, or paste credentials, tokens, raw SMS, audio, or financial PII into GitHub evidence.
- No purchase, account-level deletion, security-control downgrade, or production-impacting action without explicit authorization.
- Prefer free services only where they satisfy the existing authentication, privacy, worker, and recovery contracts.
- Use `PASS`, `FAIL`, or `BLOCKED` for each acceptance row; skipped is not pass.

## Review focus

- Wrong-owner credentials or mixed production/staging project IDs must fail inventory before deployment.
- Supabase Free pausing and missing automatic backups must not be reported as continuous availability or PITR.
- Clerk Hobby MFA limits must not be bypassed for sensitive Admin actions.
- Expo push tokens must route through Expo; a direct-FCM canary is not proof of the current Mobile flow.
- Controlled SMS tests must not read existing device messages, and duplicate imports must yield one reviewed financial effect.

## Current state and dependencies

The accepted runtime code is `6a2beb83420ac3c6fd19b42c18b42257ae4f97b8`; GitHub Actions run `35790588649` is its exact-SHA verification run. It passed secrets, redaction, API, database, Admin, five Admin E2E viewports, Mobile, image, Compose-contract, container, non-root, digest, and Trivy checks; `signed-release-evidence` was intentionally skipped because no release tag was used. The CLI GitHub identity has repository write access but not admin access; no repository secrets or variables are configured. An isolated Free-plan Supabase project, `Masarifi Staging` (`qcffvfbpzvpwcwxwjyro`, `eu-central-1`), is active with all 70 canonical migrations applied, exact remote history, zero security-advisor lints, no `PUBLIC`-executable application `SECURITY DEFINER` functions, private application buckets, and a successful rollback-only two-owner RLS proof. The latest migration keeps Voice disabled and replaces its non-ZDR-compatible OpenAI primary with the currently ZDR-compatible Google Flash/Flash Lite route. Separate least-privilege API and worker login roles now exist without passwords and can assume only their matching group roles; credentials remain pending until a restricted VPS secret store exists. Clerk staging trust/webhooks, VPS, DNS, providers, backup/restore, and signed APK evidence remain pending. Firebase is open in an unrelated Google account and requires MFA. EAS is logged into `abdallazordok`, and the configured project is `@abdallazordok/masarifi-mobile`. No Android device is currently attached; any later device test must avoid pre-existing SMS. The worker requires SMTP variables even for the first production-mode boot.

## Tasks

### Task 1: Repository baseline and evidence

- [x] Confirm the canonical remote/branch, migration checksums, Gitleaks, and all jobs on the accepted SHA. Preserve the run URL and image evidence without secrets.
- [x] Update `docs/runbooks/STAGING_SETUP_GUIDE.md` to the canonical repository/SHA and remove stale claims that external staging has already been configured.
- [x] Fix the confirmed migration-role cleanup defect, retain the focused privilege regression test, and accept the new SHA only after the full CI run passes.

**Verification:** `git status --short`; `git rev-parse HEAD`; `npm --prefix apps/api run migration:checksums`; `gh run view <accepted-run> --repo masarifiratibi-spec/masarifi.ratibi_app`; Gitleaks reports no new secrets. Expected: all release-critical jobs successful; tag-only signing may be skipped.

### Task 2: Account ownership and resource inventory

- [ ] Inspect GitHub, Supabase, Clerk, Vercel, Hostinger/VPS, Firebase/Google, Expo/EAS, OpenRouter, and SMTP account ownership, plan limits, regions, existing projects, and production-data isolation. Do not read secret values.
- [ ] Use an existing staging resource only after verifying it is separate from production and owned by the intended Masarifi account. If authentication/MFA is missing, request exactly one user action at that step, then resume.

**Verification:** Redacted inventory names the owner, resource, purpose, plan, access level, and isolation evidence for each service. Expected: no production resource selected. Human-only: login/MFA, permissions, billing, DNS ownership, or unavailable credential creation.

### Task 3: Clerk and Supabase staging foundation

- [ ] Create/select a separate Clerk staging application with a Production instance and configure Phone/Google methods, issuer, authorized parties, required role claim, and signed `user.created`, `user.updated`, `user.deleted` webhook.
- [x] Create an isolated Supabase staging project and apply the 70 canonical migrations with exact timestamp/name history. Local migration, lint, pgTAP, application, and image gates passed in run `35790588649`; the hosted project was never reset.
- [x] Create separate API and worker login roles without owner/superuser/`BYPASSRLS`; bind them only to their matching repository roles. They intentionally have no passwords until a restricted VPS secret store exists. Private Storage and rollback-only two-owner RLS are verified. Clerk third-party trust, real-token/API isolation, Admin authorization, webhook replay/signature, and expired/wrong-issuer token checks remain.
- [x] Run mutating pgTAP from a zero-state disposable CI database; use only read-only structural queries and controlled rollback-only identities on shared staging.

**Verification:** migration checksum and remote-history match; local pgTAP green; hosted schema/extensions/functions/triggers match; role attributes are least privilege; owner B cannot read owner A; invalid Clerk tokens/webhooks fail closed. Human-only: intended-account Supabase/Clerk login, missing permissions, paid MFA entitlement.

### Task 4: Persistent host, image, SMTP, and Admin

- [ ] Prefer an authorized isolated staging VPS; if none exists, stop at the exact compute-resource step rather than redesigning the persistent worker for sleeping serverless hosting.
- [ ] Add only secret-free staging deployment manifests/templates needed for HTTPS reverse proxy, one image digest with migration/API/worker commands, non-root/read-only containers, private readiness, bounded resources, ClamAV, process-specific `0600` env files, restart/log/alert controls, and N-1 rollback.
- [ ] Use a free TLS SMTP sandbox and controlled recipients, because worker startup requires SMTP. Keep credentials worker-only. Publish the image by digest after CI/image scan.
- [ ] Inspect Vercel account/project/plan. Host staging Admin there only if plan terms and account ownership allow; otherwise host it on the staging VPS. Build with live mode, exact HTTPS API origin, staging Clerk keys, and mocks disabled. Bootstrap a real staging superadmin only with the required independent approver.

**Verification:** public `/health/live` 200, private `/health/ready` 200 or expected 503 under outage, worker queue drains, SIGTERM is graceful, SMTP canary is visible in sandbox, ClamAV clean/EICAR behavior matches policy, Admin login/RBAC/audit works, and browser requests hit only staging API. No secret appears in build/client bundles/logs. Human-only: VPS/DNS if absent, Vercel login/plan, independent Admin approver.

### Task 5: Firebase, Expo, and signed Android preview

- [ ] Create/select Firebase staging Android app `com.masarifi.mobile` and a new Expo project under the intended Masarifi owner. Update `apps/mobile/app.json` project ID and public `google-services.json` reference; bind `preview` explicitly in `apps/mobile/eas.json`.
- [ ] Store FCM v1 service-account credential only in EAS, never Git. Set `EXPO_PUBLIC_CLIENT_MODE=live`, HTTPS `EXPO_PUBLIC_API_URL`, and staging `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in EAS preview. Configure signing and build an internal APK from the accepted SHA.
- [ ] Configure the worker's Expo push provider for Mobile's Expo tokens; leave direct FCM/APNs worker credentials unset unless a corresponding client token path is actually enabled.

**Verification:** `eas project:info` names intended owner/project; prebuild/typecheck/lint/quality/Jest pass; signed APK source SHA and signature recorded; `adb install` succeeds; first launch, token registration, Expo receipt, and foreground/background/killed push behavior pass on the connected physical device. Human-only: intended EAS/Firebase login/MFA and any device consent prompts.

### Task 6: AI, Voice, tracking, reminders, and end-to-end acceptance

- [ ] Prove unrelated and simple financial Chat paths make zero OpenRouter calls. Revalidate live text/audio model availability, strict JSON support, ZDR/no-training, allowlist, limits, and price before enabling. Store a staging-only spend-limited key in the worker. Run redacted corpus and outage tests; publish routes through audited recent-MFA Admin actions.
- [ ] On the signed device, verify onboarding, Phone/Google auth, Home, accounts/categories/ledger, offline sync, budgets/savings/obligations, Arabic RTL/English LTR, deep links, SMS and notification-listener tracking, AI Chat, Voice, reminders, push, reports/email, and support attachments using staging test data only. Never enumerate pre-existing SMS.
- [ ] Test malformed/duplicate tracking events, consent/permission denial, recording denial/silence/unclear audio, no pre-confirmation mutation, idempotent confirmation, provider outage/retry, quiet hours, stale reminder suppression, and cross-owner access denial.
- [ ] Trigger critical alerts, restore an encrypted database and separate Storage backup into an isolated target, measure RPO/RTO, and rehearse N-1 application rollback followed by forward recovery. Supabase Free has no PITR; mark it `BLOCKED` rather than `PASS` unless a paid plan is already authorized.

**Verification:** every row in `docs/runbooks/STAGING_SETUP_GUIDE.md` records `PASS`, `FAIL`, or `BLOCKED`, accepted SHA/build IDs, UTC time, redacted request/job IDs, and evidence. Zero-token paths show no provider usage; confirmed actions create exactly one ledger effect; backup restore reconciles; N-1/forward smoke checks pass. Human-only: provider credential/approved spend, paid MFA if required, controlled test-SMS sender, and any unavailable physical-device action.

## Rollback and completion

Pin migration/API/worker to one immutable image digest; retain the previous compatible digest and Admin artifact. Stop worker claims and traffic cleanly before application rollback. Keep additive migrations; use a verified isolated restore or a corrected forward migration for database recovery, never an improvised down migration. Disable AI routes/provider mode for an AI incident without disrupting core finance.

Final report must state `CODE READY`, `CI READY`, `STAGING CONFIGURED`, `STAGING VERIFIED`, `CLIENT APK READY`, and `PRODUCTION READY` separately. The target for the first five is `PASS`; `PRODUCTION READY` remains out of scope. List every failed, skipped, and blocked check and the exact next human-only action. No production deployment or store submission is part of this plan.
