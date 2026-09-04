# Immutable Output Evidence

Date: 2026-09-04
Scope: SPEC-BE-010 US2

One literal snapshot (`ledgerVersion=9`, SAR, 2026-08-01 through 2026-08-31)
was rendered without rereading ledger state. The retained SHA-256 results are:

| Format | Bytes | SHA-256 |
|---|---:|---|
| JSON | 600 | `13c8543c2947cfabeefc0f6b5d1c83f340829fa32607e7980a50c40e9dba5e57` |
| CSV | 120 | `afdf15aec74d69aef18268a9b08be32ef9d42df6b2941c6560b90f639b260d4a` |
| PDF | 7,752 | `bec3bace0b1049354093a1edb326942c5395d6999326559c195014eb27c4a6e6` |

`reports-renderer.spec.ts`, `reports-generation.integration.spec.ts`, and
`reports-storage.security.spec.ts` pass. Snapshot identity fields are trigger-
immutable; rerender and retry consume the stored snapshot only. Private keys are
owner-hashed, signed URLs are generated only on authorized reads, and expiry
deletes the object before the terminal transition.
