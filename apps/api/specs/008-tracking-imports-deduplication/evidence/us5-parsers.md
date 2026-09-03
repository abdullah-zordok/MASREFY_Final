# US5 Evidence — Parser Stewardship

Status: implemented, including Admin route alignment and corpus publication
guards.

Evidence:

- Parser rules, parser rule versions, parser test cases, financial
  institutions, institution senders, merchant rules, and category rules are
  represented in migrations and Admin APIs.
- Parser definitions are constrained JSON data; no runtime code, SQL, network,
  filesystem, URL fetch, environment access, or unrestricted regex execution is
  admitted.
- Publication requires enabled corpus cases to pass and preserves immutable
  version traceability. Rollback selects an earlier passing version rather than
  rewriting history.
- Admin imports/parsers repository now consumes authenticated backend-shaped
  routes; MSW remains an explicit test/development boundary.
- Focused Admin imports/parsers Playwright:
  - desktop project: 8 passed.
  - all projects: 12 passed, 28 skipped by viewport policy.

Acceptance mapping: FR-010 through FR-015, FR-027, FR-030, FR-036, AC-005,
AC-006, AC-015, AC-016.
