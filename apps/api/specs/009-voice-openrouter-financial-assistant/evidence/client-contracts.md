# Client contract evidence

- Mobile voice and assistant adapters use only `/api/v1/voice` and `/api/v1/assistant`, require an injected token provider, validate response envelopes, preserve immutable review edits, and fail explicitly when release configuration is unavailable.
- Admin maps the `/api/v1/admin/ai` cursor contracts, exact action states, optimistic versions, reasons, and the five Phase 09 permissions. Test/demo mocks remain explicitly gated.
- A production-client scan for provider URLs, provider-key names/prefixes, and raw prompt/response/payload fields returned no matches.
- No client contains a provider credential, direct provider URL, silent production fixture fallback, or raw AI-content log.
