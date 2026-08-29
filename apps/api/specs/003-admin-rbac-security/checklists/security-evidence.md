# Security evidence

| Gate | Fresh result |
| --- | --- |
| Dependency audit | `npm audit --audit-level=high`: 0 vulnerabilities |
| SAST/type/lint | TypeScript and ESLint pass |
| Permission/event/OpenAPI contracts | 26 suites / 105 tests pass |
| Negative and workflow security | 13 suites / 67 tests pass |
| Scope/ownership | 2 suites / 9 tests pass; Admin/Mobile source diff empty |
| Secret/log/provider boundaries | environment, logger, exception, Clerk, Storage, ZIP, abuse, and workflow-pin suites pass |
| Codex Security diff review | final-snapshot scan `c10471fd-62af-45da-9874-69fcc23b2326`; 40/40 review items, complete coverage, 0 findings |
| Database grants/RLS/immutability | pgTAP 009–015 passed on clean local database before the host WSL failure; clean Linux rerun is a release CI gate |
| Image vulnerability/secret/non-root | clean Linux image build, container contract, and Trivy Critical/High scan are required in remote release evidence |

No credential, canary value, raw invitation token, raw network address, signed URL, or Storage object key is retained in this evidence.
