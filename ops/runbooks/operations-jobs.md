# Governed jobs

Use the Admin job inventory and run history. Job keys and handlers are fixed in code; operator input never selects executable code, a command, or a destination.

## Failure and retry

1. Open the run detail and record only its correlation ID, safe code, attempt count, and owning Spec.
2. Retry only when `retry` is listed in `allowedActions`. Supply the current version, a 10–500 character reason, and a fresh idempotency key.
3. Refresh the run. A successful request creates one linked queued run; a repeated identical request replays the prior result.
4. If attempts are exhausted or the run is dead-lettered, open an incident and route it to the owning Spec.

## Cancellation

1. Cancel only when `cancel` is listed in `allowedActions` and the run is queued or retrying; running work requires a future cooperative-abort protocol.
2. Supply the current version and a reason. Treat a conflict as evidence that the worker reached another authoritative state.
3. Refresh before taking another action; never force a terminal-state rewrite.

## Scheduler and recovery

The central worker claims bounded due rows with leases and `FOR UPDATE SKIP LOCKED`. On restart it recovers expired work and preserves one active run per schedule. Schedules are registered by code and are read-only to Admin in this release; changing job ownership or cadence requires a reviewed migration/code change.
