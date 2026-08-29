# Remote Release Evidence

Recorded 2026-08-29 for SPEC-BE-004.

## Pushed commits

- `adc2f70` — explicitly approved API formatting-baseline normalization.
- `8c01450` — SPEC-BE-004 implementation and required dependency corrections.
- `9660d03` — local release evidence.
- `main` was pushed without rewriting history at full head SHA
  `9660d039172ded5095d2167b96a2659a17157145`.

## GitHub Actions

- Workflow: `Backend Foundation`
- Run: [33266979702](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33266979702)
- Conclusion: success
- `application`: success in 2m45s. Typecheck, lint, scope enforcement, unit,
  contract, OpenAPI, default integration/E2E, build, `npm audit
  --audit-level=high`, and migration checksums passed.
- `database`: success in 13m7s. Clean Supabase start/reset, database lint, all
  18 pgTAP files, migration/rollback checks, live integration/E2E, security and
  platform performance, indexed outbox plan, outbox performance, and 75-VU
  stress passed.
- `sentinel-redaction`: success in 29s.
- `secrets`: success in 12s; Gitleaks artifact `gitleaks-results.sarif` has
  artifact digest
  `sha256:bfb2d582b304cdd2f83414068ff158866bffad9755bef49850ba7ed7c3abc64e`.
- `image`: success in 1m56s. Build, five container suites/11 tests, runtime user
  `65532:65532`, and Trivy HIGH/CRITICAL scan passed.

## Immutable artifacts

- Image evidence artifact
  `backend-9660d039172ded5095d2167b96a2659a17157145-image-evidence` (artifact ID
  `9719124636`, artifact digest
  `sha256:cc7cf4a80c6573602176a0230e5f67293a111405058a3525ee68ac48a2d9d61f`)
  records image ID
  `sha256:9e8621f2c3e6fc9b31893c0307c38400249f83c4f92848419e280822e2705a46`.
- Performance evidence artifact
  `backend-9660d039172ded5095d2167b96a2659a17157145-performance-evidence`
  (artifact ID `9719094233`, artifact digest
  `sha256:97d26d6a6c52870d37895072275185fe7aa3900541b95bc6a7dc9afbc7b18632`)
  records zero failed checks, indexed outbox execution, HTTP P95 4.596 ms/P99
  15.611 ms, steady outbox claim P95 29 ms/P99 42 ms, and 75-VU stress with
  114,800 successful ownership checks and zero failures.
- All three artifacts are retained through 2026-11-27 and were unexpired when
  inspected.

## External release attestation gate

The `signed-release-evidence` job was skipped by its tag-only condition on this
ordinary `main` push. Therefore no Phase 04 SBOM, Cosign signature, or provenance
attestation is claimed. Creating and publishing a `backend-v*` release tag is an
external release action and requires explicit owner approval. The workflow and
all locally executable Phase 04 gates are green; T060 remains open only for that
approved tag run and its resulting artifacts.

The workflow emitted a non-blocking GitHub runner annotation that pinned actions
declaring Node.js 20 are being forced onto Node.js 24. It did not alter any gate
result.
