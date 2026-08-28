# Definition of Done — SPEC-BE-002

- [x] Backend implementation exists on the existing `codex/backend-spec-be-002` delivery branch without a new worktree.
- [x] Mobile/Admin source remains unchanged.
- [x] Local schema/RLS/contract/unit/integration/security/E2E coverage exists for owned behavior.
- [x] No Supabase Auth user/session table, legacy Clerk JWT Template code, Admin route/role, or client secret wiring was introduced.
- [x] Clerk SMS restriction for exactly Egypt/Saudi Arabia/UAE is provider-verified.
- [x] Android Development SHA-256 and the sole `masarifi://oauth-callback` redirect are configured.
- [ ] Apple Team ID is still required to complete iOS Native Applications.
- [x] Clerk native Supabase integration is enabled and the legacy JWT Template list is empty.
- [x] Hosted Supabase Third-Party Auth contains the exact Clerk domain and is enabled.
- [x] One real asymmetric Google session passes the official Clerk guard and hosted Supabase Third-Party Auth; a corrupted token fails closed.
- [x] The real Google session passes local owner/non-owner RLS and leaves no test rows.
- [ ] Hosted Supabase still needs its canonical schema plus a real owner/non-owner RLS test.
- [ ] The Google protected alias exists; two Phone aliases and the full three-identity matrix remain open.
- [x] Container, dependency, SAST, and secret/history/image gates pass locally.
- [ ] Authenticated/provider-backed release validation passes; remaining k6/stress is explicitly skipped by the user and is not counted as a pass.
- [x] Delivery commits through CI/security fix `bcf45bb` are pushed to `origin/codex/backend-spec-be-002` without force or merge.
- [ ] Remote CI/image/vulnerability gates pass; SBOM/signature/provenance remain release-tag-only and have not run.

Current status: the local implementation, clean database/migration recovery,
security/container, local outage recovery, runbook tabletop, exact SMS allowlist,
and real Google-token gates pass. Release remains blocked by hosted schema/RLS
validation, the iOS Team ID, two Phone identities, a deployed webhook URL/secret
store, and tag-only signed release evidence.
Remaining k6 was skipped by explicit user instruction and is not reported as pass.

Latest local verification (2026-08-29): `npm run verify` passed (172 unit, 83 contract, 50 security, build, checksums, audit, and workflow pins); the explicit live-database runs passed 48 integration and 18 E2E tests; pgTAP passed 308 assertions; the refreshed release image passed 9 container assertions and Trivy reported zero fixed HIGH/CRITICAL vulnerabilities.

Final local scope review (2026-08-28): current branch is
`codex/backend-spec-be-002`; `git diff --check`, client-diff,
migration-checksum, ownership-path, worktree-secret, and full-history-secret checks
pass. The ignored local `apps/api/.env` contains only the approved non-secret domain
and localhost origin plus the required Clerk publishable/secret keys copied directly
from the Dashboard without printing either value; the webhook secret remains empty.
The unrelated untracked
`.agents/plugins/` entry remains untouched. Only SPEC-BE-002-owned API/Supabase
paths were committed (114 files, with zero client paths or secret values); no
worktree or merge was used.

Delivery evidence (2026-08-29): implementation commit `056640f`, provider/guard fix
`d0db2b7`, and remote-forward-fix commits through `bcf45bb` were pushed to
`origin/codex/backend-spec-be-002`. Manual workflow run
`33211892554` passed application, live database, Gitleaks/redaction, release-image,
container, non-root, image-digest, and Trivy gates with k6 explicitly skipped. The
signed-release-evidence job was correctly skipped because this branch run is not a
`backend-v*` release tag; no PR or merge was created.
