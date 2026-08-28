# Security Evidence — SPEC-BE-002

| Gate | Local evidence | State |
|---|---|---|
| Forced RLS / least grants / Admin denial | `supabase test db`: 8 files, 308 tests | Pass 2026-08-28 |
| Official Clerk verification | `clerk-token-boundary`, `clerk-webhook.contract`, `clerk-webhook-boundary` | Pass locally |
| Push HMAC/AES-GCM | `push-token.crypto.spec.ts` | Pass locally |
| Safe response/log/metric projection | identity security suites plus logger/metrics unit tests | Pass locally |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities | Pass 2026-08-29 |
| Repository/history/image secret scan | Worktree files: 0; Git-history matches: 0; container secret suite passed without printing values | Pass 2026-08-29 |
| SAST and container image | TypeScript + ESLint pass; refreshed release image 4 suites/9 tests, non-root/read-only/no-dev-dependency/no-baked-secret checks; Trivy 0 fixed HIGH/CRITICAL | Pass 2026-08-29 |
| Application security suites | Local `npm run verify`: 9 security suites, 50 tests | Pass 2026-08-29 |
| Remote branch workflow | Run `33211892554`: application/database/Gitleaks/redaction/container/image-digest/Trivy | Pass 2026-08-29 |
| Provider-backed replay/owner matrix | One Google identity passes guard/hosted token acceptance/local owner RLS; two Phone identities and hosted schema remain unavailable | Partial |

No local or branch-CI pass substitutes for the unresolved Apple Team ID, hosted schema/RLS, two Phone identities, deployed webhook endpoint/secret store, or tag-only SBOM, image-signature, and provenance gates.
