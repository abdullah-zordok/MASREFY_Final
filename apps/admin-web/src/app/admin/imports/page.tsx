"use client";

import { FileSearch, FilterX, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ChartCard, TrendChart, VolumeChart } from "@/components/admin/Charts";
import {
  ConfirmDialog,
  Drawer,
  MetricCard,
  PageHeader,
  SeverityBadge,
} from "@/components/admin/ui";
import { useSimulatedRole } from "@/core/auth/use-simulated-role";
import { useLocale } from "@/core/localization/provider";
import { hasPermission } from "@/core/permissions/role-map";
import { ImportOverviewAnalytics } from "@/features/imports/ImportsViews";
import { useImports, useRetryImport } from "@/features/imports/hooks";
import { importsCopy } from "@/features/imports/importsCopy";
import { formatDate } from "@/lib/admin-utils";
import type { ImportRecord } from "@/types/admin";

export default function ImportsPage() {
  const role = useSimulatedRole();
  const { locale } = useLocale();
  const copy = importsCopy[locale];
  const canRetry = hasPermission(role, "imports.failures.manage");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [active, setActive] = useState<ImportRecord | null>(null);
  const [retry, setRetry] = useState<ImportRecord | null>(null);
  const [message, setMessage] = useState("");
  const imports = useImports({
    query,
    source: source || undefined,
    page: 1,
    pageSize: 25,
  });
  const retryImport = useRetryImport();
  const importItems = imports.data?.items;
  const sources = useMemo(
    () => [...new Set((importItems ?? []).map((item) => item.source))],
    [importItems],
  );
  if (imports.isPending)
    return (
      <div className="page">
        <div className="state-box" role="status">
          جاري تحميل بيانات الاستيراد…
        </div>
      </div>
    );
  if (imports.isError)
    return (
      <div className="page">
        <div className="state-box error" role="alert">
          تعذر تحميل بيانات الاستيراد.
        </div>
      </div>
    );
  const {
    failureTrend,
    items: filtered,
    metrics: importMetrics,
    processingTimes,
    sourceSuccess,
    sourceVolume: importSourceVolume,
  } = imports.data;

  const localizedMetrics = importMetrics.map((m) => ({
    ...m,
    label: copy.metrics[m.label as keyof typeof copy.metrics] || m.label,
  }));
  const localizedVolume = importSourceVolume.map((v) => ({
    ...v,
    name: copy.sources[v.name as keyof typeof copy.sources] || v.name,
  }));
  const localizedTrend = failureTrend.map((t) => ({
    ...t,
    name: copy.dates[t.name as keyof typeof copy.dates] || t.name,
  }));
  const localizedSuccess = sourceSuccess.map((s) => ({
    ...s,
    label: copy.sources[s.label as keyof typeof copy.sources] || s.label,
  }));
  const localizedProcessing = processingTimes.map((p) => ({
    ...p,
    label: copy.sources[p.label as keyof typeof copy.sources] || p.label,
    value: `${p.value} ${locale === "ar" ? "ث" : "s"}`,
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow={copy.page.eyebrow}
        title={copy.page.title}
        description={copy.page.description}
        actions={
          <button
            className="button primary"
            onClick={() =>
              document
                .getElementById("failed-imports")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <FileSearch size={16} />
            <span>{copy.page.reviewFailures}</span>
          </button>
        }
      />
      <ImportOverviewAnalytics />
      {message && (
        <div
          className="privacy-notice"
          role="status"
          style={{ marginBottom: 14 }}
        >
          <RefreshCw size={17} />
          {message}
        </div>
      )}
      <div className="metrics-grid">
        {localizedMetrics.slice(0, 4).map((metric, index) => (
          <MetricCard metric={metric} primary={index < 2} key={metric.label} />
        ))}
      </div>
      <div
        className="summary-strip"
        style={{
          marginTop: 16,
          gridTemplateColumns: `repeat(${localizedMetrics.slice(4).length}, 1fr)`,
        }}
      >
        {localizedMetrics.slice(4).map((metric) => (
          <div className="summary-item" key={metric.label}>
            <small>{metric.label}</small>
            <strong className="numbers">{metric.value}</strong>
          </div>
        ))}
      </div>
      <section className="section-grid equal">
        <ChartCard
          title={copy.charts.volumeTitle}
          subtitle={copy.charts.volumeSubtitle}
          summary={copy.charts.volumeSummary}
        >
          <VolumeChart data={localizedVolume} stacked />
        </ChartCard>
        <ChartCard
          title={copy.charts.trendTitle}
          subtitle={copy.charts.trendSubtitle}
          summary={copy.charts.trendSummary}
        >
          <TrendChart data={localizedTrend} />
        </ChartCard>
      </section>
      <section className="section-grid equal">
        <article className="card">
          <div className="card-heading">
            <div>
              <h2>{copy.charts.successRateTitle}</h2>
              <p>{copy.charts.successRateSubtitle}</p>
            </div>
          </div>
          <div className="progress-list">
            {localizedSuccess.map(({ label, value }) => (
              <div className="progress-row" key={label}>
                <span>{label}</span>
                <div className="progress-track">
                  <span style={{ width: `${value}%` }} />
                </div>
                <strong className="numbers ltr">{value}%</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <div className="card-heading">
            <div>
              <h2>{copy.charts.processingTimeTitle}</h2>
              <p>{copy.charts.processingTimeSubtitle}</p>
            </div>
          </div>
          <div className="progress-list">
            {localizedProcessing.map(({ label, value, width }) => (
              <div className="progress-row" key={label}>
                <span>{label}</span>
                <div className="progress-track">
                  <span
                    style={{ width: `${width}%`, background: "var(--bronze)" }}
                  />
                </div>
                <strong className="numbers">{value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section
        id="failed-imports"
        style={{ scrollMarginTop: 90, marginTop: 16 }}
      >
        <div className="card-heading">
          <div>
            <h2>{copy.failedImports.title}</h2>
            <p>{copy.failedImports.description}</p>
          </div>
        </div>
        <div className="toolbar">
          <div className="toolbar-filters">
            <label className="search-input">
              <Search size={17} />
              <span className="sr-only">{copy.failedImports.searchAria}</span>
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.failedImports.searchPlaceholder}
              />
            </label>
            <select
              className="select"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              aria-label={copy.failedImports.columns.source}
            >
              <option value="">{copy.failedImports.allSources}</option>
              {sources.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {(query || source) && (
              <button
                className="button ghost"
                onClick={() => {
                  setQuery("");
                  setSource("");
                }}
              >
                <FilterX size={16} /> {copy.failedImports.clearFilter}
              </button>
            )}
          </div>
        </div>
        <div className="table-card">
          <div className="desktop-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{copy.failedImports.columns.id}</th>
                  <th>{copy.failedImports.columns.user}</th>
                  <th>{copy.failedImports.columns.source}</th>
                  <th>{copy.failedImports.columns.bank}</th>
                  <th>{copy.failedImports.columns.failureReason}</th>
                  <th>{copy.failedImports.columns.parser}</th>
                  <th>{copy.failedImports.columns.attempts}</th>
                  <th>{copy.failedImports.columns.severity}</th>
                  <th>{copy.failedImports.columns.time}</th>
                  <th>{copy.failedImports.columns.action}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="table-link ltr"
                        onClick={() => setActive(item)}
                      >
                        {item.id}
                      </button>
                    </td>
                    <td className="ltr">{item.user}</td>
                    <td>{item.source}</td>
                    <td>{item.bank}</td>
                    <td>{item.failureType}</td>
                    <td className="ltr">{item.parserVersion}</td>
                    <td>{item.attempts}</td>
                    <td>
                      <SeverityBadge severity={item.severity} />
                    </td>
                    <td>{formatDate(item.time, true)}</td>
                    <td>
                      <button
                        className="button"
                        disabled={!canRetry}
                        onClick={() => setRetry(item)}
                      >
                        {copy.failedImports.retry}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards" style={{ padding: 10 }}>
            {filtered.map((item) => (
              <article className="mobile-data-card" key={item.id}>
                <div className="mobile-data-head">
                  <div>
                    <strong className="ltr">{item.id}</strong>
                    <small>{item.source}</small>
                  </div>
                  <SeverityBadge severity={item.severity} />
                </div>
                <div className="mobile-data-meta">
                  <div>
                    <small>{copy.failedImports.failureLabel}</small>
                    <strong>{item.failureType}</strong>
                  </div>
                  <div>
                    <small>{copy.failedImports.parserLabel}</small>
                    <strong className="ltr">{item.parserVersion}</strong>
                  </div>
                </div>
                <div className="mobile-data-actions">
                  <button className="button" onClick={() => setActive(item)}>
                    {copy.failedImports.details}
                  </button>
                  <button
                    className="button primary"
                    disabled={!canRetry}
                    onClick={() => setRetry(item)}
                  >
                    {copy.failedImports.retry}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Drawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={`تفاصيل ${active?.id ?? ""}`}
        eyebrow="بيانات معالجة منقحة"
      >
        {active && (
          <>
            <div className="privacy-notice">
              لا يظهر المحتوى الخام أو أرقام الحسابات أو بيانات الكشوف.
            </div>
            <div className="detail-grid">
              {[
                ["المصدر", active.source],
                ["المنصة", active.platform],
                ["البنك", active.bank],
                ["إصدار التطبيق", active.appVersion],
                ["المحلل", active.parserVersion],
                ["سبب الفشل", active.failureType],
                ["المحاولات", String(active.attempts)],
                ["الحالة", active.status],
              ].map(([label, value]) => (
                <div className="detail-item" key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="card" style={{ marginTop: 18 }}>
              <h3>نتيجة الاستخراج المنقحة</h3>
              <p style={{ color: "var(--text-muted)" }}>
                {active.sanitizedResult}
              </p>
            </div>
            <h3 style={{ marginTop: 22 }}>الخط الزمني</h3>
            <div className="timeline">
              {[
                "استلام المصدر وتطبيق التنقية",
                "تشغيل المحلل المحدد",
                "تسجيل سبب الفشل دون حفظ المحتوى الخام",
              ].map((item) => (
                <div className="timeline-item" key={item}>
                  {item}
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="button">إضافة ملاحظة</button>
              <button className="button">إسناد مشكلة محلل</button>
              <button
                className="button primary"
                onClick={() => setRetry(active)}
              >
                إعادة المحاولة
              </button>
            </div>
          </>
        )}
      </Drawer>
      <ConfirmDialog
        auditEvent="admin.import.retry.requested"
        consequence="إعادة تشغيل المعالجة باستخدام أحدث قاعدة محلل دون تغيير البيانات الأصلية."
        onClose={() => setRetry(null)}
        onConfirm={() => {
          if (!retry) return;
          retryImport.mutate(
            { id: retry.id, expectedRevision: retry.revision },
            {
              onSuccess: () => {
                setMessage(`تمت جدولة إعادة محاولة ${retry.id} بنجاح.`);
                setRetry(null);
              },
            },
          );
        }}
        open={Boolean(retry)}
        outcomes={{
          success: "تمت الجدولة",
          failure: "تعذر التنفيذ",
          conflict: "الطلب قيد التنفيذ",
        }}
        pending={retryImport.isPending}
        permission="imports.failures.manage"
        scope={retry?.id ?? "عملية الاستيراد"}
        title="إعادة محاولة الاستيراد"
      />
    </div>
  );
}
