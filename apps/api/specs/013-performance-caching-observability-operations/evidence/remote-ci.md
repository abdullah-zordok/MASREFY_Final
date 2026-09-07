# Phase 13 remote CI evidence

Date: 2026-09-07

Implementation SHA: `1dc2ca52c687020802ad42a35e7e1a5ec29388ed`

Required workflow: [Backend Foundation run 34111519378](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34111519378) — **PASS**

## Required jobs

| Job | Result |
|---|---|
| secrets | PASS |
| sentinel-redaction | PASS |
| application | PASS |
| mobile | PASS |
| admin quality/build/production shell performance | PASS |
| admin-e2e desktop-1440 | PASS |
| admin-e2e desktop-1280 | PASS |
| admin-e2e tablet-1024 | PASS |
| admin-e2e tablet-768 | PASS |
| admin-e2e mobile-390 | PASS |
| database, recovery, performance, and stress | PASS |
| backend image build, container contracts, non-root assertion, and Trivy HIGH/CRITICAL scan | PASS |

The workflow started at `2026-09-07T10:27:13Z` and completed successfully at `2026-09-07T10:56:32Z`.

## Immutable artifacts

- Performance evidence: `backend-1dc2ca52c687020802ad42a35e7e1a5ec29388ed-performance-evidence`, artifact ID `10015242247`.
- Image evidence: `backend-1dc2ca52c687020802ad42a35e7e1a5ec29388ed-image-evidence`, artifact ID `10015494441`.
- Backend image digest: `sha256:14a348294a3c2880ec3cb7af8542e5ad147a11b55874df6df89bf4861ddce5e1`.
- SBOM, signature, and SLSA provenance: not produced for this `main` push. The workflow restricts signed release evidence to `backend-v*` tags, so the job was correctly skipped rather than represented as passed.

## Forward-fix history

- Run `34093553621` failed because the legacy shell responsiveness test measured the Webpack development server; commit `1aff5e6` moved that unchanged 2,500 ms budget to the production server.
- Run `34096910945` exposed invalid nested paragraph markup in the shared Admin communication text component; commit `05d7c56` changed the shared root to an inline element and added a regression assertion.
- Run `34105988116` had a 507.09 ms sync p95 against the unchanged 500 ms budget and an Admin runner that remained active for 239 minutes. Commit `1dc2ca5` isolated the five unchanged viewport suites into matrix jobs. The final run passed the original database and browser thresholds without weakening them.

