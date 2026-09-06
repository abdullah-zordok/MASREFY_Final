"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { useLocale } from "@/core/localization/provider";
import type { SystemStatus } from "@/types/admin";
import type {
  ApiMonitoring,
  DatabaseMonitoring,
  HealthStatus,
  MetricValue,
  OperationalRange,
  ProviderCategory,
  ProviderHealthSummary,
  QueueSnapshot,
  JobRunSummary,
  ScheduledJobSummary,
  StorageMonitoring,
} from "./contracts";
import { useApiMonitoring, useDatabaseMonitoring, useHealthOverview, useJobRuns, useProviderHealth, useQueueHealth, useScheduledJobs, useStorageMonitoring } from "./hooks";

const ranges: OperationalRange[] = ["1h", "24h", "7d", "30d"];
const providerCategories: Array<ProviderCategory | "all"> = ["all", "database", "storage", "identity", "ai", "email", "push"];

const healthCopy = {
  ar: {
    loading: "جاري تحميل صحة النظام...",
    error: "تعذر تحميل صحة النظام.",
    eyebrow: "المنصة / صحة النظام",
    title: "صحة النظام",
    description: "متابعة حالة الخدمات والمزودين ببيانات تشغيلية تجريبية وآمنة.",
  },
  en: {
    loading: "Loading System Health...",
    error: "Unable to load System Health.",
    eyebrow: "Platform / System Health",
    title: "System Health",
    description: "Monitor the status of services and providers using safe experimental operational data.",
  }
} as const;

function initialRange(): OperationalRange {
  if (typeof window === "undefined") return "24h";
  const value = new URLSearchParams(window.location.search).get("range");
  return ranges.includes(value as OperationalRange) ? value as OperationalRange : "24h";
}

