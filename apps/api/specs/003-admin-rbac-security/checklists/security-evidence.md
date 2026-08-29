# Security evidence

| Gate | Fresh result |
| --- | --- |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| SAST/type/lint | TypeScript and ESLint pass |
| Permission/event/OpenAPI contracts | 26 suites / 105 tests pass |
| Negative and workflow security | 13 suites / 67 tests pass |
| Scope/ownership | 2 suites / 9 tests pass; Admin/Mobile source diff empty |
| Secret/log/provider boundaries | environment, logger, exception, Clerk, Storage, ZIP, abuse, and workflow-pin suites pass |
| Codex Security review | final-snapshot scan `c10471fd-62af-45da-9874-69fcc23b2326`: 40/40 items, 0 findings; follow-up production/migration scan `9109768b-1be1-41de-807a-cb192f3d066d`: 2/2 items, 0 findings |
| Database grants/RLS/immutability | clean Linux reset/lint plus all 15 pgTAP files (394 assertions) passed on release tag `backend-v0.3.2` in run `33252556673` |
| Image vulnerability/secret/non-root | clean Linux image/container contract, non-root UID/GID `65532:65532`, Trivy Critical/High gate, and digest `sha256:b6e2a53a812d0d86173b07ee7f265507b07c025588159bfdb1c04f5346a9c9f9` passed in run `33252556673` |
| Release supply chain | CycloneDX SBOM, SLSA v1 provenance, two keyless attestations, and the SBOM keyless signature were generated and verified with Cosign v3.0.6 in run `33252556673` |

No credential, canary value, raw invitation token, raw network address, signed URL, or Storage object key is retained in this evidence.
