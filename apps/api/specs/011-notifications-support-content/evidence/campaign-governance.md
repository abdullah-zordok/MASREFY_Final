# Campaign governance

Audience clauses are parsed from a closed selector grammar with configured depth,
clause, and result bounds. Preview responses contain aggregate counts, a definition
hash, version, and expiry—never member identities. Approval above the configured
threshold requires a different actor with recent MFA; all transitions use optimistic
versions and privileged audit/outbox writes. Expansion uses bounded keyset batches
and a fixed rate ceiling.
