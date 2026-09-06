# Mobile and Admin Mapping: SPEC-BE-013

## Admin Mapping

Approved layouts remain unchanged. Existing repositories are the live boundary; MSW handlers remain test-only.

| Existing Admin seam | Live Phase 13 route | Required contract change |
|---|---|---|
| `system-health.getHealthOverview` | `GET /api/v1/admin/system-health/overview` | service count becomes bounded, not fixed at 12; remove payments category |
| `system-health.listProviderHealth` | `GET /api/v1/admin/system-health/providers` | provider categories become database/storage/identity/ai/email/push; remove Stripe |
| `system-health.listQueueHealth` | `GET /api/v1/admin/jobs/queues` | replace billing/subscription queue with actual Free-only queues/workers |
| `system-health.listScheduledJobs` | `GET /api/v1/admin/jobs/scheduled` | add owner Spec, job key/type, timeout, attempts, safe actions, version |
| `system-health.listJobRuns` | `GET /api/v1/admin/jobs/runs` | use Phase 13 run states and safe summaries |
| `system-health.getJobRun` | `GET /api/v1/admin/jobs/runs/{runId}` | return attempts and computed safe actions; no payload/timeline internals |
| `system-health.retryJobRun` | `POST /api/v1/admin/jobs/runs/{runId}/retry` | exact permission, recent MFA, version, reason, idempotency |
| `system-health.cancelJobRun` | `POST /api/v1/admin/jobs/runs/{runId}/cancel` | exact permission, recent MFA, version, reason, idempotency |
| incident views | `/api/v1/admin/incidents...` | live bounded lifecycle and public/internal-safe fields |
| `governance.getSettingsGroup` | `GET /api/v1/admin/settings` and `/{key}` | safe metadata; restricted value always redacted; remove subscriptions group |
| `governance.updateSettingsGroup` | `PATCH /api/v1/admin/settings/{key}` | exact per-key change, version, reason, idempotency |
| `governance.listFeatureFlags` | `GET /api/v1/admin/feature-flags` | draft/active/retired, fail-safe default, version; no entitlement flags |
| `governance.updateFeatureFlag` | flag create/update/activate/retire routes | exact lifecycle and rule contracts |
| feature preview | `POST /api/v1/admin/feature-flags/{key}/preview` | synthetic closed context; resolved output only |
| `governance.getMaintenance` | `GET /api/v1/admin/maintenance` | list current/upcoming/recent bounded windows; no `mockOnly` field |
| `governance.updateMaintenance` | maintenance create/update/action routes | versioned lifecycle, reason, recent MFA |
| performance views | `GET /api/v1/admin/performance` | P50/P95/P99 budget state and bounded series |
| recovery views | `GET /api/v1/admin/recovery` | evidence metadata only, no backup contents/actions |

### Production fixture boundary

- Production repositories always use the API client.
- MSW and fixture state are imported only by tests or explicit development/demo harnesses.
- Runtime screens must not import `src/mocks`, raw fixtures, or data snapshots.
- Billing pages may remain source artifacts for future work, but Phase 13 production navigation/capability responses must not advertise them as available.
- No touched operations contract accepts `stripe`, payment, subscription-reconciliation, or a billing operator as an active provider/job concept.

## Mobile Mapping

Add a separate capability contract owned by Phase 13:

```text
capability: foundation.platform-operations
majorVersion: 1
providerKinds: live | mock
unavailableOutcome: foundation.operations.unavailable
```

The live provider calls authenticated `GET /api/v1/meta`, validates the complete response, and exposes:

```text
apiVersion
serverTime
minMobileVersion
capabilities:
  coreFinanceAvailable: true
  billingAvailable: false
  paidEntitlement: false
  checkoutAvailable: false
  subscriptionManagementAvailable: false
  promotionsAvailable: false
  aiAvailable: boolean
  aiAllowancePerRolling24Hours: 5
maintenance:
  active: boolean
  scopes: allowlisted safe strings[]
  message: { ar, en } | null
featureFlags:
  map of approved public flag keys to boolean results
  configurationVersion: positive integer
```

The response does not expose provider status/errors, queue/job data, settings, rules, metric names/series, incidents, backup/restore data, cache data, Admin state, roles/permissions, or mock subscription state.

### Context derivation

- The live adapter supplies platform, app version, and locale headers.
- The server validates headers and derives the feature context; it ignores/rejects role, plan, entitlement, and arbitrary audience headers.
- When meta is unavailable or invalid, billing remains false, paid capabilities remain false, and optional flags fail safe. Existing core finance service behavior is not replaced.

### Protected file boundary

`apps/mobile/src/services/contracts/assistant-notifications-service.ts` is user-owned and remains untouched. The Phase 13 contract lives in a new platform-operations contract/service and may be registered alongside existing foundation services.

## Free-only Acceptance Matrix

| Claim | API | Admin | Mobile | Expected |
|---|---|---|---|---|
| Billing available | meta false | hidden/unavailable | false | always false |
| Paid entitlement | absent/false | never derived | false | always false |
| Checkout | no route | no working action | false | unavailable |
| Subscription management | no route | no working action | false | unavailable |
| Promotions | no route | no working action | false | unavailable |
| AI allowance | safe meta value | read-only safe setting metadata | integer 5 | Free-only, no plan claim |
| Core finance | existing domain APIs | operational status only | existing finance providers | independent of optional provider outage |

## Contract Tests

- Parse every healthy, degraded, stale, partial, empty, forbidden, and unavailable operations response through Admin schemas.
- Prove no fixed-length assumption remains for configured providers/services/queues.
- Prove a Stripe or billing value fails the touched schemas and server validators.
- Prove restricted settings have no `value` property.
- Prove a Mobile response with extra internal keys fails strict parsing.
- Prove a production build cannot select MSW/mock operations data.
- Prove the protected assistant/subscription contract has no Phase 13 diff.
