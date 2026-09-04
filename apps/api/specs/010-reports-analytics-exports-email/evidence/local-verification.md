# Local Verification

Date: 2026-09-04
Scope: SPEC-BE-010

## Passed

- `npm run verify`: exit 0 against the live database. TypeScript, ESLint, k6
  syntax, build, migration checksums, dependency high-severity threshold, and
  security workflow-pin checks passed. Jest totals were 103/103 unit suites
  (773 tests), 54/54 contract suites (172 tests), 75/75 integration suites (203
  tests), 37/37 E2E suites (65 tests), and 27/27 security suites (114 tests).
- Phase 10 focused suites passed: unit 10 suites/69 tests, contract 6/15,
  integration 8/24, security 4/11, SMTP 4/14, recovery 1/4, report performance
  3/8, and stress 1/4.
- Open-handle diagnostics passed when split by Jest project to avoid the roughly
  2 GB overhead of one combined diagnostic process: unit 10/69, contract 6/15,
  integration 8/24, E2E 1/1, and security 4/11.
- Unit coverage for `src/reports/**/*.ts` was retained at 45.08% statements,
  43.10% branches, 40.83% functions, and 46.79% lines. Focused suites were rerun
  cleanly for flake evidence.
- Phase 10 source/test Prettier check and `git diff --check`: exit 0.
- Repository-wide `npm run format:check`: exit 0 after mechanically formatting
  three tracked baseline files and excluding the protected, untracked
  `pnpm-lock.yaml` from formatting. API typecheck remained green; the two
  affected live-database specs loaded successfully and skipped because the
  database is unavailable.
- `npm audit --audit-level=high`: exit 0 with one Moderate `qs` advisory and no
  High/Critical advisory.
- `npm run test:container`: PASS, 10 suites/22 tests. The release image
  `masarifi-backend:spec-be-001` has digest
  `sha256:95afb339482c7d495eed0355fe9fe37d2298e87f8a9f985f8db772f71dd99a4c`,
  is 84 MB with 354 packages, and Docker Scout found zero Critical, High,
  Moderate, or Low CVEs.
- The generated SPDX SBOM is 774,467 bytes with SHA-256
  `71d551658c0a4e908a4baa8625f618d5570cbea39cbe7c709c1ee37177704e8b`.
- Diff secret-pattern scan: zero candidate credential/private-key hits. Diff path
  scan: zero SPEC-BE-011+ or notification-owned paths.

The final `npm run format:check`, live-database `npm run verify`,
`npm run test:release-image`, Docker Scout scan, SBOM generation, workflow YAML
parse, and `git diff --check` reruns all passed after the evidence update.
