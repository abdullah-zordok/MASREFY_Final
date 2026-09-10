import type {
  Freshness,
  CancelJobResult,
  JobActionRequest,
  JobRunDetail,
  JobRunSummary,
  JobRunsQuery,
  JobState,
  MetricValue,
  OperationalRange,
  QueueHealthPage,
  QueueHealthQuery,
  QueueKey,
  QueueSnapshot,
  RetryJobResult,
  ScheduledJobsPage,
  ScheduledJobsQuery,
  ScheduledJobSummary,
} from "@/features/system-health/contracts";

const observedAt = "2026-08-01T11:58:00+03:00";
const staleAt = "2026-08-01T12:03:00+03:00";

const labels: Record<QueueKey, string> = {
  imports: "Imports",
  ai: "AI",
  security: "Security",
  platform: "Platform",
  identity: "Identity",
  ledger: "Ledger",
  sync: "Sync",
  planning: "Planning",
  tracking: "Tracking",
  operations: "Operations",
  ai_processing: "AI Processing",
  notifications: "Notifications",
  reports: "Reports",
  data_exports: "Data Exports",
  account_deletion: "Account Deletion",
  subscription_reconciliation: "Subscription Reconciliation",
};

const queueKeys: QueueKey[] = ["imports", "ai_processing", "notifications", "reports", "data_exports", "account_deletion", "subscription_reconciliation"];

function freshness(state: Freshness["state"] = "fresh"): Freshness {
  return state === "unknown"
    ? { observedAt: null, staleAt: null, state, sourceLabel: "Phase 8 fixed mock state" }
    : { observedAt, staleAt, state, sourceLabel: "Phase 8 fixed mock state" };
}

function metric(key: string, label: string, value: number | null, semantic: MetricValue["semantic"], unit: MetricValue["unit"] = "count"): MetricValue {
  return { key, label, value, unit, semantic, completeness: "complete", freshness: freshness() };
}

const initialRuns: JobRunSummary[] = [
  {
    id: "JOB-DEMO-FAILED-01",
    name: "Import classification",
    queue: "imports",
    state: "failed",
    attempt: 1,
    startedAt: "2026-08-01T11:40:00+03:00",
    completedAt: "2026-08-01T11:41:00+03:00",
    durationMs: 60000,
    safeErrorCode: "import_timeout",
    summary: "Safe timeout while processing import batch.",
    correlationId: "COR-DEMO-IMPORT-01",
    platform: "ios",
    appVersion: "2.8.0",
    version: 1,
    retryOfJobRunId: null,
    access: "full",
  },
  {
    id: "JOB-DEMO-WAITING-01",
    name: "AI receipt extraction",
    queue: "ai_processing",
    state: "waiting",
    attempt: 1,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    safeErrorCode: null,
    summary: "Waiting for worker capacity.",
    correlationId: "COR-DEMO-AI-01",
    platform: "android",
    appVersion: "2.8.0",
    version: 1,
    retryOfJobRunId: null,
    access: "full",
  },
  {
    id: "JOB-DEMO-DELAYED-01",
    name: "Notification delivery",
    queue: "notifications",
    state: "delayed",
    attempt: 1,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    safeErrorCode: null,
    summary: "Delayed by rate-limit window.",
    correlationId: "COR-DEMO-NOTIFY-01",
    platform: "ios",
    appVersion: "2.7.9",
    version: 1,
    retryOfJobRunId: null,
    access: "full",
  },
  ...(["reports", "data_exports", "account_deletion", "subscription_reconciliation"] as QueueKey[]).map((queue, index) => ({
    id: `JOB-DEMO-COMPLETED-0${index + 1}`,
    name: labels[queue],
    queue,
    state: "completed" as JobState,
    attempt: 1,
    startedAt: "2026-08-01T11:20:00+03:00",
    completedAt: "2026-08-01T11:21:00+03:00",
    durationMs: 60000,
    safeErrorCode: null,
    summary: "Completed safely.",
    correlationId: `COR-DEMO-${index + 1}`,
    platform: null,
    appVersion: null,
    version: 1,
    retryOfJobRunId: null,
    access: "full" as const,
  })),
];

const schedules: ScheduledJobSummary[] = queueKeys.map((queue) => ({
  id: `SCH-${queue.toUpperCase().replaceAll("_", "-")}-DAILY`,
  name: queue === "imports" ? "Daily imports maintenance" : `${labels[queue]} schedule`,
  queue,
  schedule: "Every day at 02:00 Asia/Riyadh",
  lastRun: { id: "JOB-DEMO-COMPLETED-01", kind: "job", label: "Last safe run" },
  lastRunAt: "2026-08-01T02:00:00+03:00",
  nextRunAt: queue === "account_deletion" ? null : "2026-08-02T02:00:00+03:00",
  lastState: queue === "ai_processing" ? "failed" : "completed",
  enabled: queue !== "account_deletion",
  freshness: freshness(),
  access: "full",
}));

let runs = initialRuns.map((run) => ({ ...run }));

export function resetPhase8SystemHealthState() {
  runs = initialRuns.map((run) => ({ ...run }));
}

