# Internal Contracts

## Idempotency and quota

Every POST/PUT/PATCH decision/work request uses the existing SPEC-BE-006
idempotency boundary. The service checks replay before quota. The canonical hash
includes authenticated owner, operation, resource, expected version, and normalized
body. Same key/same hash returns the original status/body; same key/different hash
returns the existing idempotency conflict.

`private.reserve_ai_quota(user_id, operation_id, now)` atomically returns
`allowed`, `limit=5`, `used`, and `resets_at` across accepted voice/assistant work
in the preceding 24 hours. The operation ID is unique, so replay never increments.
The reservation is inserted in the same transaction as the session/message work
record. Invalid/rejected-before-enqueue requests and hard-budget stops consume no
unit; provider-bound failures consume their reservation.

## Consent

Assistant work requires one active consent for the server's current policy version
at enqueue and again before provider dispatch. Revocation prevents new work,
cancels queued unclaimed work, and blocks pending preview confirmation. It does not
erase immutable financial/audit records. Voice transaction capture uses the
product privacy notice and session acceptance contract; assistant consent is not
silently inferred from voice use.

## Proposal validation and confirmation

`private.validate_ai_proposal(workload,schema_version,payload,user_id)` accepts a
strictly parsed object and returns normalized safe fields/reason codes. It verifies:

- supported schema/workload/action and no unknown fields;
- canonical nonzero integer minor amount and current currency;
- ISO date within the ledger's allowed range;
- active account/category belongs to or is readable by owner as required;
- merchant/note bounds and redaction; confidence range;
- current quota/route/safety policy metadata; and
- no model-provided command, URL, SQL, tool, owner, permission, or expiry.

`private.confirm_ai_action(preview_id,expected_version)` locks the owner resource,
checks active consent when assistant-originated, current status/version/expiry,
revalidates every reference and current authorization, and maps only to a named
existing domain command. Voice `transaction.create` invokes the SPEC-BE-005 ledger
service with key `ai-action:<preview-or-proposal-id>:v<version>`. The Phase 09 row
becomes executed only after command success, with audit and outbox in the same
application transaction boundary. Conflict/failure leaves it nonexecuted.

Confirmation replay returns the prior executed resource. Rejection and expiry are
idempotent terminal states and never call a domain command. `editedFields` is an
allowlisted patch revalidated as a complete proposal; it cannot alter owner,
schema, type, execution target, or expiry.

## Evidence assembly

The service reads only explicitly selected owner context scopes. Each row is
authorized before inclusion and mapped to a request-local alias. Evidence refs
persist only `{kind,alias,version}`; they prove what class/version informed a
response without retaining raw provider context or leaking underlying IDs. The
assistant response may cite only aliases supplied in that request.

The initial context scopes are `accounts_summary`, `recent_transactions`,
`budgets`, `obligations`, and `tracking_reviews`; missing or later-Spec scopes fail
validation. Limits are fixed per scope, totals use exact minor units, and content
is redacted/minimized before provider dispatch.

## Route, prompt, and safety governance

Only the effective-route function can supply a provider request. Route changes
validate all referenced approved providers/models, privacy, capability, schema,
price, and limits. Prompt publication requires exact permission, recent MFA,
reason, version, nonempty enabled corpus, and the latest complete passing
evaluation. Safety rule updates use a closed rule schema and take effect on the
next request; they cannot authorize an action.

The initial exact permissions are:

| Surface                | Read                | Mutate                                                      |
| ---------------------- | ------------------- | ----------------------------------------------------------- |
| providers/models       | `ai.providers.read` | `ai.providers.manage`                                       |
| routes                 | `ai.routes.read`    | `ai.routes.manage`                                          |
| prompts/corpus         | `ai.prompts.read`   | `ai.prompts.manage`, publish/test uses `ai.prompts.publish` |
| usage/budgets/failures | `ai.usage.read`     | route/budget action uses `ai.operations.manage`             |
| safety                 | `ai.safety.read`    | `ai.safety.manage`                                          |
| response reports       | `ai.reports.read`   | `ai.reports.manage`                                         |

All mutations also require the existing Admin request context; privacy/publishing
changes require recent MFA. Authorization is server-side and audited.

## Budget and accounting

The route's budget period and amount are server-owned. Before dispatch, a locked
reservation checks actual plus outstanding conservative reservations. Percent
crossings 70/85/95 each enqueue one event per period/threshold; `>=100` rejects
before HTTP. Completion replaces reservation with provider cost exactly once.
Failure retains conservative cost until reconciliation can prove a lower amount.

Rollup/reconciliation may correct derived totals from immutable usage rows but
never fabricate zero cost, delete request evidence, or enable a route.

## Privacy and support

Privacy export returns owner consent history, voice session/proposal metadata and
redacted fields, conversations/messages, response evidence aliases, previews,
feedback, and reports in bounded canonical JSON. It excludes audio/storage refs,
provider requests/responses, prompts/cases/rules/routes, usage internals, Admin
audit, circuit state, and secrets.

Deletion purges voice objects, deletes/anonymizes nonfinancial content and owner
preferences in dependency order, preserves existing transactions and required
audit/outbox/operational evidence, and is restartable. Existing support context
may expose only counts, timestamps, state, safe codes, and resource IDs already
authorized by its purpose; never content, audio, prompts, evidence bodies, or
provider details.

## Reconciliation

The bounded reconciliation job checks media/database orphans, terminal states
without required result/audit/outbox, executed previews without matching existing
domain resource, duplicate usage request IDs, outstanding budget reservations,
route/prompt incompatibility, and expired unprocessed proposals/previews. It
repairs only derivable metadata or enqueues safe cleanup; unexplained finance or
cost discrepancies alert and remain visible.
