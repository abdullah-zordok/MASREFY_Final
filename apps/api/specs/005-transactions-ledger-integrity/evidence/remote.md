# Phase 05 Remote Release Evidence

Recorded 2026-08-30 for SPEC-BE-005.

## Integrated revision

- `db5066e` — immutable ledger, transfers, idempotency bridge, authorization,
  operations, and test implementation.
- `82a61ba` — verified local release evidence.
- `4fb3295` — verified branch-push evidence.
- `7f972e7` — non-secret replay fixture correction.
- `ec8e21c` — isolated, contract-aligned ledger performance scenarios.
- `origin/codex/spec-be-005` and `origin/main` were fast-forwarded without
  rewriting history to exact production SHA
  `ec8e21c6983cdb0abe7b1f0355cf5e835281d562`.
- Annotated immutable tag `backend-v0.5.0` points to that exact SHA and was
  pushed without rewriting any branch or tag.

The pre-existing dirty primary checkout at
`D:\MY Work\0Part_Time\MASREFY _Final` was not cleaned, reset, moved, staged,
committed, or used for Phase 05 writes.

## Main verification

- Workflow: `Backend Foundation`
- Main run:
  [33311567050](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33311567050),
  attempt 2 — success on exact SHA `ec8e21c6983cdb0abe7b1f0355cf5e835281d562`.
- `application`, `database`, `secrets`, `sentinel-redaction`, and `image` all
  succeeded. The signed evidence job was correctly skipped because this was a
  branch run.
- Attempt 1 passed every Phase 05 ledger check but crossed the pre-existing
  outbox steady-claim p99 gate at 129.37 ms while p95 was 18 ms, claim failures
  were zero, and 157,850/157,850 checks passed. The unchanged attempt 2 passed
  the outbox gate, establishing hosted-runner tail variance; no threshold was
  weakened.

## Immutable release workflow

- Release-tag run:
  [33313879571](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33313879571)
  — success.
- `secrets`: success in 12 seconds; Gitleaks reported no finding.
- `sentinel-redaction`: success in 33 seconds.
- `application`: success in 2m17s. Formatting, typecheck, lint, scope,
  unit/contract/OpenAPI/integration/E2E, build, dependency audit, and migration
  checksums passed.
- `database`: success in 16m3s. Clean Supabase reset/lint, pgTAP, migration and
  recovery, live integration/E2E/security, ledger/platform/outbox performance,
  and 75-VU stress passed.
- `image`: success in 1m54s. Seven container suites/19 tests, runtime user
  `65532:65532`, read-only/runtime contracts, and pinned Trivy HIGH/CRITICAL
  scan passed.
- `signed-release-evidence`: success in 30 seconds. CycloneDX SBOM generation,
  SLSA provenance attestation, SBOM attestation/signature, and all three keyless
  Cosign verification steps passed against the tag workflow identity and the
  GitHub Actions OIDC issuer.

The tag performance artifact records 24,299/24,299 ledger checks, zero ledger
errors, and 201.834 operations/second. Create p95/p99 was 17/32 ms; transfer
16/28 ms; search 109.35/152.27 ms; lock wait 18/37.17 ms; reconciliation
148.2/196.34 ms. The million-row outbox run passed 131,450/131,450 checks with
zero claim failures and steady claim p95/p99 25/38.58 ms; the 75-VU stress run
also recorded zero claim failures.

## Immutable artifacts

- Image evidence artifact
  `backend-ec8e21c6983cdb0abe7b1f0355cf5e835281d562-image-evidence`
  (artifact ID `9733061106`, artifact digest
  `sha256:09e74298fdc244b8d74104612f0c82c3f6e3d626ccd964918676f99ecb773aaf`)
  records image ID
  `sha256:5bf639c27db1984d2125ede4f8f968fa679e80cb36abe3836bcbac1399b0299f`.
- Performance evidence artifact
  `backend-ec8e21c6983cdb0abe7b1f0355cf5e835281d562-performance-evidence`
  (artifact ID `9733029881`, artifact digest
  `sha256:ef3a561c1da2b3ef807538c9d415996cfb993d36572bddc9de130f2b9c4952b0`)
  retains ledger plans and summaries plus platform, outbox, stress, runtime, and
  permission evidence.
- Signed evidence artifact
  `backend-ec8e21c6983cdb0abe7b1f0355cf5e835281d562-signed-evidence`
  (artifact ID `9733068073`, artifact digest
  `sha256:0312ac29ca094121c8e2a7a05dc28efd27eb0d2aba140bd8dfbbabccacff3fd8`)
  contains CycloneDX 1.6 SBOM serial
  `urn:uuid:b5ff072c-a43b-4a56-adab-d0a935468bcc` with 275 components and SLSA
  workflow provenance resolving `refs/tags/backend-v0.5.0` to exact commit
  `ec8e21c6983cdb0abe7b1f0355cf5e835281d562`.

Downloaded signed-evidence SHA-256 values are:

- `backend-image-digest.txt`:
  `b2e97922f073bcc4bb35dbdc9931122fa2848b77ca4e3819d2b216bfd51cdc09`
- `backend-provenance.json`:
  `b5690ad2ae7e029ee4c56157621e676d7c660c7a6c1688900e29f79b25f3b4c5`
- `backend-provenance.sigstore.json`:
  `031239bc21bb12ff06284b44d246171b165c673d7668895db8aae08d0830ff33`
- `backend-sbom-attestation.sigstore.json`:
  `058840b9cb68db424920ea01d762bc278ca4b072235de8e8afe3deba4833ccea`
- `backend-sbom.cdx.json`:
  `1d9e540602759a4b66bb111dee1b9fe776f656a1f66fab2b01a0fac7e106caa0`
- `backend-sbom.sigstore.json`:
  `426ef69f11684936c5f9134eca8a91864f42735f22060c564a5de31fc9a22a2e`

All three artifacts were unexpired when inspected and are retained through
2026-11-28. No protected or external-only SPEC-BE-002 gap was inferred as a
pass from this release.
