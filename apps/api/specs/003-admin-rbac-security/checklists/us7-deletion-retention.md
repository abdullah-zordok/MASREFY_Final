# US7 — Deletion and retention evidence

- [x] Owner request/cancel and Admin action contracts require recent auth, explicit confirmation/reason, idempotency, and expected version where applicable.
- [x] The worker waits for cooling-off and rechecks active holds immediately before every irreversible handler call.
- [x] Every manifest owner is reconciled; unknown retention owners fail closed; identity deletion is repeat-safe and revokes active sessions/profile state.
- [x] Retention candidates and jobs are bounded; legal policy is never invented and no generic SQL/cascade deletion exists.
- [x] pgTAP 013, unit/contract/integration/security, canonical deletion/hold E2E, and recovery runbook pass.

Coverage: FR-032–FR-038, AC-011–AC-014, SC-007.
