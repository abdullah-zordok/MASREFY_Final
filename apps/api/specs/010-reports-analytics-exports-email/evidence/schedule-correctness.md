# Schedule Correctness Evidence

Date: 2026-09-04
Scope: SPEC-BE-010 US3

Hand-derived literal fixtures:

| Case | Expected UTC instant | Result |
|---|---|---|
| Riyadh next month, 08:00 local | `2026-10-01T05:00:00.000Z` | PASS |
| New York spring gap, requested 02:30 | `2026-03-08T07:00:00.000Z` | PASS; first valid minute |
| New York fall fold, requested 01:30 | `2026-11-01T05:30:00.000Z` | PASS; earlier instant |
| Jan 31 monthly advance | `2026-02-28T21:00:00.000Z` | PASS; calendar clamp |

Unit, HTTP, integration, and concurrency coverage verifies invalid zones, monotonic
advancement, disabled schedules, owner isolation, compare-and-set versioning,
bounded due reads with `FOR UPDATE SKIP LOCKED`, advisory execution fencing, and
one immutable attempt for two concurrent enqueue calls.
