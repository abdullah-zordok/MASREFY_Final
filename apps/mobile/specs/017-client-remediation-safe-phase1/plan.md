# Implementation Plan: Remaining Safe Phase 1 Client Remediation

**Branch**: `codex/client-remediation-safe-phase1` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-client-remediation-safe-phase1/spec.md`

## Summary

Complete the repository-owned Mobile Phase 1 corrections by strengthening the existing
canonical transaction projection and repository boundaries: transfers remain uncategorized,
refunds are eligible and bounded, card payoffs reuse balanced transfer postings with an
explicit purpose and operation identity, and categories declare income or expense meaning.
Reuse current obligation calculations, select an explicitly unavailable production tracking
provider, and prove cross-surface parity with one shared fixture. Preserve the Gulf baseline,
UI system, backend boundaries, and active SPEC-BE-006 ownership.

## Technical Context

- **Language/Version**: TypeScript 5.9, React 19.2, React Native 0.83, Expo 55
- **Primary Dependencies**: Expo Router, TanStack Query, Zustand, Zod, expo-sqlite, i18next
- **Storage**: Existing on-device SQLite JSON-payload tables and repository operation ledger
- **Testing**: Jest 29, jest-expo, Testing Library React Native, TypeScript, ESLint
- **Target Platform**: Android and iOS Mobile; web-compatible tests where already supported
- **Project Type**: Expo Mobile application inside the existing monorepo
- **Performance Goals**: Preserve current local repository and 60 fps UI budgets; no new network/provider work
- **Constraints**: Offline-first, integer minor units, no new dependency/route/design, production tracking fail-closed, no backend/Admin/SPEC-BE-006 duplication
- **Scale/Scope**: Focused Mobile domain, repository, service, presentation, localization, tests, and remediation ledger updates

## Constitution Check

_GATE: Passed before Phase 0 and re-checked after Phase 1 design._

- **Financial trust — PASS**: Refund and payoff validation occurs before mutation; operation
  identities replay safely; canonical projections own balance/income/expense effects; existing
  correction paths remain. No secret, OTP, provider text, or new sensitive field is added.
- **Platform honesty — PASS**: Android and iOS production tracking resolve to an explicit
  unavailable provider until native evidence and an approved corpus exist. Manual entry remains
  available; demo behavior requires explicit demo mode; disabled preferences remain disabled.
- **Language and access — PASS**: Only correctness copy changes. Arabic RTL and English LTR
  keys, accessible value labels, 200% text regressions, English numerals, and existing touch
  targets are retained and tested.
- **Design system — PASS**: Existing routes, components, semantic tokens, themes, and state
  patterns are reused. No layout, component, color, typography, motion, or navigation redesign.
- **Architecture and proof — PASS**: Existing typed contracts, repository operation ledger,
  SQLite migrations, permission adapter, and financial projection are reused. Focused tests
  precede Mobile typecheck, lint, boundaries, full Jest, diff review, and independent review.

## Project Structure

### Documentation (this feature)

```text
apps/mobile/specs/017-client-remediation-safe-phase1/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/mobile-financial-boundaries.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/mobile/
├── app/                              # existing routes only
├── src/
│   ├── domain/                       # transaction/category/planning rules
│   ├── storage/                      # repository and idempotent local migration
│   ├── services/contracts/           # finance/tracking capability contracts
│   ├── services/mocks/               # local finance/demo provider selection
│   ├── services/platform/            # production permission boundary
│   ├── features/transactions/        # existing form/link affordances
│   ├── features/obligations/         # contracted versus remaining presentation
│   ├── features/reports/             # signed account net-worth projection
│   ├── features/assistant/           # immutable evidence parity
│   ├── features/tracking/            # unavailable/disabled/demo states
│   ├── localization/                 # Arabic-English correctness
│   └── test-utils/                   # canonical financial scenario
└── specs/017-client-remediation-safe-phase1/

docs/CLIENT_REMEDIATION_PLAN.md         # statuses and evidence only
```

**Structure Decision**: Modify existing Mobile vertical slices and the shared projection at
their current boundaries. Do not create a subsystem, provider abstraction, route, package, or
dependency. Storage-file edits wait for the active SPEC-BE-006 commit; then local main is
integrated once and the next available migration number is selected.

## Implementation Strategy

### Phase A — Red tests at owned boundaries

Add failing tests for transfer category rejection, category financial meaning, legacy repair,
stable remittance seed, refund eligibility/bounds, retry-safe card payoff, signed card net worth,
obligation remaining labels, production tracking failure, and cross-surface parity. Reproduce
the obligation journey failure without extending timeouts or weakening accessibility queries.

### Phase B — Domain and repository corrections

Add only missing persisted meaning: `Category.financialType` and an optional transfer purpose.
Enforce shape in Zod and ledger-aware rules in `CoreFinanceRepository`. Reuse the current
operation result map/table for idempotency and `projectTransactionEffects` for balanced effects.
After SPEC-BE-006 integration, add the next idempotent SQLite repair and merge the stable
remittance category through non-demo reference initialization.

### Phase C — Presentation and availability corrections

Reuse `deriveObligationStatus` so overview/detail expose contracted, paid, and remaining values.
Keep account net worth as the signed sum of account balances; planning obligations remain a
separately labeled total and are not inferred from a funding account. Select a fail-closed
unavailable tracking service outside explicit demo mode and keep demo copy honest.

### Phase D — Proof and ledger

Run focused suites, typecheck, lint, boundary checks, and full Mobile Jest using a D-drive temp
path. Re-run affected tests after one-time main integration. Update only relevant remediation
entries, request independent review, verify the final diff, and commit without push or merge.

## Complexity Tracking

No constitution violation or additional architectural layer is required.
