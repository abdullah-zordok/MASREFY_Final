# Security and privacy review

Result: no unresolved Critical or High finding.

- RLS/grants/ownership/storage: all 1,508 pgTAP assertions pass after a clean reset; owner, non-owner, anonymous, API, worker, and Admin boundaries are covered.
- BOLA/BFLA/MFA: exact `ai.*` permissions, recent MFA, expected version, reason, ownership, and idempotency are enforced server-side; 3 AI security suites/8 tests pass.
- Injection/capability control: SQL, tool, internal-API, URL/SSRF, bidi, caller-selected routing, and unsafe structured output are rejected before privileged execution.
- Privacy: raw prompt/response/audio/provider payloads are excluded from logs, events, usage, failures, Admin DTOs, and client code. Export covers all owned user content; deletion cascades content and anonymizes retained usage/failure evidence.
- Provider policy: only worker code owns outbound fetch; routes require approved capability, ZDR/no-training, `data_collection: deny`, price/token limits, equivalent fallback, and fail-closed budget/circuit state.
- Dependency audit passes the configured High threshold. One transitive `qs` advisory remains Moderate and is outside the release-blocking threshold.
