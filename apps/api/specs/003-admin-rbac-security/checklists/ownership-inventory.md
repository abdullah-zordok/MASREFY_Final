# Ownership Inventory: SPEC-BE-003

Verified on 2026-08-29 against `data-model.md`, `contracts/openapi.yaml`,
`contracts/events.md`, and the existing repository.

## Ordered migration ownership

The current immutable migration history ends at `20260827001300`. This Spec owns
six additive migration slots generated after that revision for:

1. Admin access tables
2. Permission and role seeds
3. Audit and security events
4. Support access and incidents
5. Privacy and retention
6. Security functions, RLS, and grants

Actual filenames must be generated with `supabase migration new`; generated UTC
timestamps replace the planning placeholders without changing their order.

## Database resources

The 16 owned tables are:

- `public.security_events`
- `public.admin_profiles`
- `public.roles`
- `public.permissions`
- `public.role_permissions`
- `public.admin_role_assignments`
- `public.admin_invitations`
- `audit.audit_events`
- `private.support_access_requests`
- `private.support_access_grants`
- `private.security_incidents`
- `private.security_incident_timeline`
- `private.privacy_export_requests`
- `private.account_deletion_requests`
- `private.retention_policies`
- `private.retention_holds`

The four core functions are:

- `private.admin_has_permission`
- `private.assert_admin_permission`
- `private.assert_support_grant`
- `audit.append_event`

## Contract resources

- OpenAPI: 38 paths and 45 operations
- Jobs: `privacy.export.generate`, `account.deletion.execute`,
  `retention.apply`, `support-grants.expire`, and `security-alert.dispatch`
- Events: `admin.role_assigned`, `admin.role_revoked`,
  `support_access.requested`, `support_access.granted`,
  `support_access.revoked`, `security.incident_opened`,
  `privacy.export_ready`, `privacy.export_expired`,
  `privacy.deletion_requested`, and `privacy.deletion_completed`
- Permission compatibility: 151 unique current Admin keys, seven unique roles,
  and twelve explicit aliases

## Exclusions

No Admin or Mobile production adapter changes are owned before SPEC-BE-014. This
Spec does not add Redis, Prisma, microservices, Edge Functions, Clerk metadata
authorization, client role headers, shared permission caching, generic customer
data access, later-domain tables, or financial mutation ownership.
