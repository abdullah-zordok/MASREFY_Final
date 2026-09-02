# Cross-Artifact Analysis

## Pre-implementation pass

The repository lacks the SpecKit prerequisite script, so the already verified
feature paths were used. The read-only analysis covered the complete Constitution
and the Phase 08 specification, plan, tasks, data model, and contracts.

Initial metrics: 50 buildable requirements (FR-001–FR-040 and SC-001–SC-010),
139 tasks, 100% requirement coverage, 0 Critical, 6 High, 4 Medium, 0 unresolved
placeholder, and 0 duplicate requirement.

Resolved findings:

| ID | Severity | Resolution |
|---|---:|---|
| I1 | High | Owner review/duplicate API paths now match the specification. |
| I2 | High | Normalized imports now use `schemaVersion`, `sourceItemKey`, `receivedAt`, and the specified optional parsed fields. |
| I3 | High | Owner intake cannot assert the trusted provider source/channel. |
| I4 | High | OpenAPI now includes the specified Admin CRUD, retry/cancel, version/corpus/publish, unsupported, and settings operations plus compatibility routes. |
| I5 | High | Generic response objects were replaced by a closed bounded Phase 08 resource schema; implementation tasks require operation-specific runtime mapping tests. |
| I6 | High | The plan now matches the three additive migration files in the task ledger. |
| I7 | Medium | Plan wording now points to bounded handlers and the authoritative event contract instead of stale counts. |
| I8 | Medium | One raw `text/csv` body is the canonical one-file upload contract in spec and OpenAPI. |
| C1 | Medium | The planned pgTAP range now matches suites 033–036; corpus/seed assertions live in 035. |
| C2 | Medium | T088 now explicitly starts with failing API and Admin-Web adapter/mock-boundary tests. |

Post-remediation validation: OpenAPI parses with unique YAML keys, 56 paths, and
72 unique operation IDs; all 139 tasks still match the required format; no
Critical/High finding remains. The post-implementation pass is retained below when
code and final evidence exist.
