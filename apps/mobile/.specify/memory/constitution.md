<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles:
  - II. Automatic First, Platform Honest — approved production backend/provider cutover is now allowed through typed adapters
  - V. Typed, Replaceable, and Verifiable Frontend — production selection must fail closed and preserve local ownership
- Modified sections:
  - Product and Technical Constraints — frontend-only/mock-only restriction replaced by live-production and explicit demo/test modes
  - Delivery and Quality Gates — production mock isolation and local-data migration proof added
- Removed sections: none
- Templates:
  - updated: .specify/templates/plan-template.md
  - updated: .specify/templates/spec-template.md
  - updated: .specify/templates/tasks-template.md
- Agent command review: no stale agent-specific references found
- Dependent documents:
  - updated: docs/mobile_app/Masarifi-Mobile-Frontend-SpecKit-Master.md
  - updated: apps/api/specs/014-client-cutover-mock-migration-production-readiness
- Amendment rationale: Phase 14 integrates the already-approved backend while retaining typed boundaries, platform honesty, local/offline preservation, and security controls.
- Owner approval: the project owner's approved Phase 14 request on 2026-09-08 explicitly authorizes production client cutover and this prerequisite amendment.
- Follow-up TODOs: none
-->

# Masarifi Mobile Constitution

## Core Principles

### I. Financial Trust and User Control
Masarifi MUST make financial values, statuses, sources, and next actions clearer than
decoration. Automatic financial changes MUST expose undo or correction, and uncertain
results MUST enter a review flow. The assistant MUST NOT create, change, or delete a
financial record without explicit user confirmation. Sensitive values MUST be masked by
default, revealed only through an authorized action, excluded from analytics, and never
exposed through raw errors. Language MUST remain calm, practical, and non-judgmental.

Rationale: users will only rely on financial guidance they can understand, verify, and
reverse.

### II. Automatic First, Platform Honest
Automatic capture is the preferred Android path, but every automated capability MUST have
a usable manual fallback. Android SMS access MUST require an educational permission flow
and explicit consent. iOS MUST NOT display or imply Android SMS capabilities; it MUST offer
honest manual, voice, and approved platform alternatives. Permission denial, automation
failure, or offline operation MUST NOT block the core application. Camera capture, receipt
scanning, and investments remain outside Core V1. Approved production backend and provider
integrations MUST use typed adapters, server-owned authorization, explicit capability and
configuration checks, and an honest unavailable state when the service cannot run.

Rationale: the product promise depends on low-effort capture without misleading or
excluding users whose platform or permissions differ.

### III. Arabic- and English in important first , Accessible Parity
Every user-facing feature MUST be complete in Arabic RTL and English LTR. Layouts MUST use
logical direction, directional icons MUST mirror only when their meaning requires it, and
financial numbers and dates MUST use English numerals with locale-aware formatting. No
user-facing string may be hard-coded in a feature component. Every screen MUST support
font scaling, screen readers, clear labels, sufficient contrast, reduced motion, logical
focus order, and touch targets of at least 44 by 44 pixels. Status, chart, and financial
meaning MUST NOT rely on color, motion, illustration, or haptics alone.

Rationale: Arabic is a first-class product language, and financial understanding cannot
depend on a user's language, vision, motor ability, or motion tolerance.

### IV. Semantic Design System Only
Mobile UI MUST follow the Masarifi Gulf Premium design system and consume shared semantic
tokens from `packages/ui-tokens` where available. Feature components MUST NOT contain raw
brand colors or invent local token systems. Teal is the primary interaction family;
bronze is a restrained premium accent, not a second primary color. The interface MUST
prioritize clear amounts and actions, use borders before decorative shadows, avoid visual
noise, and define relevant loading, empty, error, offline, disabled, permission, and sync
states. Components MUST document responsive, RTL, accessibility, content, and token
behavior in their implementation specification.

Rationale: one semantic system keeps the mobile experience coherent across themes,
languages, device sizes, and financial states.

### V. Typed, Replaceable, and Verifiable Frontend
The application MUST use a shared React Native and Expo TypeScript codebase organized by
feature. Server-dependent behavior MUST be represented by typed contracts, mock services,
and replaceable adapters. Platform-specific behavior MUST remain behind adapters. The
mobile client MUST NOT contain production secrets, direct database access, direct AI
provider calls, or business rules hidden inside presentation components. Server-shaped
state MUST have one owner and MUST NOT be duplicated across query and local stores. Production
builds MUST select only approved live adapters and MUST fail closed when required identity,
endpoint, contract, or provider configuration is missing or invalid. Mock adapters MUST remain
reachable only in explicit demo and test modes.

Each feature MUST include the smallest tests that prove its financial calculations,
validation, permission mapping, state transitions, and critical user journeys. A feature
is incomplete until relevant tests pass and Arabic RTL, English LTR, light mode, dark mode,
small and large phones, accessibility text, offline behavior, and permission states have
been checked.

Rationale: typed boundaries let the frontend progress safely before production services
exist, while focused verification protects money-related behavior and platform flows.

## Product and Technical Constraints

- Approved production features MUST use typed live adapters; unfinished external services MUST
  expose an explicit unavailable state. Deterministic mocks remain limited to demo and test modes.
- The baseline stack is React Native, Expo Development Builds, TypeScript, and Expo Router.
  Any deviation MUST be justified in the feature plan.
- Financial strings MUST use locale-aware formatters; manual string assembly is prohibited.
- Financial semantic colors and operational status colors MUST remain distinct.
- Forms MUST preserve entered data after validation errors and accidental navigation where
  loss would be harmful.
- Live cutover, sign-out, account switching, rollback, and upgrade MUST preserve owner-scoped
  drafts, pending mutations, conflicts, device-only preferences, and protected local material.
- Async features MUST provide actionable recovery and MUST NOT expose stack traces or
  provider errors.
- Lists and charts MUST remain usable with realistic dense data; large transaction lists
  require virtualization and charts require accessible text summaries.
- The mobile master specification and Gulf Premium design system are authoritative product
  inputs. This constitution governs conflicts and delivery decisions.

## Delivery and Quality Gates

Every feature specification MUST identify its platform behavior, manual fallback, financial
data effects, privacy treatment, localization, accessibility, async states, and measurable
acceptance scenarios. Plans MUST pass the Constitution Check before research and again after
design. Tasks MUST include implementation and verification work for every applicable MUST.

Reviewers MUST reject work that introduces unsupported iOS SMS claims, hidden financial
changes, untyped service boundaries, hard-coded brand values or user-facing strings,
production secrets, inaccessible status meaning, or unverified critical flows. Exceptions
require a documented violation, why it is necessary, and why a simpler compliant option
cannot meet the requirement.

Production reviews MUST also reject mock/demo fallback, client-supplied authorization,
cross-owner local state, destructive local-data migration, unknown-state coercion, and direct
third-party provider calls.

## Governance

This constitution supersedes conflicting project practices and feature documents.
Amendments require a written rationale, an impact report, updates to dependent Spec Kit
templates, and explicit approval from the project owner. Versioning follows semantic
versioning: MAJOR for incompatible principle removal or redefinition, MINOR for a new
principle or materially expanded obligation, and PATCH for non-semantic clarification.

Every specification, implementation plan, task list, and code review MUST verify compliance.
The authoritative product references are
`docs/mobile_app/Masarifi-Mobile-Frontend-SpecKit-Master.md` and
`docs/design-system/masarifi-gulf-premium-design-system-v2.1.md`.

**Version**: 2.0.0 | **Ratified**: 2026-08-05 | **Last Amended**: 2026-09-08
