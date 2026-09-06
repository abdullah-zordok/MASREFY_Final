# Operations triage

Use only the bounded Admin operations views and fixed metric labels. Never print environment variables, connection strings, request payloads, or provider responses.

<a id="job-failures"></a>
## Job failures

1. Open the governed run and attempt history and note the safe error code.
2. Confirm the job is retry-safe before requesting one retry.
3. Escalate repeated or dead-lettered failures to the owning Spec team.

<a id="job-backlog"></a>
## Job backlog

1. Open queue health and identify the fixed queue key, waiting count, and oldest age.
2. Check recent failures and provider state before retrying one declared retry-safe run.
3. If age continues rising, stop nonessential manual work and escalate to the owning Spec team.

<a id="provider-down"></a>
## Provider down

1. Identify the allowlisted provider and last safe status timestamp.
2. Confirm core finance remains available when the dependency is optional.
3. Use the provider's approved status console; never probe an operator-supplied URL.

<a id="recovery-stale"></a>
## Recovery evidence stale

1. Inspect the redacted backup verification timestamp and evidence reference.
2. Run the isolated local restore procedure in `operations-recovery.md`.
3. Treat hosted backup or PITR evidence as external until the platform owner supplies it.

<a id="critical-incident"></a>
## Critical incident

1. Acknowledge the incident and assign one operator through the governed incident action.
2. Correlate fixed service, queue, provider, and job summaries; do not copy raw payloads.
3. Follow `operations-incidents.md`, update the bounded public summary, and resolve only after recovery proof.

<a id="configuration-rejected"></a>
## Configuration rejected

1. Compare the requested key, expected version, and allowlisted value bounds.
2. Refresh the current version; do not bypass validation or repeat a mismatched idempotency key.
3. Follow `operations-configuration.md` for rollback or safe flag retirement.

<a id="maintenance-overdue"></a>
## Maintenance overdue

1. Confirm the UTC window, bounded scopes, and current lifecycle state.
2. If work is complete, transition active to completed; otherwise open an incident before extending service impact.
3. Confirm the safe Mobile projection clears after completion.
