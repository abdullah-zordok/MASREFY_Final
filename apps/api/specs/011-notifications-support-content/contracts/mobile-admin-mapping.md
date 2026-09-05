# Mobile and Admin Contract Mapping

## Mobile

| Existing contract/surface | Phase 11 live operation | Mapping rule |
|---|---|---|
| `NotificationService.list/get` | notification list/detail | opaque cursor; map server type/category/action; reject unknown values |
| `markRead/markAllRead` | read command(s) | operation ID -> `Idempotency-Key`; version retained locally |
| `executeAction/resolveTarget` | action + protected detail | authenticate before route; never trust push target data |
| notification preferences | full preference matrix | legacy phone/category/quiet/summary fields map explicitly; server version wins conflicts |
| phone response service | event ID/action key | push has no protected target; fetch detail before navigation/action |
| support categories/articles | support categories + published content | remove hardcoded production articles; locale/type mapped |
| support ticket list/detail/create/reply | support ticket/message APIs | map waiting state names; preserve local drafts on failure |
| attachment flow | initialize/upload/finalize/status/download | never persist quarantine key or long-lived signed URL |

The live provider advertises `providerKinds: ['mock','live']` where the existing
capability registry requires it. Explicit demo/test adapters remain. Production
selection is not changed by Phase 11. Local SQLite stores safe projections,
cursor/version, unread/read state, and draft metadata only; no token, provider,
internal-note, quarantine, or signed-URL data.

Legacy state mapping:

| Mobile term | API term |
|---|---|
| phone notification | push channel |
| deferred | queued with `nextAttemptAt` (safe status only) |
| awaiting customer | `waiting_customer` |
| awaiting agent/support | `waiting_support` |
| article/help item | published content `article|faq|policy|announcement` |

Unknown state/action/category is an explicit unavailable safe failure, never a
fabricated default. Platform permission remains local UX and does not override
server preferences/token state.

## Admin

| Existing repository group | Phase 11 API | Notes |
|---|---|---|
| support overview/tickets/actions/categories | `/admin/support...` | exact action endpoints or discriminated action DTO; notes separate |
| feedback/detail/actions | `/admin/feedback...` | safe reporter/customer fields by permission |
| abuse reports/actions | `/admin/abuse-reports...` | no unauthorized resource/reporter disclosure |
| content collections/actions | `/admin/content...` | map existing collections to four owned types; immediate publish only |
| templates/transactional | `/admin/communications/templates...` | bilingual version/test/publish/retire |
| notification overview/campaigns/audience | `/admin/notifications...` | aggregate preview, separate approval, one-time schedule |
| delivery logs | `/admin/notifications/deliveries` | masked references/safe errors; retry exact permission/MFA |

Repository response validation becomes strict for the live paths. Existing test
MSW fixtures remain deterministic, but production configuration may not silently
fall back to them. Query keys/cache invalidation remain compatible with current UI.

## Forbidden Client Fields

Both clients reject and never persist: push token/hash/ciphertext, provider payload/
credentials/raw reference, template unrestricted variables, audience SQL or user
list, internal notes on customer DTOs, raw scanner result/signature, quarantine
object key, unsafe filename, reporter identity without permission, draft/retired
content on customer routes, service-role secrets, and arbitrary target routes.

## Verification

- Runtime/OpenAPI/Zod/domain schema drift tests cover every used operation and enum.
- Mobile Jest exercises online/offline, cursor/replay/conflict, push response auth,
  support drafts/uploads, published-content fallback, and no-secret persistence.
- Admin Vitest/Playwright exercises exact roles, stale versions, safe errors,
  pagination/filter/search, campaign lifecycle, note separation, attachment state,
  content lifecycle, RTL/LTR, keyboard, and accessibility.
- Static checks ensure no production import selects mock handlers and no response
  schema permits forbidden fields. Final provider selection remains Phase 14.
