# Phase 09 Research Decisions

Research was refreshed on 2026-09-03 against the current repository, official
Supabase documentation/changelog, and official OpenRouter documentation and
public model catalogue. Provider state remains deployment evidence rather than a
reason to weaken a contract.

## Decision 1 — One AI module and native HTTP transport

Use one NestJS AI module for voice, assistant, governance, privacy, events, and
workers. Use Node 24 native `fetch` and `AbortController` for OpenRouter. Reuse the
existing database/outbox/worker/security/storage patterns.

**Why**: voice and assistant must share the same route approval, quota, budget,
circuit, redaction, structured-output, and audit rules. The platform already has
all other primitives and native fetch covers the single provider API.

**Rejected**: separate route-policy implementations; a new OpenRouter SDK; a new
queue/cache/policy engine; client-side provider calls.

## Decision 2 — Reviewed configuration is seeded disabled

Seed the Master Plan candidates with current canonical IDs:

| Workload                       | Primary                        | Fallback                       |
| ------------------------------ | ------------------------------ | ------------------------------ |
| voice transcription/extraction | `openai/gpt-audio-mini`        | none                           |
| transaction classification     | `google/gemini-2.5-flash-lite` | `anthropic/claude-haiku-4.5`   |
| financial assistant            | `openai/gpt-5.2`               | `anthropic/claude-sonnet-5`    |
| report summarization           | `google/gemini-2.5-flash-lite` | `anthropic/claude-haiku-4.5`   |
| financial insights             | `openai/gpt-5.2`               | `anthropic/claude-sonnet-5`    |
| Admin/support AI               | `anthropic/claude-haiku-4.5`   | `google/gemini-2.5-flash-lite` |

Only Phase 09 workloads are activated here; later-owned workload rows may be
present as reviewed model metadata but remain disabled. `anthropic/claude-4.5-haiku`
from prose is corrected to OpenRouter's canonical
`anthropic/claude-haiku-4.5`. The public catalogue currently advertises the
required audio/text modalities and structured-output parameter for these models.

Routes remain disabled until a prompt version passes the local corpus, an Admin
with exact permission and recent MFA publishes it, and deployment proves the key,
account privacy settings, price cap, and compliant endpoints. Seed data contains
no secret.

