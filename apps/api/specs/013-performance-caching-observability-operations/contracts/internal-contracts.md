# Internal Contracts: SPEC-BE-013

## Limits

| Contract | Limit |
|---|---|
| Page sizes | 25, 50, 100; default 25 |
| Time ranges | 1h, 24h, 7d, 30d |
| Series points | maximum 720 |
| Job claim batch | 1..100 |
| History retention batch | 1..1,000 |
| Provider probe timeout | 100..10,000 ms |
| Job timeout | 1..600 seconds |
| Attempts | 1..10 |
| Schedule interval | 10..2,678,400 seconds, UTC |
| Safe summary/metadata | flat object, <=20 keys, <=2 KiB |
| Setting value | <=4 KiB, <=20 keys, <=2 nesting levels |
| Feature audience | <=1 KiB, allowlisted scalar/array keys |
| Reason | 10..500 safe characters |
| Public message | Arabic and English, 1..240 safe characters each |

## Application Contracts

### `OperationsRepository`

The repository is the only application component that executes Phase 13 database functions or bounded operational reads.

```text
registerJobs(definitions) -> registration outcomes
claimDueJobs(workerId, limit, now) -> claimed executions
completeAttempt(command) -> final/retry/dead-letter outcome
requestJobAction(principal, command) -> action outcome
readHealth(query) -> safe health projection
readProviders(query) -> provider page
readQueues(query) -> queue/worker summary
readJobs(query) -> scheduled job page
readRuns(query) -> run page
readRun(runId) -> run plus attempts and allowed actions
readIncidents(query) -> incident page
mutateIncident(principal, command) -> incident
readSetting(key) -> safe setting projection
updateSetting(principal, command) -> safe setting projection
readFlags(query) -> flag page
mutateFlag(principal, command) -> safe flag projection
previewFlag(context) -> resolved outcome
readMaintenance(query) -> maintenance page
mutateMaintenance(principal, command) -> maintenance projection
readPerformance(query) -> bounded budget/series projection
readRecovery() -> redacted evidence metadata
readSafeClientConfig(serverContext) -> safe client projection
```

Every method uses parameterized queries. No method interpolates identifiers, SQL, sort expressions, or predicates from request text; request enums map to fixed query fragments.

### `OperationalJobDefinition`

```text
key: stable allowlisted job key
ownerSpec: 1..11 | 13
type: stable handler type
schedule: null | { kind: interval, everySeconds: 10..2678400, timezone: UTC }
timeoutSeconds: 1..600
maxAttempts: 1..10
configuration: flat safe allowlisted values
retrySafe: boolean
cancelSafe: boolean
execute(context): Promise<SafeJobResult>
```

The handler registry is constructed from code-owned definitions. Database rows cannot name a module, class, function, URL, SQL statement, command, or payload.

### `SafeJobResult`

```text
outcome: succeeded | failed
code?: approved uppercase safe code
summary?: flat allowlisted scalar metadata
retryable: boolean
```

Thrown exceptions are converted to a fixed safe code before persistence or logging. Stack traces and messages are never result summaries.

### `ProviderProbe`

```text
key: database | storage | identity | ai | email | push
enabled(config): boolean
check(signal): Promise<{ status, latencyMs, safeErrorCode? }>
```

Probes receive an internally created timeout signal. They accept no request input and may call only fixed existing client operations. Disabled optional providers are omitted from configured-provider lists; missing evidence may be represented as `unknown` without an error value.

### `SafeProjectionCache<T>`

One process-local entry per safe projection kind. Contract:

- maximum TTL 30 seconds;
- version tuple included with the entry;
- `get(version, now)` returns only an exact-version unexpired match;
- `set` rejects a TTL outside 0..30 seconds;
- `invalidate(kind|all)` is idempotent;
- cache accepts only values that passed the response schema;
- cache keys never include user, session, request, resource, run, or financial identifiers.

### `FeatureContext`

```text
platform?: ios | android | admin
appVersion?: normalized semantic version, max 32
locale?: ar | en
cohort?: allowlisted server-derived key, max 40
```

Unknown keys or nested values make the context invalid. The real client request supplies platform/version/locale headers, but the server normalizes and derives the evaluation context. Admin preview accepts the same schema as explicitly synthetic data and never treats it as authorization.

## Database Function Result Contracts

### Registration result

```text
id uuid
job_key text
owner_spec smallint
version bigint
outcome created | unchanged | updated
```

### Claim result