function statusLabel(status: HealthStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function badgeStatus(status: HealthStatus): SystemStatus {
  if (status === "partial_outage") return "partial-outage";
  if (status === "major_outage") return "major-outage";
  if (status === "unknown") return "degraded";
  return status;
}

function labelText(value: string): string {
  if (value === "ai") return "AI";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function metricText(metric: MetricValue): string {
  return `${metric.value ?? "Unavailable"} ${metric.unit}`;
}

function LoadingView({ label }: { label: string }) {
  return <div className="page"><div className="state-box" role="status">Loading {label}...</div></div>;
}

function ErrorView({ label }: { label: string }) {
  return <div className="page"><div className="state-box error" role="alert">Unable to load {label}.</div></div>;
}

function MetricList({ metrics }: { metrics: MetricValue[] }) {
  return (
    <dl className="detail-grid">
      {metrics.map((item) => (
        <div className="detail-item" key={item.key}>
          <dt>{item.label}</dt>
          <dd>{metricText(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FreshnessCard({ state, partialReason }: { state: string; partialReason?: string | null }) {
  return (
    <article className="card">
      <div className="card-heading">
        <div>
          <h2>Freshness</h2>
          <p>{partialReason ?? "Telemetry is current for the selected range."}</p>
        </div>
        <span className="badge">Freshness: {state}</span>
      </div>
    </article>
  );
}

function ProviderCard({ provider }: { provider: ProviderHealthSummary }) {
  return (
    <article className="card" data-provider-health-card>
      <div className="card-heading">
        <div>
          <h2>{provider.name}</h2>
          <p>Fallback: {labelText(provider.fallbackState)} · Access: {labelText(provider.access)}</p>
        </div>
        <StatusBadge status={badgeStatus(provider.status)} />
      </div>
      <MetricList metrics={[provider.latency, provider.errorRate]} />
      <dl className="detail-grid">
        <div className="detail-item"><dt>Category</dt><dd>{labelText(provider.category)}</dd></div>
        <div className="detail-item"><dt>Last success</dt><dd>{provider.lastSuccessAt ?? "Unavailable"}</dd></div>
        <div className="detail-item"><dt>Last check</dt><dd>{provider.lastCheckedAt}</dd></div>
        <div className="detail-item"><dt>Platform impact</dt><dd>All platforms: {provider.platformImpact.total} requests</dd></div>
        <div className="detail-item"><dt>Safe error</dt><dd>{provider.safeError ?? "None"}</dd></div>
      </dl>
    </article>
  );
}

function QueueCard({ queue }: { queue: QueueSnapshot }) {
  return (
    <article className="card" data-queue-card>
      <div className="card-heading">
        <div>
          <h2>{queue.label}</h2>
          <p>Oldest waiting: {queue.oldestWaitingSeconds ?? 0} seconds</p>
        </div>
        <StatusBadge status={badgeStatus(queue.backlogState)} />
      </div>
      <MetricList metrics={[
        queue.counters.waiting,
        queue.counters.active,
        queue.counters.delayed,
        queue.counters.completed,
        queue.counters.failed,
        queue.counters.retried,
      ]} />
    </article>
  );
}

function JobRunRow({ run }: { run: JobRunSummary }) {
  return (
    <article className="card" data-job-run-card>
      <div className="card-heading">
        <div>
          <h2><a className="ltr" href={`/admin/jobs/runs/${run.id}`}>{run.id}</a></h2>
          <p>{run.name} · {labelText(run.queue)} · Correlation {run.correlationId}</p>
        </div>
        <span className="badge">{labelText(run.state)}</span>
      </div>
      <dl className="detail-grid">
        <div className="detail-item"><dt>Attempt</dt><dd>{run.attempt}</dd></div>
        <div className="detail-item"><dt>Version</dt><dd>{run.version}</dd></div>
        <div className="detail-item"><dt>Platform</dt><dd>{run.platform ?? "global"}</dd></div>
        <div className="detail-item"><dt>Summary</dt><dd>{run.summary}</dd></div>
      </dl>
    </article>
  );
}

function ScheduleCard({ schedule }: { schedule: ScheduledJobSummary }) {
  return (
    <article className="card" data-scheduled-job-card>
      <div className="card-heading">
        <div>
          <h2>{schedule.name}</h2>
          <p>Read-only · {schedule.schedule}</p>
        </div>
        <span className="badge">{schedule.enabled ? "Active" : "Paused"}</span>
      </div>
      <dl className="detail-grid">
        <div className="detail-item"><dt>Queue</dt><dd>{labelText(schedule.queue)}</dd></div>
        <div className="detail-item"><dt>Last state</dt><dd>{schedule.lastState ?? "No prior run"}</dd></div>
        <div className="detail-item"><dt>Last run</dt><dd>{schedule.lastRunAt ?? "No prior run"}</dd></div>
        <div className="detail-item"><dt>Next run</dt><dd>{schedule.nextRunAt ?? "No next run"}</dd></div>
      </dl>
    </article>
  );
}

export function HealthOverviewView() {
  const [range, setRange] = useState<OperationalRange>(initialRange);
  const overview = useHealthOverview({ range, platform: "all" });
  const { locale } = useLocale();
  const copy = healthCopy[locale];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("range", range);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [range]);

  if (overview.isPending) {
    return <div className="page"><div className="state-box" role="status">{copy.loading}</div></div>;
  }

  if (overview.isError) {
    return <div className="page"><div className="state-box error" role="alert">{copy.error}</div></div>;
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={(
          <button className="button" type="button" onClick={() => void overview.refetch()}>
            <RefreshCw size={16} />
            <span>Manual refresh</span>
          </button>
        )}
      />

      <div aria-label="Operational range" className="segmented-control" style={{ marginBottom: 24 }}>
        {ranges.map((option) => (
          <button
            aria-pressed={range === option}
            className={range === option ? "active" : ""}
            key={option}
            onClick={() => setRange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      <article className="card">
        <div className="card-heading">
          <div>
            <h2>System Health Overview</h2>
            <p>{overview.data.summary}</p>
          </div>
          <span className="badge">Freshness: {overview.data.freshness.state}</span>
        </div>
      </article>

      <section className="section-grid">
        {overview.data.services.map((service) => (
          <article className="card" data-service-health-card key={service.id}>
            <div className="card-heading">
              <div>
                <h2 className="ltr">{service.name}</h2>
                <p>{service.impactSummary}</p>
              </div>
              <StatusBadge status={badgeStatus(service.status)} />
            </div>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Status</dt>
                <dd>{statusLabel(service.status)}</dd>
              </div>
              <div className="detail-item">
                <dt>Uptime</dt>
                <dd>{service.uptime.value ?? "Unavailable"} {service.uptime.unit}</dd>
              </div>
              <div className="detail-item">
                <dt>Latency</dt>
                <dd>{service.latency.value ?? "Unavailable"} {service.latency.unit}</dd>
              </div>
              <div className="detail-item">
                <dt>Error rate</dt>
                <dd>{service.errorRate.value ?? "Unavailable"} {service.errorRate.unit}</dd>
              </div>
              <div className="detail-item">
                <dt>Freshness</dt>
                <dd>{service.freshness.state}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}

export function ApiMonitoringView() {
  const api = useApiMonitoring();
  if (api.isPending) return <LoadingView label="API Monitoring" />;
  if (api.isError) return <ErrorView label="API Monitoring" />;
  const data: ApiMonitoring = api.data;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Platform / System health"
        title="API Monitoring"
        description="Safe API volume, latency, endpoint groups, and status-code denominators."
      />
      <section className="section-grid">
        <article className="card">
          <h2>API summary</h2>
          <MetricList metrics={[data.requestVolume, data.errorRate, data.latency]} />
        </article>
        <FreshnessCard state={data.freshness.state} partialReason={data.partialReason} />
      </section>
      <section className="section-grid">
        {data.endpoints.map((endpoint) => (
          <article className="card" key={endpoint.routePattern}>
            <div className="card-heading">
              <div>
                <h2 className="ltr">{endpoint.routePattern}</h2>
                <p>Status group: {endpoint.statusCodeGroup ?? "mixed"}</p>
              </div>
            </div>
            <MetricList metrics={[endpoint.requestVolume, endpoint.errorRate, endpoint.p95Latency]} />
          </article>
        ))}
      </section>
      <article className="card">
        <h2>Status-code denominators</h2>
        <ul>
          {data.statusCodes.map((item) => <li key={item.group}>{item.group}: {item.count} count</li>)}
        </ul>
      </article>
    </div>
  );
}

export function DatabaseMonitoringView() {
  const database = useDatabaseMonitoring();
  if (database.isPending) return <LoadingView label="Database Monitoring" />;
  if (database.isError) return <ErrorView label="Database Monitoring" />;
  const data: DatabaseMonitoring = database.data;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Platform / System health"
        title="Database Monitoring"
        description="Safe database connection, query, storage, Backup, and recovery diagnostics."
      />
      <section className="section-grid">
        <article className="card">
          <h2>Database summary</h2>
          <MetricList metrics={[data.connectionUsage, data.queryLatency, data.storageUsage]} />
        </article>
        <article className="card">
          <h2>Backup and recovery</h2>
          <dl className="detail-grid">
            <div className="detail-item"><dt>Backup</dt><dd>{data.backupState}</dd></div>
            <div className="detail-item"><dt>Recovery</dt><dd>{data.recoveryState}</dd></div>
            <div className="detail-item"><dt>Freshness</dt><dd>{data.freshness.state}</dd></div>
          </dl>
        </article>
      </section>
      <section className="section-grid">
        {data.slowQueries.map((query) => (
          <article className="card" key={query.label}>
            <h2>{query.label}</h2>
            <p>Operation group: {query.operation}</p>
            <MetricList metrics={[query.count, query.p95Duration]} />
          </article>
        ))}
      </section>
    </div>
  );
}

export function StorageMonitoringView() {
  const storage = useStorageMonitoring();
  if (storage.isPending) return <LoadingView label="Storage Monitoring" />;
  if (storage.isError) return <ErrorView label="Storage Monitoring" />;
  const data: StorageMonitoring = storage.data;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Platform / System health"
        title="Storage Monitoring"
        description="Safe storage usage, upload, failure, temporary-file, and Cleanup diagnostics."
      />
      <section className="section-grid">
        <article className="card">
          <h2>Storage summary</h2>
          <MetricList metrics={[data.storageUsage, data.uploadCount, data.failedUploads, data.temporaryFiles]} />
        </article>
        <article className="card">
          <h2>Cleanup</h2>
          <dl className="detail-grid">
            <div className="detail-item"><dt>Cleanup</dt><dd>{data.cleanupState}</dd></div>
            <div className="detail-item"><dt>Freshness</dt><dd>{data.freshness.state}</dd></div>
          </dl>
        </article>
      </section>
    </div>
  );
}

export function ProviderHealthView() {
  const [category, setCategory] = useState<ProviderCategory | "all">("all");
  const providers = useProviderHealth({ category, status: "all", platform: "all" });
  if (providers.isPending) return <LoadingView label="Provider Health" />;
  if (providers.isError) return <ErrorView label="Provider Health" />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Platform / System health"
        title="Provider Health"
        description="Safe external provider status, fallback, latency, errors, freshness, and platform impact."
      />
      <div aria-label="Provider category" className="segmented-control" style={{ marginBottom: 24 }}>
        {providerCategories.map((option) => (
          <button
            aria-pressed={category === option}
            className={category === option ? "active" : ""}
            key={option}
            onClick={() => setCategory(option)}
            type="button"
          >
            {option === "all" ? "All providers" : labelText(option)}
          </button>
        ))}
      </div>
      <FreshnessCard state={providers.data.freshness.state} partialReason={providers.data.partialReason} />
      <section className="section-grid">
        {providers.data.items.map((provider) => <ProviderCard key={provider.id} provider={provider} />)}
      </section>
    </div>
  );
}

export function QueueOverviewView() {
  const queues = useQueueHealth();
  if (queues.isPending) return <LoadingView label="Queue Overview" />;
  if (queues.isError) return <ErrorView label="Queue Overview" />;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Jobs / Queues"
        title="Queue Overview"
        description="Safe queue depth, state counters, backlog age, throughput, and failure-rate snapshots."
      />
      <FreshnessCard state={queues.data.freshness.state} />
      <section className="section-grid">
        {queues.data.items.map((queue) => <QueueCard key={queue.queue} queue={queue} />)}
      </section>
    </div>
  );
}

export function JobRunsView() {
  const runs = useJobRuns();
  if (runs.isPending) return <LoadingView label="Job Runs" />;
  if (runs.isError) return <ErrorView label="Job Runs" />;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Jobs / Runs"
        title="Job Runs"
        description="Safe job run list with status, attempts, versions, platform, and correlation IDs."
      />
      <FreshnessCard state={runs.data.freshness.state} />
      <section className="section-grid">
        {runs.data.items.map((run) => <JobRunRow key={run.id} run={run} />)}
      </section>
    </div>
  );
}

export function ScheduledJobsView() {
  const schedules = useScheduledJobs();
  if (schedules.isPending) return <LoadingView label="Scheduled Jobs" />;
  if (schedules.isError) return <ErrorView label="Scheduled Jobs" />;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Jobs / Scheduled"
        title="Scheduled Jobs"
        description="Read-only scheduled job summaries with last run, next run, active state, and freshness."
      />
      <FreshnessCard state={schedules.data.freshness.state} />
      <section className="section-grid">
        {schedules.data.items.map((schedule) => <ScheduleCard key={schedule.id} schedule={schedule} />)}
      </section>
    </div>
  );
}
