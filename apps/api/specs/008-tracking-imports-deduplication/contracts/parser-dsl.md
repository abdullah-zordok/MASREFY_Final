# Constrained Parser DSL Contract

## Purpose

Parser versions are strict JSON data interpreted by Phase 08. They are never
JavaScript, SQL, templates, shell, regular-expression source passed to a runtime,
or code loaded from Storage/network. Unknown fields/operators fail validation.

## Envelope

```json
{
  "matches": [],
  "captures": [],
  "normalizations": [],
  "mappings": []
}
```

Canonical JSON uses sorted object keys, preserves array order, and hashes UTF-8
bytes with SHA-256. Encoded definition size is at most 8192 bytes. Each array is
bounded to 12 entries; `matches` and `mappings` are nonempty. Duplicate targets,
capture names, or semantically duplicate clauses are rejected.

## Match Clauses

```json
{
  "field": "body",
  "operator": "safe_pattern",
  "value": "Purchase {amount} {currency} at {merchant}"
}
```

| Field | Meaning |
|---|---|
| `sender` | normalized sender label, max 256 bytes |
| `body` | normalized source body, max 2000 bytes |
| `language` | `ar` or `en` |
| `source` | allowlisted source type |

| Operator | Contract |
|---|---|
| `equals` | Unicode NFKC, whitespace-normalized, case-folded equality |
| `contains` | linear literal substring match |
| `starts_with` | linear literal prefix match |
| `safe_pattern` | linear token-pattern grammar below |

`value` is 1..256 UTF-8 bytes. Literal operators forbid control characters.

## Safe Pattern Grammar

```ebnf
pattern     = anchor_start?, segment+, anchor_end? ;
segment     = literal | token ;
anchor_start = "^" ;
anchor_end   = "$" ;
token       = "{" token_name "}" ;
token_name  = letter, { letter | digit | "_" } ;
literal     = escaped_char | any_safe_character_except_braces ;
escaped_char = "\\{" | "\\}" | "\\^" | "\\$" | "\\\\" ;
```

- At most eight tokens, each unique and 1..40 ASCII characters.
- At least one non-whitespace literal separates adjacent tokens.
- Tokens capture the shortest text that allows the following literal/anchor to
  match. Input is scanned once left-to-right; no backtracking engine is used.
- Patterns containing parentheses, brackets, alternation, repetition operators,
  lookaround, backreferences, inline flags, or malformed escapes are rejected.
- Customer `match_type=regex` uses this same linear grammar for compatibility
  with the existing product label; it is not passed to `RegExp`.
- Input and pattern byte ceilings plus a 25 ms item budget remain mandatory even
  though the matcher is linear.

## Capture Clauses

```json
{ "field": "amount", "sourceGroup": "amount" }
```

Allowed target fields are `amount`, `merchant`, `category`, `currency`, `date`,
`direction`, and `type`. `sourceGroup` must name exactly one token in a
`safe_pattern` match and can feed only one capture. Captured text is max 512 bytes
before field-specific normalization; empty captures fail.

## Normalization Clauses

```json
{ "field": "currency", "operation": "uppercase" }
```

| Field | Operations |
|---|---|
| amount | `minor_units`, `localized_digits` |
| merchant/category | `trim`, `lowercase`, `alias_map` |
| currency | `trim`, `uppercase`, `alias_map` |
| date | `trim`, `iso_date`, `localized_digits` |
| direction/type | `trim`, `lowercase`, `alias_map` |

Operations run in declared order once. Alias maps reference a versioned
institution/global rule key already stored in the database; the definition does
not embed secrets or unbounded maps. Amount conversion accepts a bounded canonical
decimal according to currency minor-unit metadata, rejects exponent/grouping
ambiguity and overflow, and returns integer minor units. Date conversion requires
an explicit supported format and timezone/offset policy; ambiguous dates fail to
review rather than guess.

## Output Mappings

```json
{ "sourceField": "amount", "targetField": "amount" }
```

`sourceField` is a capture name or normalized field. Target fields are
`amount`, `merchant`, `category`, `currency`, `date`, `direction`, and `type`.
Each target appears at most once. Output is a strict partial normalized proposal;
missing mandatory financial values cause review/unsupported state, never default
money, currency, account, or category.

## CSV Contract

Phase 08 initially accepts only one uncompressed UTF-8 CSV file per request, or a
normalized JSON request with at most 100 events and 512 KiB total body. CSV uses
RFC 4180 quoting rules, one header row, at most 256 unique headers, 10,000 rows,
8192 bytes per cell, 64 KiB per row, and 6 MiB aggregate bytes. Column names are
matched through literal `field=body` data prepared from the row. Formula-leading
cells remain plain input data and are neutralized on any Admin/export rendering.

ZIP/GZIP/RAR/7z, XML, HTML, executable, PDF, image/screenshot/receipt, and voice
content is rejected as unsupported in Phase 08. This avoids decompression, XXE,
OCR, and voice/AI attack surfaces rather than adding speculative parsers.

## Corpus Gate

Each version must have at least one enabled success case and enabled cases for:

- minimum/maximum values and Unicode normalization;
- missing/extra/duplicate tokens and malformed values;
- Arabic and English when the version claims both;
- max-length input and near-timeout pattern;
- unsafe pattern syntax, control characters, formula-leading data, malformed
  encoding, and unsupported source;
- deterministic re-run and canonical output/hash.

Publication evaluates every enabled case against the exact definition hash. The
pass condition is byte-for-byte canonical JSON equality with expected output,
zero timeout/resource violation, and zero unexpected field. A failing or empty
corpus leaves the active version unchanged.

## Example

```json
{
  "matches": [
    {
      "field": "body",
      "operator": "safe_pattern",
      "value": "^Purchase {amount} {currency} at {merchant}$"
    }
  ],
  "captures": [
    { "field": "amount", "sourceGroup": "amount" },
    { "field": "currency", "sourceGroup": "currency" },
    { "field": "merchant", "sourceGroup": "merchant" }
  ],
  "normalizations": [
    { "field": "amount", "operation": "minor_units" },
    { "field": "currency", "operation": "uppercase" },
    { "field": "merchant", "operation": "trim" }
  ],
  "mappings": [
    { "sourceField": "amount", "targetField": "amount" },
    { "sourceField": "currency", "targetField": "currency" },
    { "sourceField": "merchant", "targetField": "merchant" }
  ]
}
```

Input `Purchase 12.50 SAR at FICTIONAL STORE` yields the canonical partial output
`{"amountMinor":"1250","currencyCode":"SAR","merchant":"FICTIONAL STORE"}`
when SAR metadata declares two minor digits. No field is inferred beyond the
declared captures/normalizers/mappings.
