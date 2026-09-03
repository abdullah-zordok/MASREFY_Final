# OpenRouter Gateway Contract

OpenRouter is the only provider API. The gateway is instantiated only in the
worker composition root and receives its key from runtime configuration. The API,
Mobile, Admin, database, logs, traces, events, and error responses never receive
the key or a provider request/response body.

## Effective route

`private.get_effective_ai_route(workload)` returns one published prompt version,
one primary, ordered fallback model IDs, provider allowlist, required capabilities,
schema, token limits, and price caps only when every referenced row is enabled,
approved, privacy-reviewed, corpus-passing, and mutually compatible. Otherwise it
returns no row and the service emits `AI_UNAVAILABLE` without dispatch.

Clients can choose only a workload through a product endpoint. They cannot send
model, provider, route, prompt, temperature, ZDR, tools, price, token, or schema
parameters.

## HTTP request

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <worker-only secret>
Content-Type: application/json
X-Title: Masarifi
```

```json
{
  "model": "<one approved route model>",
  "messages": [
    { "role": "system", "content": "<published immutable template>" },
    { "role": "user", "content": "<minimized redacted evidence>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "<workload_schema_vN>",
      "strict": true,
      "schema": { "type": "object", "additionalProperties": false }
    }
  },
  "max_tokens": "<route ceiling>",
  "temperature": 0,
  "stream": false,
  "provider": {
    "only": ["<reviewed providers>"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "data_collection": "deny",
    "zdr": true,
    "max_price": {
      "prompt": "<route cap>",
      "completion": "<route cap>"
    }
  }
}
```

Audio workload adds a bounded base64/audio content part read from the claimed
private object and removes it immediately after request construction. It is never
serialized to a log/error/event/database value. Assistant SSE uses `stream:true`;
all other policy fields are identical.

## Schemas

### Voice proposal v1

Closed required object:

```json
{
  "schemaVersion": 1,
  "type": "transaction.create",
  "amountMinor": "12500",
  "currency": "SAR",
  "categoryId": null,
  "accountId": null,
  "date": "2026-09-03",
  "merchant": "متجر",
  "note": null,
  "confidence": 0.91
}
```

`amountMinor` is a canonical nonzero integer string within the ledger command
bound, never a floating number. Currency is a three-letter uppercase value;
category/account are UUID/null; date is ISO date; merchant <=160, note <=500;
confidence 0..1. Deterministic validation resolves IDs only from server-provided
aliases and may turn missing/unsafe fields into a reviewable draft, never a call.

### Assistant response v1

Closed object with `schemaVersion:1`, `answer` <=16 KiB, `evidenceIds` as a unique
array of at most 32 request-local aliases, and optional `actionPreview`. The
preview is a closed object containing `schemaVersion:1`, an allowlisted
`actionType`, closed action-specific `payload`, the same bounded evidence aliases,
and no client/provider-selected expiry. The server generates persistent IDs and
an expiry <=15 minutes after validation.

Unknown action types, tools, URLs, SQL, shell, role/control messages, markup-based
instructions, or raw resource IDs make the preview invalid. A safe answer may be
retained only if it independently passes content/safety policy.

## Response accounting

Accept only HTTP success with valid JSON/SSE, one choice, the requested model or
an explicitly documented provider-normalized equivalent, and a complete schema.
Record provider generation ID hash, model/provider, prompt/completion tokens,
cost, latency, fallback flag, schema result, and request ID. Do not store content.

Usage is idempotent by internal request ID. If provider usage is missing or
malformed, retain the conservative reservation and create
`USAGE_ACCOUNTING_INCOMPLETE`; never assume zero cost.

## Retry and fallback

- Connect/timeout/429/5xx/incomplete transport: try the next explicitly approved
  fallback once if budget, deadline, circuit, modality, schema, and identical
  privacy policy all pass.
- Schema failure: retry once using the same model/policy; then safe terminal
  `AI_SCHEMA_INVALID`. Do not broaden provider/model or request tools.
- 400/401/403, route/policy mismatch, hard budget, quota, or safety block: no
  provider retry; fail safe and alert as appropriate.
- A fallback sets `fallback_used`, emits the safe event, and records no content.

Maximum total provider attempts per work item is two. The overall deadline, not a
fresh deadline per attempt, bounds the request.

## Cancellation and circuit

Client disconnect or worker shutdown aborts native fetch. Partial provider text is
discarded; a safe cancellation code and available terminal usage are recorded.
Five retryable failures/60 seconds opens the process-local route circuit for 30
seconds. One half-open probe is allowed; success closes, failure reopens. Circuit
state never affects core finance readiness.

## Stable failure mapping

| Internal/provider condition        | API code                     | Retry guidance                      |
| ---------------------------------- | ---------------------------- | ----------------------------------- |
| no approved/compliant route or key | `AI_UNAVAILABLE`             | after operator enables route        |
| quota exhausted                    | `AI_QUOTA_EXCEEDED`          | at returned `resetsAt`              |
| hard budget reached                | `AI_BUDGET_EXHAUSTED`        | next budget period/operator action  |
| safety/injection blocked           | `AI_INPUT_REJECTED`          | change input; never automatic retry |
| schema invalid twice               | `AI_SCHEMA_INVALID`          | operator evaluation/route review    |
| provider timeout/outage/circuit    | `AI_TEMPORARILY_UNAVAILABLE` | bounded client retry                |
| client disconnected                | `AI_CANCELLED`               | user may submit a new keyed request |

Provider body, endpoint detail, stack, secret, prompt, response, audio, and raw
evidence never appear in these responses.
