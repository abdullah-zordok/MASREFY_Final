# Phase 14 Research Decisions

**Date**: 2026-09-08
**Baseline**: `65bc5fd2f8875c72c9885787e5c021e4c2576d09`

## Decision 1: One explicit runtime mode per client

**Decision**: Validate a single `live | demo | test` mode before provider construction. Production permits only `live`; tests inject providers; explicit demo builds may use deterministic mocks.

**Rationale**: Current domain-local selectors make inconsistent decisions and some label local mocks as `live`. Central validation is the smallest way to prevent hidden fallback while retaining fixtures.

**Alternatives considered**: Removing all mocks would break deterministic tests/demo. Independent booleans per domain permit mixed production state and are rejected.

## Decision 2: Use the official Clerk client SDKs

**Decision**: Use the official `@clerk/expo` integration with its secure token cache for Mobile and `@clerk/nextjs` with App Router middleware/provider for Admin. Both request the ordinary Clerk session token and pass it as `Authorization: Bearer`; no custom Supabase JWT template or client role header is used.

**Rationale**: Neither package is installed, and the platform SDKs own sign-in, OTP/OAuth, secure session refresh, pending-session state, and token retrieval. Current official documentation requires the provider at the app root and exposes `getToken()` for external API calls.

**Alternatives considered**: Hand-calling Clerk endpoints duplicates security-critical SDK behavior. Reusing backend `@clerk/backend` in a client would expose the wrong trust boundary.

## Decision 3: Strict decoding at the shared request boundary

**Decision**: Reuse each client's installed Zod and existing contract schemas. Every live response and error is decoded; unknown enum/state/error and malformed financial or identity fields throw an explicit safe contract error. Optional forward-compatible fields are allowed only when the owning contract explicitly says they are ignorable.

**Rationale**: Current mappers contain casts, coercions, defaults, and fabricated values. A strict shared boundary plus domain schemas fixes all callers with less code than per-screen guards.

**Alternatives considered**: Generated clients are deferred because current OpenAPI fragments have proven composition defects and adding generation infrastructure does not fix their instances.

## Decision 4: Redacted comparison without persistence

**Decision**: Compare normalized live and baseline read results inside the client/release harness and emit only operation ID, contract version, record counts, stable hashes, version identifiers, difference codes, duration, and cohort. Persist evidence only as CI/release artifacts.

**Rationale**: Phase 14 owns no table, and financial/customer content must not enter telemetry. Node/Expo cryptography already provides hashing.

**Alternatives considered**: A cutover table violates ownership. Logging full payloads violates privacy. Tolerances are forbidden for financial values.

## Decision 5: Versioned file-based rollout and rollback

**Decision**: Each wave has a versioned client configuration with stage `shadow | internal | bounded-write | full`, cohort identifier, accepted version, and rollback version. Existing BE013 flags may distribute the state only after their evaluator supports stable server-derived cohorts; no parallel rollout service is introduced.

**Rationale**: Git/deployment configuration and evidence satisfy the Master Plan without persistent cutover data. A deterministic subject hash can implement bounded cohorts once the existing evaluator owns it.

**Alternatives considered**: Random selection is not stable. Client-supplied cohort authority is unsafe. A new service/table is out of scope.

## Decision 6: Keep offline/local ownership in existing repositories

**Decision**: SQLite remains the local source for drafts, pending mutations, conflicts, device-only preferences, and protected material. Live adapters enqueue domain-owned envelopes and apply paged bootstrap/delta/tombstones through the existing sync repository. No live adapter clears local state on success, failure, sign-out, or rollback beyond the already-approved explicit user action.

**Rationale**: The existing schema and migrations already encode offline identity and operation IDs. Replacing them risks data loss and duplicates.

**Alternatives considered**: A fresh database or remote-only model violates explicit preservation requirements.

## Decision 7: Repair owner defects before adapter acceptance

**Decision**: A reproducible runtime/OpenAPI/domain defect is fixed in the smallest existing owning-Spec source and test. The Phase 14 evidence names the owner and repair commit. An actually missing capability requires an owner artifact/architecture update before implementation.

**Rationale**: The Constitution assigns one owner and prohibits duplicate Phase 14 backend behavior.

**Alternatives considered**: Client defaults, calculations, and fake unavailable/success records hide contract gaps and are rejected.

## Decision 8: Free-only capability is explicit

