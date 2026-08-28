# Environment Contract: SPEC-BE-002

**Validation owner**: existing SPEC-BE-001 strict environment schema
**Failure policy**: missing/invalid security configuration fails before readiness

Real values exist only in approved local/runtime secret storage. `.env.example`
contains names and safe descriptions, never usable keys. The Docker build context,
image layers, Compose files, Git, screenshots, fixtures, test snapshots, exception
messages, logs, metrics, traces, and chat must contain no secret value.

## Clerk Variables

| Variable | Class | Process | Validation | Required |
|---|---|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | safe identifier | API | trimmed Clerk publishable-key shape, 1..512; environment must match the configured instance | API startup |
| `CLERK_SECRET_KEY` | secret | API, worker | trimmed Clerk secret-key shape, 1..512; never returned/logged | API/worker startup |
| `CLERK_INSTANCE_DOMAIN` | safe configuration | API, local Supabase procedure | lowercase hostname only, no scheme/path/query/fragment/credentials, <=253; exact approved instance | API startup |
| `CLERK_AUTHORIZED_PARTIES` | safe configuration | API | comma-delimited absolute HTTP(S) origins, no wildcard/path/query/fragment/credentials, deduplicated, total <=2048 | API startup; may be empty only in isolated native-only test profile |
| `CLERK_WEBHOOK_SIGNING_SECRET` | secret | API only | supported Clerk webhook-secret shape, 1..512; never exposed to worker/clients | API startup once route is present |

Rules:

- Development accepts only Development-instance keys; production accepts only
  Production-instance keys. A mixed publishable/secret/domain environment fails.
- `CLERK_AUTHORIZED_PARTIES` contains trusted web origins, not
  `masarifi://oauth-callback`.
- The API may use the publishable key/domain as provider identifiers, but does not
  send the secret key or signing secret to any client.
- The worker uses `CLERK_SECRET_KEY` only for current-user reconciliation and
  linked-session recovery; it never receives the webhook signing secret.
- Migration process requires none of the Clerk variables and does not contact Clerk.

## Push-Token Variables

| Variable | Class | Process | Validation | Required |
|---|---|---|---|---|
| `MASARIFI_PUSH_TOKEN_HASH_KEY` | secret | API, worker | exactly 32 decoded bytes in base64url form | API/worker startup |
| `MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS` | secret | API, worker | comma list `key-id:base64url-32-byte-key`; 1..3 unique safe key IDs; first is active | API/worker startup |

Hash and encryption key material must differ; startup compares a safe digest and
fails if they resolve to the same bytes. Key IDs are non-secret safe tokens of
1..32 characters. Rotation prepends a new active encryption key, retains at most
two decrypt-only keys during bounded re-encryption, then removes retired keys after
reconciliation. The deliberately single hash key rotates only through the incident
runbook: revoke all stored push tokens, replace the key, and require fresh client
registration. No dual-hash migration path is built speculatively.

## Safe Operational Variables

| Variable | Process | Default | Allowed range / meaning |
|---|---|---:|---|
| `MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS` | API | `600` | integer 60..3600; maximum factor-verification age for current-device revoke |
| `MASARIFI_CLERK_API_TIMEOUT_MS` | API, worker | `2000` | integer 250..10000; bounded Clerk Backend API call |
| `MASARIFI_CLERK_WEBHOOK_POLL_MS` | worker | `500` | integer 100..10000; inbox idle/failure poll floor |
| `MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS` | worker | `10` | integer 1..100; terminal safe failure threshold |
| `MASARIFI_CLERK_RECONCILE_PAGE_SIZE` | worker/runbook | `100` | integer 1..100; bounded Clerk page |

The seven-day payload retention period, supported webhook types, supported phone
countries, OAuth callback, bundle/package identifiers, and algorithms are fixed
contracts, not runtime feature flags. No configuration may bypass authentication,
RLS, webhook verification, encryption, active-profile denial, or evidence gates.

## Client Variables — Deferred Cutover

These names are approved for their future owning clients but are not wired by
SPEC-BE-002:

```text
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

Only the publishable key may use a public/client variable. `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SIGNING_SECRET`, database credentials, push-token keys, and test
account credentials must never use `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`.

## Redaction and Safe Diagnostics

- Configuration validation errors name only the variable and a stable reason code,
  never its value, length-derived secret fragment, or parsed token.
- Readiness reports safe dependency state (`up`/`down`) and bounded error codes,
  never domain, issuer URL, key ID, party list, or provider response.
- Logs and metrics never include Authorization/cookie headers, JWT claims, Clerk
  subject/session/event IDs as high-cardinality labels, webhook headers/body, OTP,
  phone/email, push/fingerprint value, or any secret.
- Unit tests use nonfunctional generated placeholders kept inside test memory; no
  real-looking reusable `sk_*` or `whsec_*` fixture is committed.
- A secret-scan and built-image inspection must find zero prohibited values.

## Startup Matrix

| Condition | API | Worker | Migration |
|---|---|---|---|
| Clerk identity config missing/invalid | exits before bind | exits before work | unaffected |
| Webhook signing secret missing/invalid | exits before bind | unaffected | unaffected |
| Push keys missing/invalid/equal | exits before bind | exits before work | unaffected |
| Authorized party malformed | exits before bind | unaffected | unaffected |
| Clerk Backend API unavailable after valid startup | protected/provider actions fail safely; readiness/alerts follow contract | retains retryable work | unaffected |
| Supabase Third-Party Auth/JWKS unavailable | no alternate auth path; protected readiness fails | reconciliation remains bounded | unaffected |

## Implementation Touchpoints After BE-001 Merge

- Extend `apps/api/.env.example` with names and non-secret descriptions.
- Extend `apps/api/src/platform/config/environment.types.ts` and
  `environment.schema.ts`; keep SPEC-BE-001 unknown-`MASARIFI_*` rejection.
- Extend safe configuration tests for missing, malformed, wrong-environment,
  duplicate, equal-key, and redaction cases.
- Confirm `.gitignore`, `.dockerignore`, Docker history, and CI secret scan exclude
  local/runtime values.
