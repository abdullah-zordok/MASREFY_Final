# Incidents and maintenance

## Incident lifecycle

- Create an `open` incident with a bounded title, `info|warning|critical` severity, UTC start time, safe public summary, and reason.
- Acknowledge with `open -> investigating`. Investigation may move to `monitoring` or directly to `resolved`; monitoring may move to resolved.
- `resolved` is terminal. Resolution records its server timestamp. Stale versions return a conflict and missing IDs return not found.
- Never place customer identifiers, request bodies, provider responses, credentials, URLs, or email addresses in an incident field.

## Maintenance lifecycle

- Create a future UTC window of at most 24 hours with 1–10 allowlisted scopes and Arabic/English public messages.
- Valid transitions are `scheduled -> active|canceled` and `active -> completed`; completed and canceled are terminal.
- Overlapping scheduled/active windows for the same scope are rejected. Refresh after a version conflict instead of forcing an update.
- Verify the Mobile safe-meta response shows only active scopes and the bounded public message, then clears after completion.
