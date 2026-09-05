# Local verification

Executed on 2026-09-05 from the existing `main` checkout:

- API `npm run verify`: TypeScript, ESLint, performance syntax, 111 unit suites/810
  tests, 63 contract suites/190 tests, 24 non-live integration suites/54 tests, 24
  non-live E2E suites/34 tests, API/worker/migration builds, checksums, High audit,
  and 39 security suites/130 tests passed. The API audit reports one Moderate `qs`
  advisory and no High/Critical failure.
- Reset/lint/pgTAP: clean reset applied migrations through Phase 11; schema lint
  returned zero issues; 50 files/1,615 tests passed.
- Full live database integration after the cleanup correction passed 86/86 suites
  and 214/214 tests from a clean reset.
- Live Phase 11: 11 integration suites/11 tests, 13 security suites/24 tests,
  recovery 2/2, performance 4/4, and stress 2/2 passed.
- Migration/platform recovery: migration 4/4, queue/database integration 4/4, and
  foundation E2E 3/3 passed.
- Mobile: typecheck passed; ESLint passed with 0 errors and 79 existing warnings;
  Jest passed 414 suites/1,681 tests. Focused live-adapter suites passed 3 suites/17
  tests.
- Admin: typecheck, ESLint, build, and Vitest passed (72 files/796 tests). Phase 11
  Playwright under `CI=true` passed 12 tests across five viewports with 8 intentional
  desktop-only skips; the earlier desktop-only run passed 4/4. The full remote
  browser matrix passed 310 tests with 284 intentional viewport skips.
- Container: image `masarifi-backend:spec-be-011` built; 10 suites/22 tests passed;
  configured user is `65532:65532`; local digest is
  `sha256:9bb7602c514b9240e5f5d7b6545eab94a175b03aff982f16f70f497797974a5e`.
- Security/supply chain: changed-diff Gitleaks v8.30.0 and the CI-pinned v8.24.3
  found zero leaks; the broader 121-commit history scan reported six redacted legacy
  findings. Trivy v0.69.3 found zero fixable Critical/High OS or Node vulnerabilities
  in the built image. Syft v1.42.2 generated a CycloneDX JSON SBOM successfully.
- Cross-phase load harness: after matching its connection pool to its five virtual
  users, clean-reset Sync k6 passed unchanged thresholds with delta P95 74 ms and
  mutation P95 55 ms; the corrected gate also passed remotely.
- Formatting/checks: Prettier applied to Phase 11 TypeScript/docs/workflow, workflow
  YAML parsed through Prettier, migration checksums verified, and `git diff --check`
  returned no whitespace errors.

Deterministic provider/scanner suites are simulation-only. Real provider credentials,
physical devices, SMTP receipt, deployed Storage, and production telemetry are named
external gates and are not represented as local successes.
