# Voice runtime stabilization implementation plan

**Goal:** Keep live builds fail-closed while making the development profile bootable, then make Voice recording, processing, recovery, and confirmation safe and testable without fabricating provider success.

**Constraints:** Preserve user changes; no staging deployment, secrets, fake live providers, new dependencies, or database migration unless the existing server contract cannot express a safe failure.

## 1. Runtime and identity boundary

- [x] Add failing runtime/profile tests for development boot and production fail-closed behavior.
- [x] Set the existing EAS development profile to the repository's fixture-client convention; keep preview/production live.
- [x] Verify Clerk token refresh, expiry, logout, and account-switch tests; add only missing 401 recovery coverage.

## 2. Permission and recorder lifecycle

- [x] Add focused tests for denied/permanently-denied retry and cleanup on cancel/background/unmount.
- [x] Fix only lifecycle gaps proven by tests, reusing Expo Audio permission and recording APIs.

## 3. Live Voice transport

- [x] Add failing service tests for app locale independence, a 120-second-compatible deadline, status-specific errors, 401 expiry, and fail-closed malformed output.
- [x] Poll the authoritative session status at a non-aggressive interval and fetch the proposal only after `proposed`.
- [x] Map unsupported/provider/quota/timeout/auth outcomes explicitly; never infer support from a development scenario.

## 4. Safe provider contract

- [x] Add failing gateway/worker tests for `supported` single transactions and explicit `unsupported` transfer/multiple/obligation outcomes.
- [x] Extend the existing structured output union minimally and persist unsupported outcomes as typed failed work, without creating ledger data.

## 5. Owner-scoped recovery and confirmation

- [x] Add persistence/recovery tests for restart, cleanup, owner switch, and auth expiry.
- [x] Store only server session metadata and timestamps under an owner-derived AsyncStorage key.
- [x] Resume authoritative polling on mount; clear terminal/cancelled/confirmed records.
- [x] Preserve edited confirmation fields and deterministic idempotency; run existing ledger confirmation tests.

## 6. Verification

- [x] Run focused red/green tests after each boundary change.
- [x] Run Mobile Voice/auth/runtime/navigation suites, boundary checks, typecheck, lint, and full Jest.
- [x] Run API AI/Ledger unit, contract, integration where locally available, security/recovery, typecheck, and lint.
- [x] Run `git diff --check` and review only intentional paths with Clean Code/Test Guard.
- [x] Build and install the current Android development build, then verify startup, Voice reachability, permission grant/denial, recording start/stop, processing, and safe no-speech handling on SM-A165F. Real provider status remains a Staging gate.
