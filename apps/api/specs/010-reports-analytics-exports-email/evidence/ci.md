# CI Evidence

Date: 2026-09-04
Scope: SPEC-BE-010

Final verified implementation SHA:
`673c146ca99630d637fa4c8c2db12a409deb7dd8`. Local `HEAD`, `origin/main`, and
`git ls-remote origin refs/heads/main` matched exactly before closeout.

[Backend Foundation run 33908495688](https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/33908495688)
completed successfully for that SHA. Required jobs `secrets`,
`sentinel-redaction`, `application`, `mobile`, `database`, and `image` all
passed. `signed-release-evidence` was correctly skipped because this was a
branch push rather than a `backend-v*` release tag.

Failures were fixed forward without rewriting history: the first push exposed
one false-positive Clerk test fixture in gitleaks, and two later attempts exposed
a pre-existing Sync benchmark round-trip sensitivity at 525.35/506.34/505.15
ms against its 500 ms budget. The SQL plan remained stable at 28.47 ms versus
28.12 ms in the Phase 9 green run. Combining claims, role selection, and the
measured operation in one authenticated SQL statement retained the 500 ms limit,
passed locally at 66 ms p95, and made the final remote database job pass.
