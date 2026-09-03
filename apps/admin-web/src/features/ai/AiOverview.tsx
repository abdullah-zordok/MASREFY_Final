"use client";

import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, Bot } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/admin/ui";
import { useLocale } from "@/core/localization/provider";
import { formatDate } from "@/lib/admin-utils";
import { aiCopy } from "./aiCopy";
import type { AiOverviewData, PlatformScope } from "./contracts";
import { useAiOverview } from "./hooks";

export function AiOverview({
  overview,
  onPeriodChange,
  onPlatformChange,
}: {
  overview: AiOverviewData;
  onPeriodChange?: (period: "7d" | "30d" | "90d") => void;
  onPlatformChange?: (platform: PlatformScope) => void;
}) {
  const { locale } = useLocale();
  const copy = aiCopy[locale];

  return (
    <div className="page">
      <PageHeader
        eyebrow={copy.page.eyebrow}
        title={copy.page.title}
        description={copy.page.description}
        actions={<Link className="button primary" href="/admin/ai/providers"><Bot size={16} />{copy.page.providers}</Link>}
      />
      <div className="privacy-notice">
        {copy.page.privacyNotice}
      </div>
      <div className="toolbar" aria-label="AI overview filters">
        <label>
          <span className="sr-only">{copy.filters.platform}</span>
          <select
            className="select"
            name="platform"
            value={overview.query.platform}
            onChange={(event) => onPlatformChange?.(event.target.value as PlatformScope)}
          >
            <option value="all">{copy.filters.allPlatforms}</option>
            <option value="ios">iOS</option>
            <option value="android">Android</option>
            <option value="unknown">{copy.filters.unknown}</option>
          </select>
        </label>
        <label>
          <span className="sr-only">{copy.filters.period}</span>
          <select
            className="select"
            name="period"
            value={overview.query.period}
            onChange={(event) => onPeriodChange?.(event.target.value as "7d" | "30d" | "90d")}
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
          </select>
        </label>
      </div>
      {overview.regions.metrics.availability === "empty" && (
        <div className="state-box" role="status">{copy.page.emptyState}</div>
      )}
      <div className="metrics-grid">
        {overview.metrics.slice(0, 6).map((metric) => (
          <article className="metric-card" key={metric.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <small style={{ fontSize: 16, color: "var(--text-secondary)", fontWeight: 500, margin: 0 }}>{copy.metrics.keys[metric.key as keyof typeof copy.metrics.keys] || metric.label}</small>
            <strong className="numbers" style={{ fontSize: 18, marginTop: 4, display: "block" }}>{metric.value.toLocaleString("en-US")}</strong>
            <div className="metric-meta" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, fontSize: 13, color: "var(--gray-500)" }}>
              <span>{copy.metrics.units[metric.unit as keyof typeof copy.metrics.units] || metric.unit} · {copy.metrics.denominator}: {copy.metrics.denominators[metric.denominator as keyof typeof copy.metrics.denominators] || metric.denominator}</span>
              <time className="ltr" dateTime={metric.freshness}>{copy.metrics.fresh} {formatDate(metric.freshness, true)}</time>
            </div>
          </article>
        ))}
      </div>
      <section className="section-grid equal" style={{ marginTop: 16 }}>
        <article className="card">
          <div className="card-heading">
            <div>
              <h2><BarChart3 size={18} /> {copy.charts.featuresTitle}</h2>
              <p>{copy.charts.featuresDescription}</p>
            </div>
          </div>
          <div className="progress-list">
            {overview.featureDistribution.map((point) => (
              <div className="progress-row" key={point.label}>
                <span>{copy.charts.labels[point.label as keyof typeof copy.charts.labels] || point.label}</span>
                <div className="progress-track"><span style={{width:`${Math.min(100, (point.value / Math.max(overview.totalOriginalRequests, 1)) * 100)}%`}}/></div>
                <strong className="numbers ltr">{point.value.toLocaleString("en-US")}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <div className="card-heading">
            <div>
              <h2><Activity size={18} /> {copy.charts.trendsTitle}</h2>
              <p>{copy.charts.trendsDescription}</p>
            </div>
          </div>
          <div className="progress-list">
            {overview.providerDistribution.map((point) => (
              <div className="progress-row" key={point.label}>
                <span>{copy.charts.labels[point.label as keyof typeof copy.charts.labels] || point.label}</span>
                <div className="progress-track"><span style={{background:"var(--bronze)", width:`${Math.min(100, (point.value / Math.max(overview.totalAttempts, 1)) * 100)}%`}}/></div>
                <strong className="numbers ltr">{point.value.toLocaleString("en-US")}</strong>
              </div>
            ))}
            {overview.platformDistribution.map((point) => (
              <div className="progress-row" key={point.label}>
                <span>{copy.charts.labels[point.label as keyof typeof copy.charts.labels] || point.label}</span>
                <div className="progress-track"><span style={{background:"var(--brand-primary)", width:`${Math.min(100, (point.value / Math.max(overview.totalOriginalRequests, 1)) * 100)}%`}}/></div>
                <strong className="numbers ltr">{point.value.toLocaleString("en-US")}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="summary-strip" style={{ marginTop: 16, gridTemplateColumns: `repeat(${3 + overview.costByCurrency.length}, 1fr)` }}>
        <div className="summary-item">
          <small>{copy.summary.originalRequests}</small>
          <strong className="numbers">{overview.totalOriginalRequests.toLocaleString("en-US")}</strong>
        </div>
        <div className="summary-item">
          <small>{copy.summary.attempts}</small>
          <strong className="numbers">{overview.totalAttempts.toLocaleString("en-US")}</strong>
        </div>
        <div className="summary-item">
          <small>{copy.summary.fallbackAttempts}</small>
          <strong className="numbers">{overview.fallbackAttempts.toLocaleString("en-US")}</strong>
        </div>
        {overview.costByCurrency.map((cost) => (
          <div className="summary-item" key={cost.currency}>
            <small>{copy.summary.estimatedCost} {cost.currency}</small>
            <strong className="numbers"><bdi className="ltr">{cost.amount} {cost.currency}</bdi></strong>
          </div>
        ))}
      </section>
      {overview.regions.charts.availability !== "available" && (
        <div className="state-box warning" role="status">
          <AlertTriangle size={18} /> {overview.regions.charts.message ?? copy.page.emptyCharts}
        </div>
      )}
      <div className="toolbar" style={{ marginTop: 16 }}>
        <Link className="button" href="/admin/ai/failures">{copy.page.openFailures}</Link>
        <Link className="button" href="/admin/ai/usage">{copy.page.openUsage}</Link>
      </div>
    </div>
  );
}

export function AiOverviewRoute() {
  const [platform, setPlatform] = useState<PlatformScope>("all");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const overview = useAiOverview({ platform, period });

  if (overview.isPending) return <div className="page"><div className="state-box" role="status">Loading AI overview...</div></div>;
  if (overview.isError) return <div className="page"><div className="state-box error" role="alert">Unable to load AI overview.</div></div>;
  return (
    <div>
      <AiOverview
        overview={overview.data}
        onPeriodChange={setPeriod}
        onPlatformChange={setPlatform}
      />
      <div className="sr-only" aria-live="polite">المنصة {platform}، الفترة {period}</div>
    </div>
  );
}
