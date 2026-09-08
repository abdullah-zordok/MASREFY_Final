# Current Client Mapping: SPEC-BE-003

This mapping was rechecked by SPEC-BE-014 on 2026-09-08. Production Admin now
uses `/api/v1/admin/access/me` for self context and
`/api/v1/admin/security/overview` for the overview. Other current access and
security client operations remain explicit `provider_unavailable` because their
paths, pagination, DTOs, or action semantics do not exactly match the canonical
contracts below. Phase 14 does not add replacement backend resources.

## Admin Canonicalization

| Current client surface                     | Canonical Phase 03 contract                            |
| ------------------------------------------ | ------------------------------------------------------ |
| Admin shell session/self context           | `/api/v1/admin/access/me`                              |
| `/admin/admin-users`                       | `/api/v1/admin/access/admins`                          |
| `/admin/admin-invitations`                 | `/api/v1/admin/access/invitations`                     |
| `/admin/roles`                             | `/api/v1/admin/access/roles`                           |
| `/admin/permissions`                       | `/api/v1/admin/access/permissions`                     |
| Phase 7 security overview/events/incidents | `/api/v1/admin/security/*`                             |
| Phase 7 audit                              | `/api/v1/admin/audit/events*`                          |
| Phase 7 support access                     | `/api/v1/admin/support-access/requests*`               |
| Phase 7 export/deletion/retention          | `/api/v1/admin/privacy/*`, `/api/v1/admin/retention/*` |

Page-number mocks map to opaque cursors at the future adapter boundary. Title-case
incident/export/deletion states are projections of canonical lowercase states, not
additional server transitions. Current `confirmationToken` values are discarded;
verified Clerk factor age supplies recent MFA. Display IDs remain presentation
aliases over opaque API IDs.

The Admin shell self call uses Clerk bearer identity plus the exact shared
`admin.overview.read` permission. Its role keys, effective permissions, and active
provider-session count come from the BE003 owner projection; client role query,
header, storage, and fixture values never participate.

The present Admin `accessRepository` calls `/api/v1/admin/access-requests*`, while
the canonical owner contract is `/api/v1/admin/support-access/requests*` with
different cursor and action DTOs. The present security repository also combines
several presentation schemas that are not field-complete matches for the audit,
support-access, privacy, deletion, and retention DTOs. Those calls are disabled in
production until an owning client-contract correction supplies exact adapters.

The Admin `.zip`/`application/zip` export metadata remains compatible. Lists never
contain a signed URL. Ready-detail mapping may expose a minutes-lived URL only
after the dedicated owner/recent-auth request.

## Permission Alias Mapping

The twelve aliases in [data-model.md](../data-model.md) are deterministic adapter
translations. Every other one of the 151 current keys retains exact spelling. CI
parses `apps/admin-web/src/core/permissions/permissions.ts` and
`role-map.ts`, compares count/key/mapping hashes to the server manifest, and fails
on drift. Production never imports or evaluates these files.

The Admin contract comparison also covers the strict Zod surfaces in
`apps/admin-web/src/features/governance/contracts.ts`,
`apps/admin-web/src/features/security/contracts.ts`, and
`apps/admin-web/src/features/access/contracts.ts`. Their page-number pagination,
presentation IDs, and mock-only confirmation fields remain adapter concerns; the
server contract stays cursor-based, opaque-ID based, and recent-auth based.

## Mobile Mapping

| Current Mobile contract             | Canonical Phase 03 contract                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| `listSecurityEvents(cursor?)`       | `GET /api/v1/me/security/events?cursor=`                            |
| export review/confirm               | `POST /api/v1/me/privacy/exports`, then status GET                  |
| account deletion review/confirm     | `POST /api/v1/me/deletion-requests`, status GET, cancellable DELETE |
| support approval status (future UI) | owner support-request list/decision routes                          |

Security events preserve the current safe event shape through an adapter: opaque
ID, allowlisted type/severity, safe title/description metadata, and timestamp. Raw
IP, token, provider payload, unrestricted user agent, or internal Storage reference
has no Mobile mapping.

The current Mobile seam is `SettingsService` in
`apps/mobile/src/services/contracts/assistant-notifications-service.ts`, with its
mock/live-local implementation in
`apps/mobile/src/services/mocks/subscription-settings-service.ts`. It exposes
`listSecurityEvents(cursor?)` and the combined `requestPrivacyAction(kind,
operationId)` review/confirm seam. SPEC-BE-014 owns the future adapter split into
the canonical export and deletion request/status/cancel endpoints.

## Drift Gate

Contract tests compare runtime OpenAPI, this fragment, current Admin Zod schemas,
the 151-key manifest/role map, and Mobile service types. Any silently dropped
security field, widened enum, unmapped state/permission, mock authority, or changed
mutation requirement blocks release.
