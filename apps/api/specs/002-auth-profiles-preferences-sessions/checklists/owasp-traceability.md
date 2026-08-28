# OWASP / MASVS Traceability — SPEC-BE-002

| Control area | Evidence | State |
|---|---|---|
| ASVS identity/session verification | `clerk-auth.guard.spec.ts`, `clerk-token-boundary.spec.ts`, `identity-errors.contract-spec.ts`: SDK issuer/role/party/time negatives and no fallback | Local pass; provider rotation open |
| ASVS access control / OWASP API1:2023 | pgTAP 004-008, `rls-request-context.spec.ts`, `admin-boundary.e2e-spec.ts`: forced RLS, local subject, non-owner/Admin denial | Pass |
| OWASP API2:2023 authentication | `provider-configuration.md`, auth guard/error contracts: Password disabled; Phone/Google only; safe errors | Local pass; dashboard country gate blocked |
| OWASP API3:2023 property authorization | profile/device/onboarding contract and exposure suites: strict DTOs, server-owned fields, masked projections | Pass |
| OWASP API4:2023 resource consumption | validation contracts, `clerk-webhook-boundary.spec.ts`, SQL EXPLAIN fixtures: body/page/time/rate/one-row bounds | Local pass; authenticated load evidence open |
| OWASP API8:2023 misconfiguration | `environment.schema.spec.ts`, `entrypoints.spec.ts`, native-integration/no-template contract | Local pass; hosted verification open |
| OWASP API10:2023 unsafe API consumption | `clerk-client.service.spec.ts`, webhook worker tests: bounded official client, timeout, 404/outage separation | Pass |
| OWASP Top 10:2025 injection/crypto/logging | pg parameterization, `push-token.crypto.spec.ts`, identity exposure/logger/metrics suites, local secret scans | Pass locally |
| MASVS AUTH/STORAGE/NETWORK | `client-mapping.md`, Mobile mapping/scope contracts: Clerk sessions, publishable-only clients, no client secret/token storage | Mapping pass; Mobile cutover deferred to SPEC-BE-014 |

Any accepted unsigned/replayed webhook, cross-user access, secret/PII leak, legacy template, Supabase Auth identity, or exploitable Critical/High remains release-blocking.
