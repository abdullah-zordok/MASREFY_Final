# External And Host Gates

Genuinely external gates remaining:

1. Real provider credentials and hosted provider/alert proofs.
   - The spec intentionally treats deployment-owned provider credentials,
     hosted alert routing, SBOM/signature/provenance, and production remote
     account checks as external gates.
   - No secret was invented or embedded to satisfy these gates.

2. Remote CI.
   - Local gates are green; the workflow awaits the authorized direct push.

Non-external, but out-of-scope for Phase 08:

- Full Admin Playwright failures in unrelated earlier/later Admin route families.
  Fixing AI/voice/billing/governance/support/report behavior here would violate
  the SPEC-BE-008 scope boundary.

Docker/Supabase is no longer a blocker: fresh reset, lint, pgTAP, live
integration, and live E2E all passed on this host.