```text
run_id uuid
attempt_id uuid
attempt_no smallint
job_key text
owner_spec smallint
job_type text
timeout_seconds integer
configuration jsonb
correlation_id text
```

Only worker-owned registration configuration is returned. It is validated and cannot contain secrets or business payloads.

### Attempt completion result

```text
run_status succeeded | failed | retrying | dead_lettered
attempt_status succeeded | failed
next_attempt_at timestamptz | null
version bigint
```

### Feature result

```text
key text
enabled boolean
version bigint
source rule | default | missing | retired | invalid_context
```

Missing and invalid inputs return `enabled=false`, `version=0`, and a safe source. The function does not reveal rules.

## Validation Contracts

### Secret-like content

Normalized object keys containing any of the following are rejected from settings, flags, configuration, result summaries, and public messages:

`secret`, `token`, `password`, `credential`, `authorization`, `cookie`, `private_key`, `api_key`, `connection_string`, `dsn`, `url`, `sql`, `command`, `payload`, `stack`.

Values are also rejected when they match bearer credentials, connection strings with credentials, common provider-secret prefixes, email addresses, phone numbers, or private-key headers.

### Safe error codes

Error codes match `^[A-Z][A-Z0-9_]{2,79}$` and are selected from code-owned mappings. Unknown exceptions become `OPERATIONS_INTERNAL_ERROR` or a job-specific generic code.

### Version and idempotency

- Every Admin mutation requires `expectedVersion >= 1` for existing rows.
- Creates require an `Idempotency-Key`/submission key and reason.
- Existing platform idempotency storage scopes keys by actor, operation, and request hash.
- Replay returns the original safe result; a mismatched body returns the existing stable conflict code.

## Authorization Contracts

| Capability | Read permission | Mutation permission |
|---|---|---|
| Health | `operations.health.read` | none |
| Providers | `operations.providers.read` | none; refresh is scheduled internally |
| Jobs | `operations.jobs.read` | `operations.jobs.manage` |
| Incidents | `operations.incidents.read` | `operations.incidents.manage` |
| Settings | `operations.settings.read` | `operations.settings.manage` |
| Feature flags | `operations.flags.read` | `operations.flags.manage` |
| Maintenance | `operations.maintenance.read` | `operations.maintenance.manage` |
| Performance | `operations.performance.read` | none |
| Recovery | `operations.recovery.read` | none; drills are jobs |

All mutation permissions require recent MFA. Reads of restricted recovery/setting metadata return redacted projections even when authorized.

## Query Contracts

- Sorting uses fixed allowlisted fields and a deterministic ID tie-breaker.
- Cursor values are opaque signed/bounded tuples or the existing approved page/page-size contract; no arbitrary offset above 10,000.
- Time series are bucketed to at most 720 points before response construction.
- Health/provider latest-state reads use `DISTINCT ON`/window plans backed by key/time indexes.
- Run detail loads attempts in one bounded query; list endpoints do not issue per-row queries.
- Performance views aggregate existing metrics/evidence and never execute caller-provided query text.

## Failure Contracts

Stable API error codes:

- `AUTH_TOKEN_INVALID`, `ADMIN_PERMISSION_DENIED`, `RECENT_AUTH_REQUIRED`;
- `OPERATIONS_VALIDATION_INVALID`, `OPERATIONS_NOT_FOUND`;
- `OPERATIONS_VERSION_CONFLICT`, `OPERATIONS_IDEMPOTENCY_CONFLICT`;
- `JOB_OWNER_CONFLICT`, `JOB_ACTION_UNSAFE`, `JOB_STATE_CONFLICT`;
- `SETTING_RESTRICTED`, `SETTING_SCHEMA_INVALID`, `SETTING_SECRET_REJECTED`;
- `FEATURE_FLAG_DENIED`, `FEATURE_CONTEXT_INVALID`, `FEATURE_STATE_CONFLICT`;
- `INCIDENT_STATE_CONFLICT`, `MAINTENANCE_STATE_CONFLICT`;
- `OPERATIONS_DEPENDENCY_UNAVAILABLE`, `OPERATIONS_INTERNAL_ERROR`.

Responses never include database error text, exception messages, provider payloads, or stack traces.

## Free-only Invariant

The application and database both reject normalized job/provider/metric/flag/setting/scope keys containing `stripe`, `billing`, `payment`, `subscription`, `entitlement`, `checkout`, `promotion`, or `plan-upgrade`. Safe client configuration hard-codes billing capability false independently of flag/settings data.
