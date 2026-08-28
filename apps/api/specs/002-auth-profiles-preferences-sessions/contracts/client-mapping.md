# Client Contract Mapping: SPEC-BE-002

**Reviewed**: 2026-08-28
**Scope**: Mapping only; `apps/mobile` and `apps/admin-web` remain unchanged
**Cutover owner**: SPEC-BE-014; privileged Admin routes/permissions: SPEC-BE-003

## Mobile Authentication

| Current Mobile contract | SPEC-BE-002 authority | Mapping / boundary |
|---|---|---|
| `AuthService.startPhone` / `verifyPhone` / `resendPhone` | Clerk Phone OTP | Provider adapter is deferred; OTP never enters Masarifi API/storage/logs. |
| `AuthService.signInWithGoogle` | Clerk Google | Provider adapter is deferred; Google tokens never enter Masarifi storage. |
| `AuthenticationSession.userId` | Verified Clerk `sub` | Text identity, 1..128; never email, phone, or Supabase UUID. |
| `AuthenticationSession.method` | `phone` or `google` | Display/session metadata only; authorization is provider-independent. |
| `issuedAt` / `expiresAt` | Verified Clerk session | Client projection only; backend trusts SDK-verified token time claims. |
| `restoreSession` | Clerk secure native session cache | Deferred to SPEC-BE-014; no JWT is stored in Mobile SQLite. |
| `signOut('local'|'all')` | Clerk session lifecycle | Client implementation is deferred; device-linked revoke here remains backend-only. |
| Supported codes `+20/+966/+971` | Clerk SMS provider allowlist | Mobile validation is UX only and cannot prove provider enforcement. |

The approved native identity is `com.masarifi.mobile` on Android and iOS. The
approved callback is `masarifi://oauth-callback`; it is a redirect, not an
authorized HTTP party, JWT audience, or `azp` value.

## Mobile Onboarding

| Current Mobile field | Backend projection | Rule |
|---|---|---|
| `currentStep` | `step` | Mobile values map directly; new backend default `welcome` maps to first-launch routing. |
| `completedSteps` | `completedSteps` | Only the 11 Mobile step identifiers plus `complete`, unique and canonical. |
| `status === 'completed'` | `complete: true`, `completedAt != null` | Completion is server-timestamped; an identical completed state is a no-op. |
| `status !== 'completed'` | `complete: false` | `step` must be consistent with incomplete state. |
| Local `updatedAt` | `expectedVersion` / response `version` | Client timestamps are not concurrency authority. |
| `platformPath`, `skippedSteps` | Not synchronized | Remain local. |
| `permissionEducationSeen`, SMS permission | Not synchronized | Remain platform-local. |
| `trackingPreference` | Not synchronized by this table | Remains local or moves under its owning domain Spec. |
| PIN, biometric, lock, navigation destination | Not accepted | Security/navigation state never enters onboarding SQL. |

## Admin Profile Projection Handoff

Current Admin identifiers (`USR-*`) and `example.test` masks are synthetic. A
SPEC-BE-003/014 adapter must map them to permission-protected DTOs without changing
`profiles.id` or exposing the raw Clerk subject unnecessarily.

| Current Admin field/group | Available SPEC-BE-002 evidence | Deferred work |
|---|---|---|
| `displayName`, language, timezone, status, registered/last-active times | Profile safe fields and lifecycle evidence | SPEC-BE-003 permission and masking policy. |
| `maskedEmail` | Backend can mask `primary_email` | Exact Admin mask/projection belongs to SPEC-BE-003. |
| Country | May be derived from masked phone only when authorized | Never persist the synthetic `SA/AE` mock value as identity. Egypt must remain representable. |
| Plan, verification, risk, aggregates | Not owned by SPEC-BE-002 | Owning domain/security Specs. |
| Suspend/reactivate/verification/bulk actions | No route or authority here | SPEC-BE-003 only. |

## Admin Device and Session Handoff

| Current Admin field/group | Available SPEC-BE-002 evidence | Deferred work |
|---|---|---|
| Device ID | `user_devices.id` UUID | Adapter replaces synthetic `DEV-*`; never authorizes by display ID. |
| Safe label, platform, app version, last seen, revoked state/time | Safe device projection | SPEC-BE-003 permission-protected Admin DTO. |
| OS/capability states | Not owned/stored here | Remain client/domain evidence until an owning Spec exists. |
| Push state | Revoked/active token existence is private worker evidence | Never expose token, hash, or ciphertext. |
| Session list fields | Clerk remains session source of truth | No Masarifi session table or Admin session route is created here. |
| `user_devices.clerk_session_id` | Private minimum revoke linkage | Never returned directly to Admin or Mobile. |
| Revoke device/session, force logout | No Admin route or permission here | SPEC-BE-003 owns authorization/actions; SPEC-BE-014 owns adapter cutover. |

## Enforced Boundary

- SPEC-BE-002 exposes only customer `/api/v1/me/**` operations and
  `POST /webhooks/clerk`.
- No `/api/v1/admin/**` route, Admin role, permission, or direct database grant is
  introduced.
- Simulated Admin roles, mock headers, Clerk metadata, and client visibility grant
  no backend authority.
- Mobile/Admin source and mocks remain unchanged until their owning Specs.
