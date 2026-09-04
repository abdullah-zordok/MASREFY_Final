# External Gates

Date: 2026-09-04
Scope: SPEC-BE-010

No genuine SMTP provider credentials, hosted Supabase project, release tag, or
production signing identity were supplied. Provider acceptance, hosted signed-URL
delivery, image publication, signature, provenance attestation, and tagged-release
evidence are therefore external-only gates. Local deterministic SMTP, Storage,
container, SBOM, and scan checks remain executable and are tracked separately;
external gates are never represented as passing local proof.
