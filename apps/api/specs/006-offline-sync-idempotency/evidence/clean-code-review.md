# Clean Code Guard Review

Scope: changed production TypeScript, Mobile storage/service code, SQL migration/functions, and worker wiring. CI/tooling and test code were reviewed separately.

Findings fixed:

1. Server upserts could overwrite a pending Mobile edit when local/server IDs differed. The shared upsert path now resolves the mapping and checks the pending queue once for bootstrap and delta.
2. PostgreSQL returned tombstone timestamps as `Date` objects despite the declared string boundary. The repository now normalizes them to ISO strings.
3. Plain DTO/cursor errors became HTTP 500 responses. Trust-boundary validators now retain symbolic messages while returning safe typed HTTP statuses/codes.
4. Valid Nest query objects with a null prototype were rejected. The validator now accepts only ordinary and null-prototype records while continuing to reject arrays/class instances.
5. An individually oversized delta change caused a non-progressing empty page. It now returns `SYNC_PAYLOAD_TOO_LARGE`.
6. Delta/claim queries could not use their intended indexes. The migration predicate/order now matches the indexed expressions; retained plans prove both index names.

Guard outcome: no unresolved correctness/security finding, swallowed error, speculative dependency, mock fallback, or dead production export found. Typecheck and scoped lint passed after fixes.
