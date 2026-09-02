# Events and Jobs

## Outbox events

All events use the existing platform envelope and contain identifiers, versions,
bounded status/reason codes, and timestamps only.

| Event | Trigger | Safe payload fields |
|---|---|---|
| `tracking.preference.updated.v1` | owner preference changed | preferenceId, version, enabled, reviewRequired, occurredAt |
| `tracking.rule.changed.v1` | owner rule changed/restored | ruleKind, ruleId, action, version, occurredAt |
| `import.session.changed.v1` | session state transition | sessionId, status, itemCount, failedCount, version, occurredAt |
| `import.item.changed.v1` | item state transition | sessionId, itemId, status, parserVersionId, reasonCode, version, occurredAt |
| `tracking.review.requested.v1` | review created | reviewId, itemId, reasonCode, version, occurredAt |
| `tracking.review.resolved.v1` | owner/admin resolves review | reviewId, itemId, resolution, version, occurredAt |
| `tracking.duplicate.detected.v1` | duplicate candidate created | candidateId, itemId, existingTransactionId, scoreBand, version, occurredAt |
| `tracking.duplicate.resolved.v1` | duplicate decision committed | candidateId, resolution, version, occurredAt |
| `tracking.feedback.recorded.v1` | feedback recorded | feedbackId, historyId, kind, occurredAt |
| `parser.rule.version.changed.v1` | version published/retired/rolled back | ruleId, versionId, status, versionNumber, occurredAt |
| `unsupported.format.recorded.v1` | unsupported fingerprint observed | unsupportedFormatId, reasonCode, occurrenceCount, occurredAt |

Forbidden payload fields include raw bytes, message/source text, filenames, object
keys, keywords, rule documents, parser evidence, merchant/title, amount, tokens,
provider content, request/response bodies, and secrets.

## Worker jobs

| Job | Claim order | Success | Retry/terminal behavior |
|---|---|---|---|
| import parse | createdAt, id | parsed/review/unsupported item | deterministic exponential delay with jitter; terminal review after max attempts |
| duplicate evaluate | createdAt, id | candidate or no-candidate decision | retry transient DB fault; terminal review on invariant failure |
| ledger accept | createdAt, id | ledger transaction linked | same ledger idempotency key forever; conflict to review; bounded retry |
| parser corpus run | requestedAt, id | immutable run summary | failure retains version as draft and records safe diagnostics |
| raw purge | expiresAt, id | object absent and row marked purged | missing object is success; transient Storage failure retries |
| retention compact | retention cutoff, id | expired nonfinancial detail removed | bounded batches and resumable cursor |
| reconciliation | oldest unresolved first | drift repaired or safe alert emitted | never creates a second ledger transaction |

Every claim function validates batch and lease bounds, uses `FOR UPDATE SKIP
LOCKED`, creates a UUID token, and records worker ID and expiry. Execute/complete
functions require matching status, worker, token, and an unexpired lease. Claims
are short transactions; network or ledger work occurs outside their locks.

## Retry classes

- retry: serialization/deadlock, temporary database/storage/provider unavailability,
  worker interruption, or bounded ledger service unavailability;
- review: ambiguous parse, unsafe integer, low confidence, ledger command conflict,
  missing account/category decision, or invariant requiring owner judgment;
- terminal unsupported: rejected media/container/encoding/grammar or disabled source;
- terminal security: hostile name/signature/content or DSL validation failure.

## Metrics and alerts

Metrics use bounded labels only: operation, outcome, reason code, source type, and
job kind. No user, session, item, institution, merchant, sender, or parser IDs are
labels. Required measures cover request latency/errors, accepted/rejected bytes,
parse outcome/confidence, claim/complete latency, retry/exhaustion, queue age/depth,
review and duplicate age, ledger accept conflicts, raw purge lag, reconciliation
drift, and parser-corpus pass rate.

Alerts cover sustained job age/depth, retry or exhaustion spikes, hostile rejects,
unexpected auto-accept rates, review/duplicate backlog, purge lag/storage growth,
ledger conflicts, parser regression, and reconciliation drift. Runbooks identify
safe pause, replay, rollback, purge, restore, and evidence commands.
