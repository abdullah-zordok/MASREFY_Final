# Performance evidence

Both profiles ran against the clean local Supabase database and passed every k6 threshold plus the indexed-plan guard.

| Profile | Iterations |   Rate/s | Request p95/p99 | Worker p95/p99 | Read p95/p99 | Cancel p95 | Outage finance p95 | Max payload | Errors |
| ------- | ---------: | -------: | --------------: | -------------: | -----------: | ---------: | -----------------: | ----------: | -----: |
| normal  |      3,807 |   252.94 |          4/6 ms |      3/7.31 ms |       5/7 ms |       8 ms |               4 ms |     4,577 B |      0 |
| stress  |     45,508 | 1,010.25 |          4/6 ms |         4/5 ms |       5/7 ms |       9 ms |               3 ms |     4,577 B |      0 |

Commands: `npm run test:performance:ai` and `npm run test:stress:ai` with `DATABASE_URL` set to local Supabase. `ai-plans.txt` contained `ai_usage_events_owner_time_idx`, `ai_failure_events_workload_time_idx`, and `voice_sessions_expiry_idx`, with no unbounded usage/failure sequential scan. CI now invokes both gates.
