# Local Release Evidence

Recorded 2026-08-29 for SPEC-BE-004.

## Baseline and scope

- `git fetch origin main` followed by
  `git rev-list --left-right --count main...origin/main` returned `0 0` at
  `2cd84326f894ca28334319db5025da613adf9628`.
- The checkout is `main`. The preserved untracked `.agents/plugins/` directory is
  unrelated user work and is excluded from this Spec.
- The Phase 04 diff is limited to its Spec package, NestJS reference module,
  required shared permission/error/metric/schema-compatibility corrections,
  Phase 04 migrations/pgTAP/seed entrypoint, tests, runbooks, and the targeted
  Master Plan correction. No Mobile, Admin, or later-Spec implementation changed.

## Dependency verification

- SPEC-BE-001 contracts consumed here pass: database roles and pool context,
  version/audit/outbox primitives, error envelope, `/api/v1` OpenAPI composition,
  observability, migration checksums, and the non-root release image.
- SPEC-BE-002 contracts consumed here pass locally: official Clerk guard shape,
  active profiles, preferences, owner RLS context, and additive N-1 schema
  compatibility. Its independent external release blockers remain open: Apple
  Team ID/iOS registration, two protected Phone OTP identities, hosted canonical
  schema owner/non-owner proof, provider rotation/outage rehearsal, and tag-only
  signed-release evidence. Phase 04 neither recreates nor treats these as passed.
- SPEC-BE-003 contracts consumed here pass: Admin guard, exact permission checks,
  recent-factor boundary, immutable audit, safe errors, and outbox transactions.
  The pinned Admin client permission manifest is unchanged; `reference.read` and
  `reference.write` are backend-owned additions only.

## Database evidence

- A clean `npm run db:reset` applied Release A migrations `080000`-`080200`, the
  Release B `080300` preference FK, and the deliberate no-op `supabase/seed.sql`.
- `npm run db:lint` returned no findings for `public`, `private`, and `audit`.
- `npm run test:db` passed 18 files and 464 assertions. Tests 016-018 cover five
  tables, deterministic repeat seeds, constraints/indexes, forced RLS, minimum
  grants, execute grants, ownership matrices, immutable rates, and guarded
  category/account functions.
- `npm run migration:checksums` reported `migration checksums verified`.
- Live database Jest execution passed all 31 integration suites/70 tests and all
  22 E2E suites/32 tests with zero database-backed skips.
- Release A readiness accepts schema version `20260829080200` and newer; the
  previous identity/preferences surface passed against Release B, proving the
  additive N-1 boundary before FK validation.

## Contract evidence

- The Phase 04 OpenAPI fragment parses with zero missing references, exposes 24
  operations under `/api/v1`, and contains no later-Spec path.
- Contract tests passed for the 12 Mobile currencies, 19 system category keys,
  seven account types, stable client field mapping, exact Admin permissions,
  error envelopes, ETags, and route inventory without client-source edits.
