# Remote Release Evidence

Recorded 2026-08-29 for SPEC-BE-004.

## Pushed commits

- `adc2f70` — explicitly approved API formatting-baseline normalization.
- `8c01450` — SPEC-BE-004 implementation and required dependency corrections.
- `9660d03` — local release evidence.
- `81b20ac` — remote release evidence before the immutable tag run.
- `main` was pushed without rewriting history at full head SHA
  `81b20ac1ad468cc64540a065667cba7a17f3693a`.
- Annotated release tag `backend-v0.4.0` points to that exact commit and was
  pushed without rewriting any branch or tag.

## GitHub Actions

- Workflow: `Backend Foundation`
- Release-tag run:
  [33268699691](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33268699691)
- Conclusion: success
- `application`: success in 2m32s. Typecheck, lint, scope enforcement, unit,
  contract, OpenAPI, default integration/E2E, build, `npm audit
  --audit-level=high`, and migration checksums passed.
- `database`: success in 13m4s. Clean Supabase start/reset, database lint, all
  18 pgTAP files, migration/rollback checks, live integration/E2E, security and
  platform performance, indexed outbox plan, outbox performance, and 75-VU
  stress passed.
- `sentinel-redaction`: success in 35s.
- `secrets`: success in 12s; Gitleaks reported no finding.
- `image`: success in 2m10s. Build, five container suites/11 tests, runtime user
  `65532:65532`, and Trivy HIGH/CRITICAL scan passed.
- `signed-release-evidence`: success in 36s. CycloneDX SBOM generation, SLSA
  provenance attestation, SBOM attestation/signature, and every keyless Cosign
  verification passed against the tag workflow identity and GitHub OIDC issuer.

## Immutable artifacts

- Image evidence artifact
  `backend-81b20ac1ad468cc64540a065667cba7a17f3693a-image-evidence` (artifact ID
  `9719616974`, artifact digest
  `sha256:07855b3be66331b922171f3458aafa5b27cb4ff36694e6dafc2cd28b5c6bea28`)
  records image ID
  `sha256:17cef98fb4676186bea8a684c0919b5178a61c517d53ab1eedb2a9e1d5b74148`.
- Performance evidence artifact
  `backend-81b20ac1ad468cc64540a065667cba7a17f3693a-performance-evidence`
  (artifact ID `9719584537`, artifact digest
  `sha256:b79e012f64b326eb136343b40a9c81f12b2d8e4b5cce774c9a60de4ad0043590`)
  records passing platform, outbox, and stress gates.
- Signed evidence artifact
  `backend-81b20ac1ad468cc64540a065667cba7a17f3693a-signed-evidence`
  (artifact ID `9719625893`, artifact digest
  `sha256:8352a2b5079a559ef9c1b4b56cd7ad5cd3c42d01c9973efd6c9aafa4ec1503a1`)
  contains CycloneDX 1.6 SBOM serial
  `urn:uuid:efb66388-9917-4260-a301-61b14fdcda50` with 275 components, SLSA
  workflow provenance resolving tag `backend-v0.4.0` to the exact head SHA, and
  all three Sigstore bundles. Downloaded file SHA-256 values were:
  `backend-provenance.json`
  `9a88c98f5aa78f19c71ade7a3dc0f8057eb00172389bc566f704b4db84367331`,
  `backend-sbom.cdx.json`
  `36e37f98e922a53d829a34db0d3b37b3aed0ee28471203af4de3d8301edb0ce6`,
  `backend-provenance.sigstore.json`
  `6c6d57788c9f0a2ee27f1b244fdbe8c0a31f3469849dec81bad8187a70952e31`,
  `backend-sbom-attestation.sigstore.json`
  `2744aba5a3e1bf9653cff220a3ac2c1d947398665dc44b0227c0d74e841a0c6d`,
  and `backend-sbom.sigstore.json`
  `8fab06c4cfcd8601cba387a1079eeb14224855eb6addd4d1f96f2164b5946d03`.
- All three artifacts are retained through 2026-11-27 and were unexpired when
  inspected. T060 is complete.

The workflow emitted a non-blocking GitHub runner annotation that pinned actions
declaring Node.js 20 are being forced onto Node.js 24. It did not alter any gate
result.
