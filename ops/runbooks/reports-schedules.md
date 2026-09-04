# Report schedules

## Schedule lag

Check worker health, due-row count, advisory-lock contention, and database latency. Workers recover the oldest due occurrence first and advance one calendar period per claim, preserving timezone/DST semantics and idempotent `(schedule, period)` output uniqueness.

Pause a schedule through its optimistic-version API; do not edit due timestamps directly.