**Source**: [OpenRouter Models API](https://openrouter.ai/api/v1/models).

## Decision 3 — Privacy constraints are repeated on every request

Every request sets `provider.data_collection = "deny"`, `provider.zdr = true`,
`provider.require_parameters = true`, `provider.only` to the reviewed allowlist,
and `provider.allow_fallbacks = false`. Application fallback tries only explicitly
ordered approved model IDs after locally proving equivalent privacy/capability/
price policy. Default provider load balancing is never trusted as the policy.

Account-level no-prompt-logging and ZDR controls are deployment prerequisites as
defense in depth. A missing compliant endpoint produces `AI_UNAVAILABLE`; it does
not drop ZDR, broaden providers, or use a mock.

**Sources**: [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection),
[Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr),
[provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging).

## Decision 4 — Strict JSON Schema is the provider-output boundary

Voice and assistant calls use `response_format.type = "json_schema"` with
`strict: true`, closed objects (`additionalProperties: false`), bounded arrays,
enums, integer-minor money strings, and version fields. Only providers advertising
all parameters may be selected. The service parses JSON once, rejects unknown or
duplicate semantic fields, and performs deterministic database-backed validation.
A schema failure gets one retry under the identical policy; a second failure is
terminal and recorded without raw output.

**Why**: model output is untrusted. Provider schema conformance reduces malformed
responses but cannot prove ownership, authorization, current version, or money
semantics.

**Source**: [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Decision 5 — Models receive aliases and minimum evidence

Evidence is assembled server-side from owner-authorized, current domain reads. IDs
become request-local opaque aliases; only the fields necessary for the requested
workload are included. System prompts say evidence is data, never instructions.
Messages reject control/bidi abuse, hidden markup, tool/SQL/API requests, and
oversize content. No model gets credentials, raw database records, internal URLs,
authorization claims, or permission to fetch more context.

**Rejected**: RAG/vector infrastructure, arbitrary tool calling, web search,
direct SQL, prompt content in logs, and accepting client-supplied evidence rows.

## Decision 6 — AI can propose; deterministic code can execute

Voice produces a versioned transaction proposal. Assistant may produce a
versioned action preview for only allowlisted actions already owned by Specs
005-008. Confirmation locks the proposal/preview, checks owner, consent/current
authorization, version, expiry, referenced resource ownership/state, and schema,
then calls the existing owned command with a stable idempotency key. The model
cannot name a function, URL, SQL statement, or arbitrary tool.

Voice confirmation initially supports `transaction.create`; assistant confirmation
supports only the existing command mappings explicitly encoded in the contract.
Unsupported action types are safe explanatory text, not speculative bridges.

## Decision 7 — Five accepted work requests per rolling 24 hours

Until SPEC-BE-012 supplies entitlements, `private.reserve_ai_quota` allows five
accepted provider-bound requests per user across voice and assistant in the
preceding 24 hours. It runs after authentication, basic validation, and
idempotency replay lookup but before upload/process enqueue or provider work.
The reservation is written atomically with the durable work record. Replay,
pre-validation rejection, and a request stopped by the system hard budget do not
consume an additional unit. A reserved request that begins provider work remains
consumed even if the provider fails.

The policy is behind one server-owned function/service decision and reports
`limit`, `used`, and `resetsAt`; SPEC-BE-012 can replace its lookup without client
contract changes.

## Decision 8 — Budget uses committed provider cost accounting

Route limits bound input/output tokens and per-token price before each call. The
gateway stores provider-returned prompt/completion tokens and cost once per
request ID, with a conservative estimated reservation before dispatch. It emits
70/85/95 percent threshold events once per configured budget period and rejects
before provider dispatch at 100 percent. Concurrent dispatch uses an atomic
reservation so calls cannot race beyond the cap.

Provider response usage is authoritative for actual cost; absence or invalidity
uses the conservative reservation and raises an operations discrepancy. No raw
prompt/completion is stored with usage.

**Source**: [OpenRouter usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Decision 9 — Circuit breaker is local and workload-isolated

Maintain bounded process-local circuit state per route: open after five retryable
failures in 60 seconds, probe once after 30 seconds, close after a successful
probe. The database remains the durable source for failure events and route
enablement. Core finance never imports or awaits this state. In a multi-instance
deployment each instance fails safe independently; a shared circuit is deferred
until measurements justify infrastructure.

`ponytail:` process-local circuit limits coordination to one instance; replace
with an existing shared operations primitive in SPEC-BE-013 only if fleet-level
outage load proves it necessary.

## Decision 10 — Streaming is transport-only; persistence is terminal

Assistant can return Server-Sent Events with bounded `meta`, `delta`, `preview`,
`done`, and `error` events. Provider chunks are decoded with a byte ceiling and
never logged. Client disconnect aborts the provider fetch. Only a complete,
schema-valid terminal response is persisted as an assistant message/snapshot;
partial text is discarded and recorded as a safe cancellation/failure code.
Usage from a terminal provider chunk is retained when available.

Non-streaming requests use the same job/schema/persistence path and return `202`
when work is not complete inside the small synchronous budget.

**Sources**: [chat completion API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request),
[usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Decision 11 — Voice media is private and ephemeral

Create a private `voice-temp` bucket restricted to the accepted audio MIME
allowlist and configured byte maximum. The server generates an opaque owner/session
path and returns a short-lived signed upload instruction. Processing verifies
object key, content type, size, hash/metadata, owner/session, and 1..120000 ms
duration before provider access. Object data is never embedded in database rows,
logs, events, or API reads.

The media expires no later than 24 hours after creation and is purged immediately
after terminal processing where possible. Missing objects are idempotent purge
success. Database trace, redacted transcript, proposal, and provider usage survive
media deletion under their own retention rules.

Private buckets are the Supabase default; Storage access is still protected with
RLS and narrow signed URLs. Service-role credentials remain server-only.

**Sources**: [Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[signed downloads](https://supabase.com/docs/guides/storage/serving/downloads).

## Decision 12 — RLS is owner-only; private configuration uses functions

Force RLS on all public customer tables. Owners get only bounded reads and
allowed consent/conversation/feedback/report mutations; direct transcript,
snapshot, proposal execution, preview execution, usage, failure, and private
configuration writes are revoked. Worker and Admin changes use fixed-search-path
security-definer functions with public execute revoked and explicit roles.

Admin routes map exact `ai.*` permissions. Route/model/prompt/safety/privacy
mutations also require recent MFA, 10..500 character reason, expected version,
idempotency, audit, and outbox. Raw provider bodies and voice objects have no Admin
read contract.

The 2026 Supabase change that new public tables are not automatically Data API
exposed reinforces explicit grants; migrations never rely on implicit exposure.

**Sources**: [Supabase changelog](https://supabase.com/changelog),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Decision 13 — Prompt publication is immutable and corpus-gated

Prompt versions are immutable after entering testing. Publication locks the
workload, verifies exact Admin authority/recent MFA/reason/version, route/privacy/
schema compatibility, and an enabled nonempty bilingual corpus whose latest run
passes every deterministic expected rule. It retires the prior approved version
and publishes the new version atomically with audit/outbox.

Evaluations use fixture/model doubles locally and optional live OpenRouter shadow
runs when credentials are supplied. Live absence is recorded as an external gate,
not a pass. Evaluation never executes returned actions.

## Decision 14 — Retention and privacy remain evidence-preserving

Voice media <=24 hours; unsuccessful draft proposals/previews expire at their
explicit timestamps; deleted conversations hide immediately and purge redacted
nonfinancial content under the privacy worker; usage/failure/audit rows retain
only non-content operational metadata for the established policy window. Privacy
export includes owner consent, conversations/messages, proposals/previews,
feedback, and reports, but excludes private routes/prompts/provider payloads and
voice media. Deletion preserves financial/audit records under prior-Spec policy
and removes or anonymizes Phase 09 nonfinancial owner content in FK order.

## Decision 15 — Client adapters are live but cutover remains bounded

Mobile production selectors call Phase 09 APIs for voice sessions/status/
proposals and assistant consent/conversations/messages/previews/feedback/reports.
Release builds with unavailable native audio or backend/provider capability show
an explicit unavailable state. Admin production AI repository uses redacted Admin
routes. Mock services and MSW handlers remain explicit test/demo tools only.

This satisfies Phase 09's named replacement without claiming the Phase 14 final
cross-domain launch, shadow-write, wholesale mock removal, or production-readiness
program.

## Decision 16 — Rollback disables behavior before reverting code

Rollback first disables Phase 09 routes/jobs, cancels no in-flight finance
command, opens the AI circuit, and leaves core finance healthy. N-1 code can read
past additive tables. Published prompt/model rows, redacted conversations,
proposals, usage, audit, and outbox remain; temporary media continues bounded
purge. Re-enablement requires checksum/schema compatibility and the same route/
prompt evaluation gate.

**Rejected**: dropping Phase 09 tables on rollback, replaying provider requests,
deleting cost/audit evidence, or falling back to client mocks.

## External activation gates

- `OPENROUTER_API_KEY` with least privilege and spending cap;
- account prompt logging disabled and required ZDR/no-training controls verified;
- every enabled model/provider endpoint currently supports required modalities,
  structured schema, price, residency, and retention policy;
- live bilingual/noisy evaluation corpus passes without financial execution;
- hosted alert destinations, image registry attestations, and production release
  approvals when their workflows are triggered.

Their absence never skips local schema, mock-provider, database, security,
recovery, performance, client, or contract gates.
