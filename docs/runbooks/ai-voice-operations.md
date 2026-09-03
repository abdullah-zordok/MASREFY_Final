# AI and voice operations

This runbook covers SPEC-BE-009. Never paste or query raw prompts, completions,
audio, transcripts, credentials, bearer tokens, customer text, or financial
evidence during operations. Use opaque request/session IDs, bounded error codes,
aggregate metrics, and the redacted Admin projections only.

## Safe enablement and emergency disable

Routes ship disabled. Before enabling one, verify the OpenRouter account is
approved for zero-data-retention/no-training, configure `OPENROUTER_API_KEY` only
in the worker secret store, and run the prompt corpus and provider-independent
gates. In Admin AI, publish the evaluated prompt, then enable its route using the
current expected version, recent MFA, a reason, and a unique idempotency key.

For an incident, disable the affected route through the same governed Admin API.
Disabling is the rollback: finance APIs remain available and AI returns the safe
unavailable response. Never delete route, prompt, model, safety, usage, failure,
or audit rows and never put the key in API, Mobile, Admin, logs, or tickets.

## Prompt, model, and route rollback

Publish only a `testing` prompt whose enabled corpus passed. Publication retires
the prior immutable version atomically. To roll back, create a new prompt version
from the last reviewed template, rerun the corpus, and publish it; do not rewrite
history. Route/model changes use expected-version concurrency. Reject fallbacks
that duplicate the primary, lack required capabilities, exceed route prices, are
outside the provider allowlist, or weaken ZDR/no-training policy.

## Budget, quota, and circuit response

The temporary server default is five accepted AI work items per user per rolling
24 hours. Budget reservations emit once-only 70%, 85%, and 95% events; the next
reservation at the hard stop is denied before provider I/O. A circuit opening or
provider failure must not trigger manual replay storms. Inspect aggregate failure,
fallback, cost, latency, and queue counts; acknowledge or resolve failure events
through the audited Admin endpoint. Never increase a cap merely to clear an alert.

## Queue drain and recovery

Stop the AI worker cleanly and allow active calls to reach their deadline. Voice,
assistant, and evaluation claims are reclaimable only after `lease_until`; a new
claim token fences the old worker. Restart the worker and drain bounded batches for
`voice.transcribe_extract`, `assistant.respond`, and `ai.evaluate_route`. Run the
bounded `ai.usage_rollup`, `ai.proposals.expire`, `voice-media.purge`, and
`private.reconcile_ai_state(100)` paths until their aggregate backlogs stabilize.
Do not clear claim tokens or edit customer payloads manually.

## Voice media purge

Media is private, temporary, and owner-scoped. A purge claim carries a fence
token. Missing objects count as successful idempotent deletion; Storage failure
releases the claim for bounded retry. Escalate any object remaining after its
retention deadline, repeated purge failure, cross-owner access, or mismatch
between storage deletion and `storage_ref` clearing. Preserve only the session ID,
purge token hash, timestamps, and error code.

## Restore and migration recovery

Take and verify a database backup before the four ordered Phase 09 migrations.
Validate locally with:

```powershell
cd apps/api
npm run db:reset
npm run db:lint
npm run test:db
npm run migration:checksums
$env:MASARIFI_LIVE_DATABASE_TESTS='1'
$env:DATABASE_URL='<approved-database-url>'
npm run test:ai:recovery
```

On failed forward application, keep published migration history immutable and
ship a corrected forward migration after the rollback probe passes. Database
rollback is restore-based. Application/worker images may roll back while the
additive schema remains N-1 compatible. After restore, run reconciliation and
media purge before re-enabling any route.

## Release and external gates

Run `npm run test:ai`, `npm run test:performance:ai`, and
`npm run test:stress:ai` with approved local test configuration. Real provider
validation is allowed only when an approved OpenRouter key and reviewed account
policy are available; otherwise record that single external gate as pending.
Release builds without provider configuration must show an explicit unavailable
state and must never fall back to fixtures.

Escalate cross-owner disclosure, credential/content logging, direct AI financial
mutation, bypassed consent/MFA/version checks, non-equivalent fallback, hard-budget
bypass, duplicate financial effects, unreconciled usage, or unexplained audit and
outbox gaps immediately.
