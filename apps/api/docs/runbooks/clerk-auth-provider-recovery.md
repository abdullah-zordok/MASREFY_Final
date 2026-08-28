# Clerk Authentication Provider Recovery

Owner: Backend on-call. Platform owns runtime secrets and Supabase configuration; Security owns suspected key compromise.

## Alerts and thresholds

- Critical: wrong issuer/domain accepted, invalid role/party accepted, Supabase Auth fallback, legacy JWT Template use, or secret/JWT/OTP disclosure.
- High: Clerk/JWKS authentication failures above 5% for 10 minutes, protected readiness failure over 5 minutes, or native Supabase owner-RLS verification failure.
- Warning: elevated unknown-key refresh or provider latency approaching the configured 2-second timeout.

## Safe diagnosis

1. Confirm the deployed revision and that protected requests fail closed with only `AUTH_TOKEN_INVALID` or `PROVIDER_UNAVAILABLE`.
2. Compare the non-secret Clerk instance domain and authorized web origins with the reviewed provider checklist. The Mobile callback is not an authorized party.
3. Verify one Clerk application is authoritative, native Supabase Third-Party Auth is configured, and no Supabase Auth user or legacy Clerk JWT Template is used.
4. Inspect only bounded outcome/latency metrics and provider status. Never print tokens, claims, keys, cookies, contact data, raw subjects/sessions, or database URLs.

## Recovery

- Clerk/JWKS outage: keep protected readiness non-ready and do not add fallback authentication. Restore connectivity and verify known/rotated key cases through the official SDK.
- Wrong domain/party: correct the runtime non-secret values through the approved configuration channel, restart API instances, then rerun valid, wrong-issuer, present-wrong-`azp`, and native-absent-`azp` tests.
- Clerk secret rotation: add the new value in the secret store, roll API and worker, verify provider reads/session revoke, then revoke the old value. Never commit or pass it on a command line.
- Supabase integration drift: correct Third-Party Auth with the exact Clerk instance domain, allow documented key propagation, and rerun asymmetric-token owner/non-owner RLS checks. Do not use a shared JWT secret or template.
- Lost profile synchronization: after provider recovery run provider-page and local-subject reconciliation; confirm only active new shells activate and inactive profiles do not reactivate.

## Closure evidence

Record revision, outage window, safe outcome counts, provider/config checklist references, asymmetric owner/non-owner test result, reconciliation checkpoint hashes, readiness recovery, and absence of fallback/Supabase Auth/legacy-template paths. Escalate any unresolved Critical/High result.
