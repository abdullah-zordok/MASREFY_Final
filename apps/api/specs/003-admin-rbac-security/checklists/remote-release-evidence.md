# Remote release evidence

## Verified branch

- Implementation commit: `b69e58493e94b1316a69fcca03837415af724c69`, pushed to `origin/main` without history rewriting.
- GitHub Actions run: `33247615323`, conclusion `success`.
- Jobs: secrets, sentinel redaction, application, database, and image all passed.
- Database proof: clean reset/lint, 394 pgTAP assertions, live integration/E2E, million-row security performance, steady outbox SLA, and 75-worker stress all passed.
- Image proof: build, container runtime contract, non-root identity, and Trivy Critical/High gate passed.
- Image digest: `sha256:1fae0441564f906c4bdec7b98ae75f2d0a9d6dbb1d1c06dcfd490eda4000fccb`.
- Retained artifacts: `backend-b69e58493e94b1316a69fcca03837415af724c69-performance-evidence`, `backend-b69e58493e94b1316a69fcca03837415af724c69-image-evidence`, and `gitleaks-results.sarif`.

## Release tag

SBOM, provenance/attestation, keyless signature, and verification remain intentionally open until the immutable release tag workflow passes.
