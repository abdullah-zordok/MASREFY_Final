# Remote release evidence

## Verified branch

- Release commit: `98c40a98ddc6a1df22a9d9ce89290a0ab70b72db`, pushed to `origin/main` by forward fixes without history rewriting.
- Final branch workflow: GitHub Actions run `33251957974`, conclusion `success`.
- Jobs: secrets, sentinel redaction, application, database, and image all passed.
- Database proof: clean reset/lint, 394 pgTAP assertions, live integration/E2E, million-row security performance, steady outbox SLA, and 75-worker stress all passed.
- Image proof: build, container runtime contract, non-root identity, and Trivy Critical/High gate passed.

## Verified release tag

- Immutable tag: `backend-v0.3.2`, resolving to exact commit `98c40a98ddc6a1df22a9d9ce89290a0ab70b72db`.
- Tag workflow: GitHub Actions run `33252556673`, conclusion `success`.
- Image digest: `sha256:b6e2a53a812d0d86173b07ee7f265507b07c025588159bfdb1c04f5346a9c9f9`.
- SLSA v1 provenance records `refs/tags/backend-v0.3.2`, the exact release commit, the backend workflow, and run attempt 1.
- CycloneDX SBOM contains 275 components.
- Cosign v3.0.6 keyless verification passed for the provenance attestation, CycloneDX attestation, and SBOM blob signature.
- Retained artifacts: `backend-98c40a98ddc6a1df22a9d9ce89290a0ab70b72db-performance-evidence` (ID `9714957629`), `backend-98c40a98ddc6a1df22a9d9ce89290a0ab70b72db-image-evidence` (ID `9714982208`), and `backend-98c40a98ddc6a1df22a9d9ce89290a0ab70b72db-signed-evidence` (ID `9714989375`).
- Signed evidence SHA-256 hashes: provenance `4630a8537fadfe5cffdb1475df699eee69f40288cb7b3edbcd38728b041bcd75`, provenance bundle `bc3b12e5995720f0fbcb8533505f76536d80c809835afcc9274e7ef879814367`, SBOM `45ae1e9760ccaaea9f0bd54aa9333d7a5d5e6f78126f683c20285979d80601b1`, SBOM attestation bundle `42095902ed2dfffa754b8e7b6cde20e019d59a6a0e966e37b8944f2408786d7a`, and SBOM signature bundle `49756c861d9f30478843dcb876bef73138a0d270d17436be21c6a65a2e1d4dae`.
- Failed immutable attempts `backend-v0.3.0` and `backend-v0.3.1` remain unmoved and are superseded by the verified forward-fix tag.