function queueSnapshot(queue: QueueKey): QueueSnapshot {
  const scoped = runs.filter((run) => run.queue === queue);
  const count = (state: JobState) => scoped.filter((run) => run.state === state).length;
  return {
    queue,
    label: labels[queue],
    counters: {
      waiting: metric("waiting", "Waiting", count("waiting"), "snapshot"),
      active: metric("active", "Active", count("active"), "snapshot"),
      delayed: metric("delayed", "Delayed", count("delayed"), "snapshot"),
      completed: metric("completed", "Completed", count("completed"), "selected_range"),
      failed: metric("failed", "Failed", count("failed"), "selected_range"),
      retried: metric("retried", "Retried", scoped.filter((run) => run.retryOfJobRunId).length, "selected_range"),
    },
    oldestWaitingSeconds: count("waiting") ? 180 : null,
    throughput: metric("throughput", "Throughput", Math.max(1, count("completed")), "selected_range"),
    failureRate: metric("failure_rate", "Failure rate", count("failed") ? 1.2 : 0, "selected_range", "percent"),
    lastProcessedAt: observedAt,
    freshness: freshness(),
    backlogState: count("failed") || count("delayed") ? "degraded" : "operational",
    platformImpact: { total: scoped.length, ios: scoped.filter((run) => run.platform === "ios").length, android: scoped.filter((run) => run.platform === "android").length, unknown: scoped.filter((run) => run.platform === "unknown" || run.platform === null).length, semantic: "jobs", completeness: "complete" },
    access: "full",
  };
}

export function listPhase8QueueHealth(query: QueueHealthQuery = {}): QueueHealthPage {
  return {
    items: queueKeys.map(queueSnapshot),
    range: query.range ?? "24h" as OperationalRange,
    platform: query.platform ?? "all",
    freshness: freshness(),
    partial: false,
  };
}

export function listPhase8JobRuns(query: JobRunsQuery = {}) {
  const queue = query.queue ?? "all";
  const state = query.state ?? "all";
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25) as 25 | 50 | 100;
  const search = query.search?.toLowerCase();
  const filtered = runs
    .filter((run) => queue === "all" || run.queue === queue)
    .filter((run) => state === "all" || run.state === state)
    .filter((run) => !search || run.id.toLowerCase().includes(search) || run.correlationId.toLowerCase().includes(search));
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    freshness: freshness(),
    partial: false,
  };
}

export function getPhase8JobRun(jobRunId: string): JobRunDetail | null {
  const run = runs.find((item) => item.id === jobRunId);
  if (!run) return null;
  return {
    run,
    metadata: [
      { key: "batch_type", label: "Batch type", value: run.queue },
      { key: "attempt", label: "Attempt", value: run.attempt },
    ],
    timeline: [
      { event: "queued", at: "2026-08-01T11:39:00+03:00", summary: "Queued safely." },
      ...(run.startedAt ? [{ event: "started" as const, at: run.startedAt, summary: "Started safely." }] : []),
      ...(run.completedAt ? [{ event: run.state === "failed" ? "failed" as const : "completed" as const, at: run.completedAt, summary: run.summary }] : []),
    ],
    references: [{ id: "INC-DEMO-WORKERS", kind: "incident", label: "Worker backlog incident" }],
    allowedActions: run.state === "failed" ? ["retry"] : run.state === "waiting" || run.state === "delayed" ? ["cancel"] : [],
  };
}

export function listPhase8ScheduledJobs(query: ScheduledJobsQuery = {}): ScheduledJobsPage {
  const queue = query.queue ?? "all";
  const search = query.search?.toLowerCase();
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25) as 25 | 50 | 100;
  const filtered = schedules
    .filter((schedule) => queue === "all" || schedule.queue === queue)
    .filter((schedule) => !search || schedule.name.toLowerCase().includes(search) || schedule.id.toLowerCase().includes(search));
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: filtered.length,
    freshness: freshness(),
    partial: false,
  };
}

export function retryPhase8JobRun(jobRunId: string, request: JobActionRequest): RetryJobResult {
  const source = runs.find((run) => run.id === jobRunId);
  if (!source || source.state !== "failed" || source.version !== request.expectedVersion) throw new Error("ineligible_transition");
  const retryRun: JobRunSummary = {
    ...source,
    id: "JOB-DEMO-RETRY-01",
    state: "waiting",
    attempt: source.attempt + 1,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    safeErrorCode: null,
    summary: "Retry waiting after safe operator request.",
    version: 1,
    retryOfJobRunId: source.id,
  };
  runs = [retryRun, ...runs];
  const retry = getPhase8JobRun(retryRun.id);
  if (!retry) throw new Error("retry_not_created");
  return {
    source,
    retry,
    queue: queueSnapshot(source.queue),
    outcome: {
      status: "accepted",
      message: "Retry requested",
      audit: { id: "AUD-DEMO-RETRY-01", kind: "audit", label: "job.retry_requested" },
    },
  };
}

export function cancelPhase8JobRun(jobRunId: string, request: JobActionRequest): CancelJobResult {
  const run = runs.find((item) => item.id === jobRunId);
  if (!run || (run.state !== "waiting" && run.state !== "delayed") || run.version !== request.expectedVersion) throw new Error("ineligible_transition");
  run.state = "cancelled";
  run.version += 1;
  run.completedAt = observedAt;
  run.summary = "Cancelled after safe operator request.";
  return {
    cancelled: run,
    queue: queueSnapshot(run.queue),
    outcome: {
      status: "accepted",
      message: "Cancel requested",
      audit: { id: "AUD-DEMO-CANCEL-01", kind: "audit", label: "job.cancel_requested" },
    },
  };
}
