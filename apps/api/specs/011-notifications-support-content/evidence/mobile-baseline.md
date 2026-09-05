# Mobile Baseline

Reviewed current notification/support paths:

- Domain and persistence: `src/domain/notifications.ts`, `src/domain/support.ts`,
  `src/storage/assistant-notifications-repository.ts`, and
  `src/storage/support-repository.ts` plus their tests.
- Service boundaries: `src/services/contracts/assistant-notifications-service.ts`,
  explicit mock services, and `src/services/platform/phone-notification-service.ts`.
- Screens/queries: notification center/preferences/response paths and support home,
  form, ticket list/detail, draft and query paths.
- Existing platform notification permission UX remains client-owned.
- `support-queries.ts` currently supplies hardcoded help articles; production reads
  must move behind the live published-content adapter while fixtures remain tests.

Phase 11 supplies one live-capable adapter and removes owned service-level no-ops.
It does not flip the final production provider selection or remove explicit
mock/demo configuration, which remains Phase 14.