**Decision**: Reuse the existing platform metadata seam that reports billing, paid entitlement, checkout, subscription management, and promotions unavailable. Subscription repositories/fixtures remain demo/test only and are unreachable in production. AI uses the server's shared five-request rolling-24-hour default quota.

**Rationale**: This matches approved MVP scope and avoids activating SPEC-BE-012.

**Alternatives considered**: Placeholder production billing or a production subscription mock would misrepresent capability.

## Decision 9: One wave per accepted remote state

**Decision**: Each wave ends with focused and broad local gates, independent code/test/security review, one or more path-scoped commits if a forward fix is needed, a push to `main`, and required remote CI success before the next wave starts.

**Rationale**: The approved order makes every next-wave baseline reviewable and rollback-ready.

**Alternatives considered**: One final push loses per-wave remote evidence. Parallel client writes conflict with the shared checkout and ordered dependency graph.

## Decision 10: External evidence remains an explicit gate

**Decision**: Clerk test identities/OTP, hosted Supabase, production mobile builds/devices, APNs/FCM, SMTP, OpenRouter, deployed Storage/scanner, hosted observability, provider backup/PITR, registry/signing, and stores are recorded as open until real evidence exists. Each record includes missing access, completed local proof, owner action, and exact follow-up command/procedure.

**Rationale**: Local simulation proves code paths but cannot prove a provider or physical delivery.

**Alternatives considered**: Historical or mocked evidence is not a current production pass.

## Confirmed Owner-Side Findings

| Owner | Confirmed gap | Required disposition before wave acceptance |
|---|---|---|
| BE003 | No least-privilege Admin self-context; detail projections fabricate sessions/actions and bypass active-role predicates | Add/repair authoritative self projection and contract tests |
| BE005 | Closed-schema composition rejects linked mutation responses | Repair schema and validate real refund/reversal instances |
| BE006 | Bootstrap paging, signed cursor, device header, jobs, and errors drift in contracts; cursor error filtered to internal | Align owner contracts/filter and validate paged runtime instances |
| BE007 | Planning summary mixes lifecycle/direction and truncates children while reporting ready | Correct completeness/lifecycle semantics or expose explicit partial state |
| BE008 | `report_wrong` maps to an accepting ledger decision; resource schema drops real fields | Make action mapping exhaustive and align strict schemas |
| BE009 | Quota/consent/provider errors lose metadata; several closed `allOf` schemas reject valid instances | Preserve allowlisted safe metadata and repair schema composition |
| BE010 | Partial-month snapshot totals use full months; current API lacks several Mobile filters/settings | Correct date reconciliation and expose unsupported client features honestly unless owner contract is extended |
| BE011 | Preferences GET loses to dynamic notification route; page/detail schemas drift | Reorder route and repair instance schemas/response shapes |
| BE013 | Incident schemas drift; stable cohort bucketing is not implemented; CI omits operations performance/stress/cache | Repair owner contracts/evaluator/evidence and execute omitted local gates |

## Accepted Client Requirement Precedence

- Latest Mobile account/category/transaction/voice addenda govern older research and quickstarts: account/card/tracking fields round-trip; category lifecycle uses authoritative count/version preview; transaction recovery preserves local/later snapshots and excludes unsupported `keep_both`; voice preserves multiple proposals and atomic selected-group/obligation effects.
- The rich report contract retains anchor/timezone/account scope, complete breakdowns, settings, local drafts, confirmed pending/failed-sync records exactly once, and immutable output/delivery snapshots. Unsupported backend dimensions remain explicit until BE010 owner architecture/contracts are corrected.
- Historical Free/Basic/Premium and frontend-only/mock-only requirements are superseded for this release by the approved Phase 14 free-only live cutover. Existing paid UI/data remains production-unavailable and cannot activate billing.
- Historical completion prose is evidence only. Unchecked local implementation/test tasks remain actionable; device/provider/usability/store gates remain open until genuine execution.
- Admin live acceptance requires actor/session-scoped transport/cache state, authoritative IDs and permissions, full pagination, preserved server errors, and exact settings/flag/maintenance semantics. Fixture-era identifiers, simulated roles, canned values, or derived metrics cannot be presented as live evidence.

## Resolved Unknowns

No unresolved clarification item remains. Product scope, wave order, direct-main delivery, free-only behavior, strict failures, rollout stages, and external evidence policy were all explicitly approved.
