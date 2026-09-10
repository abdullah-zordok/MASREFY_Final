# Mobile and Admin Mapping: SPEC-BE-010

## Boundary

Phase 10 implements live adapters and parity evidence for report-owned behavior.
It keeps current mock/demo adapters explicit and does not change the production
provider selector or remove mocks; final cutover belongs to SPEC-BE-014.

## Mobile `ReportsService`

| Current method | Backend mapping | Adapter rule |
|---|---|---|
| `getReport(query)` | `GET /reports/summary?type=financial_summary&period=...&anchorDate=...&currency=...` | map four period kinds and the explicit anchor; validate the returned exact range/profile timezone, select only the requested currency group, and preserve data state/evidence. Non-empty account scope and rich fields not represented by BE010 are explicit unavailable states, never client-derived values. |
| `getBreakdown(query)` | same summary with requested supported breakdown or bounded detail query | never fetch all transactions; preserve drill-down filters |
| `getSchedule()` | `GET /report-schedules?limit=1` | return first owned supported schedule or null |
| `verifyRecipient(email, operationId)` | `POST /report-schedules/verify-recipient` | normalize safely; no deliverability/account enumeration claim |
| `saveSchedule(input, version, operationId)` | POST or PATCH schedule | send idempotency and expected version only when every requested setting is represented by BE010; language, currency, delivery day, assistant-summary and detail-level settings remain explicitly unavailable rather than defaulted or relabeled |
| `setScheduleStatus(...)` | PATCH or DELETE schedule | optimistic version; delete maps disabled local state |
| `save/load/discardScheduleDraft` | local encrypted repository | remains device-local; never sent until explicit save |
| `previewOutput(input)` | `GET /reports/summary` plus local safe preview identity | preview URL is not persisted; no snapshot mutation |
| `requestOutput(input, operationId)` | POST report or POST retry-delivery | retry uses previous attempt; scheduled path is worker-owned and client cannot forge time |
| `listAttempts(query)` | bounded report attempt list/status contract | keyset cursor; no provider/snapshot internals |
| `getAttempt(id)` | GET report attempt | map ready/delivered to existing ready/sent; preserve safe failure category |

Mobile additions:

- one live adapter under the existing capability contract;
- DTO parsers reject unknown/unsafe fields and convert ISO times to epoch only at
  the adapter boundary;
- encrypted local persistence may retain summary, status, format, byte count,
  expiry and attempt ID, but strips download URLs before write;
- authorization/session refresh and offline state follow current shared adapters;
- live contract tests run against backend fixtures, and existing mock tests remain.

The current `ReportOutputKind` values `share` and `send_test` remain UI intents:
`share` obtains a fresh authorized download for the OS share sheet, and
`send_test` creates a real email attempt only in live mode. No `simulated` status
is emitted by the live adapter.

## Admin overview and analytics

| Current repository route | Backend owner/data | Authorization |
|---|---|---|
| `GET /api/v1/admin/overview` | bounded combined aggregate from existing identity/tracking/AI plus report-owned financial analytics | exact `admin.overview.read` |
| `GET /api/v1/admin/overview/platform-analytics` | existing profile/device/import aggregates and report freshness | exact `admin.overview.read` |
| `GET /api/v1/admin/overview/activity?page&pageSize` | existing audited safe event projection | exact current activity permission; preserve existing page envelope |
| `POST /api/v1/admin/exports` | server-known aggregate export type/filter/format | exact report export permission + recent auth |
| `GET /api/v1/admin/exports/:attemptId` | private attempt status/fresh link | same permission; support grant for user scope |

Admin additions/modifications:

- preserve existing `OverviewSummaryResponse`, `PlatformAnalyticsResponse`,
  activity pagination, region/freshness/error states, role-independent production
  authorization and server-side filtering;
- add strict export request/status schemas and a narrow repository method;
- replace only overview/export fixture assumptions with backend shadow/live
  contract fixtures; explicit MSW test/development behavior remains;
- add focused Playwright coverage for loading/empty/stale/partial/forbidden/error,
  export accepted/ready/expired, exact permissions and safe download handling;
- no navigation, attention, billing, support, health, or later-Spec fixture family
  is rewritten by Phase 10.

## Shadow reconciliation matrix

| Dataset | Required comparison |
|---|---|
| empty owner | valid zero/empty states, no invented trend/category/planning data |
| normal owner | income, expense, cash flow, categories, comparison, budgets, obligations, savings and balances match current expected fixtures exactly |
| large owner | bounded top groups/pages, exact totals, deterministic ordering, no payload/memory/query limit breach |
| concurrent mutation | one complete before/after ledgerVersion, never mixed totals |
| archived/reversed/deleted | current effective ledger semantics and safe labels preserved |
| multi-currency/missing FX | explicit partial/estimated state; no invented conversion |

Every financial difference is blocking and recorded with safe hashes/counts, not
customer content.

## Error mapping

| Backend code | Mobile outcome | Admin outcome |
|---|---|---|
| validation/type/period/limit | existing validation state | safe field/region error |
| unauthenticated/recent auth | shared sign-in/reverify flow | shared re-auth flow |
| forbidden/not found | unavailable without existence detail | forbidden region/status |
| version conflict | `MutationResult.conflict` with safe current version | safe conflict/refetch |
| storage/render/provider temporary | failed/temporary/retry action | safe retryable status |
| recipient rejection | failed/recipient | safe terminal recipient code, masked |
| configuration | failed/configuration | unavailable/config alert, no secret |
| expired | expired/unavailable, request new output | expired, request new export |
| unknown/internal | generic unavailable with correlation ID | generic safe error/region |

Neither client logs response bodies, recipients, signed URLs, report content,
credentials, provider responses, or internal error details.

## Exclusion checks

- no notification event/preference/template/campaign/delivery code;
- no new support/content/billing/operations surface;
- no production mock disabling/provider switch;
- no long-lived URL persistence;
- no direct Supabase service-role, SMTP, or report table access from either client.
