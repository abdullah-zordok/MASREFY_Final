# Phase 07 Remote Gates

The user prohibited push, remote workflow execution, registry publication, and
PR activity. The following external-only gates are therefore recorded as
`PENDING`, never as passing:

| Gate | Status | Required remote evidence |
|---|---|---|
| Push scoped Phase 07 commit to the approved remote | PENDING | Remote commit SHA |
| Run `.github/workflows/backend-foundation.yml` on the remote runner | PENDING | Successful workflow run URL and immutable run ID |
| Publish the release image to the approved registry using an immutable digest/tag | PENDING | Registry repository, tag, and digest |
| Publish the generated SBOM alongside the image | PENDING | SBOM artifact URL and checksum |
| Verify the published image signature | PENDING | Signature identity, verifier output, and digest |
| Verify build provenance/attestation for the published digest | PENDING | Attestation URL and verification output |

Local workflow structure and pinned-action checks are covered by
`local-release.md`; the local non-root image build/test and digest are covered by
`recovery.md`. Neither substitutes for the pending remote evidence above.
