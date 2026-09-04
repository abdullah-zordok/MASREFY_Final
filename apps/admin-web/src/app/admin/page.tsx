"use client";

import { Activity, ArrowLeft, Clock3, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChartCard, DonutChart, TrendChart, VolumeChart } from "@/components/admin/Charts";
import {
  MetricCard,
  PageHeader,
  RegionState,
  SeverityBadge,
  StatusBadge,
  type RegionStateLike,
} from "@/components/admin/ui";
import { PlatformFilter } from "@/components/admin/PlatformFilter";
import { DateRangeControl } from "@/components/admin/DateRangeControl";
import { useSimulatedRole } from "@/core/auth/use-simulated-role";
import type { Locale } from "@/core/localization/direction";
import {
  getPeriodLabel,
  getPlanLabel,
  getPlatformLabel,
  getStatusLabel,
} from "@/core/localization/display-labels";
import { useLocale, useT } from "@/core/localization/provider";
import { hasPermission } from "@/core/permissions/role-map";
import { useAttention, usePlatformOptions } from "@/features/foundation/hooks";
import {
  useOverviewActivity,
  useOverviewSummary,
  usePlatformAnalytics,
} from "@/features/overview/hooks";
import type { OverviewMetric, TrendSeries } from "@/features/overview/contracts";
import { reportExportsRepository, type AdminExportStatus } from "@/features/overview/report-exports";
import type { ChartPoint, Metric, SystemStatus } from "@/types/admin";
import type { DateRangeInput } from "@/features/foundation/contracts";
import { ApiError } from "@/core/api/errors";
import { formatDate } from "@/lib/admin-utils";

const PERIOD_PRESETS = ["7d", "30d", "90d"] as const;
const METRIC_KIND_LABELS: Record<string, Record<Locale, string>> = {
  "unique-customers": { ar: "عملاء فريدون", en: "Unique customers" },
  devices: { ar: "أجهزة", en: "Devices" },
  events: { ar: "أحداث", en: "Events" },
  imports: { ar: "واردات", en: "Imports" },
  requests: { ar: "طلبات", en: "Requests" },
  payments: { ar: "مدفوعات", en: "Payments" },
  tickets: { ar: "تذاكر", en: "Tickets" },
  currency: { ar: "عملة", en: "Currency" },
};

const OVERVIEW_METRIC_COPY: Record<string, Record<Locale, { label: string; note?: string }>> = {
  "unique-customers": {
    ar: { label: "إجمالي العملاء", note: "مقابل الفترة السابقة" },
    en: { label: "Total customers", note: "Compared with the previous period" },
  },
  "active-customers": {
    ar: { label: "العملاء النشطون", note: "جلسة أو استخدام ميزة" },
    en: { label: "Active customers", note: "Session or feature use" },
  },
  "new-customers": {
    ar: { label: "العملاء الجدد", note: "إكمال التسجيل" },
    en: { label: "New customers", note: "Registration completed" },
  },
  "paid-customers": {
    ar: { label: "العملاء المدفوعون", note: "24.8% من الإجمالي" },
    en: { label: "Paid customers", note: "24.8% of total" },
  },
  mrr: {
    ar: { label: "الإيراد الشهري المتكرر", note: "تقدير تشغيلي" },
    en: { label: "Monthly recurring revenue", note: "Operational estimate" },
  },
  imports: {
    ar: { label: "المعاملات المستوردة" },
    en: { label: "Imported transactions" },
  },
  "ai-usage": {
    ar: { label: "عمليات الذكاء الاصطناعي" },
    en: { label: "AI operations" },
  },
  "support-tickets": {
    ar: { label: "تذاكر الدعم المفتوحة" },
    en: { label: "Open support tickets" },
  },
  "critical-incidents": {
    ar: { label: "الحوادث الحرجة", note: "تحتاج مراجعة" },
    en: { label: "Critical incidents", note: "Needs review" },
  },
  "failed-jobs": {
    ar: { label: "المهام الفاشلة", note: "Within 24 hours" },
    en: { label: "Failed jobs", note: "Within 24 hours" },
  },
};

const ACTIVITY_COPY: Record<string, Record<Locale, string>> = {
  "customer-registration": { ar: "تسجيل عميل", en: "Customer registration" },
  "subscription-upgrade": { ar: "ترقية اشتراك", en: "Subscription upgrade" },
  "webhook-failure": { ar: "فشل إشعار", en: "Webhook failure" },
  "parser-rule-update": { ar: "تحديث محلل", en: "Parser update" },
  "admin-role-change": { ar: "تغيير دور", en: "Role change" },
  "support-access-approval": { ar: "اعتماد وصول", en: "Access approval" },
  "account-deletion-completed": { ar: "اكتمال حذف", en: "Deletion completed" },
};

const ACTIVITY_SUMMARIES: Record<string, Record<Locale, string>> = {
  "ACT-DEMO-001": { ar: "ترقية اشتراك تجريبي إلى Premium.", en: "Mock subscription upgraded to Premium." },
  "ACT-DEMO-002": { ar: "تسجيل عميل تجريبي جديد.", en: "New mock customer registered." },
  "ACT-DEMO-003": { ar: "فشل إشعار دفع تجريبي.", en: "Mock payment webhook failed." },
  "ACT-DEMO-004": { ar: "تحديث قاعدة محلل تجريبي.", en: "Mock parser rule updated." },
  "ACT-DEMO-005": { ar: "تغيير دور تجريبي.", en: "Mock role changed." },
  "ACT-DEMO-006": { ar: "اعتماد وصول دعم تجريبي.", en: "Mock support access approved." },
  "ACT-DEMO-007": { ar: "اكتمال حذف حساب تجريبي.", en: "Mock account deletion completed." },
  "ACT-DEMO-008": { ar: "تسجيل عميل تجريبي إضافي.", en: "Additional mock customer registered." },
  "ACT-DEMO-009": { ar: "ترقية اشتراك تجريبية أخرى.", en: "Another mock subscription upgraded." },
  "ACT-DEMO-010": { ar: "فشل إشعار دفع تجريبي إضافي.", en: "Additional mock payment webhook failed." },
  "ACT-DEMO-011": { ar: "تحديث قاعدة محلل إضافي.", en: "Additional parser rule updated." },
  "ACT-DEMO-012": { ar: "تسجيل عميل تجريبي ثالث.", en: "Third mock customer registered." },
};

const ATTENTION_SUMMARIES: Record<string, Record<Locale, string>> = {
  "ATT-DEMO-queue-1": { ar: "تراكم تجريبي في قائمة انتظار التقارير.", en: "Mock backlog in the reporting queue." },
  "ATT-DEMO-payment-1": { ar: "ارتفاع تجريبي في فشل المدفوعات.", en: "Mock increase in payment failures." },
  "ATT-DEMO-incident-1": { ar: "حادث تجريبي حرج في مزود الذكاء الاصطناعي.", en: "Critical mock incident in the AI provider." },
  "ATT-DEMO-import-1": { ar: "ارتفاع تجريبي في فشل الاستيراد.", en: "Mock increase in import failures." },
  "ATT-DEMO-ai-1": { ar: "انقطاع تجريبي جزئي لمزود الذكاء الاصطناعي.", en: "Partial mock outage for the AI provider." },
  "ATT-DEMO-security-1": { ar: "تنبيه أمان تجريبي يتطلب مراجعة.", en: "Mock security alert requires review." },
  "ATT-DEMO-deletion-1": { ar: "فشل تجريبي في إكمال حذف حساب.", en: "Mock account deletion did not complete." },
  "ATT-DEMO-support-1": { ar: "تذكرة دعم تجريبية ذات أولوية عالية.", en: "High-priority mock support ticket." },
  "ATT-DEMO-info-1": { ar: "ملاحظة تشغيلية تجريبية.", en: "Mock operational note." },
  "ATT-DEMO-admin-governance-1": { ar: "مراجعة حوكمة دور إداري تتطلب انتباها.", en: "Admin role governance review requires attention." },
  "ATT-DEMO-settings-1": { ar: "إعدادات الصيانة مجدولة لمراجعة تجريبية.", en: "Maintenance settings are scheduled for mock review." },
};
const STATUS_BY_SERVICE: Record<string, SystemStatus> = {
  operational: "operational",
  degraded: "degraded",
  "partial-outage": "partial-outage",
  "major-outage": "major-outage",
  maintenance: "maintenance",
};
const SERVICE_LABELS: Record<string, Record<Locale, string>> = {
  api: { ar: "واجهة API", en: "API" },
  database: { ar: "قاعدة البيانات", en: "Database" },
  cache: { ar: "التخزين المؤقت", en: "Cache" },
  worker: { ar: "العمال الخلفيون", en: "Background workers" },
  storage: { ar: "التخزين", en: "Storage" },
  "payment-webhook": { ar: "إشعارات الدفع", en: "Payment webhooks" },
  "ai-provider": { ar: "مزود الذكاء الاصطناعي", en: "AI provider" },
  "push-notification": { ar: "الإشعارات الفورية", en: "Push notifications" },
};

const CAPABILITY_LABELS: Record<string, Record<Locale, string>> = {
  shortcut: { ar: "الاختصارات", en: "Shortcut" },
  "share-extension": { ar: "امتداد المشاركة", en: "Share Extension" },
  "sms-tracking": { ar: "تتبع SMS", en: "SMS Tracking" },
  "notification-listener": { ar: "مستمع الإشعارات", en: "Notification Listener" },
};

const CAPABILITY_CAVEATS: Record<string, Record<Locale, string>> = {
  shortcut: { ar: "يقيس اعتماد اختصارات iOS المجمعة فقط.", en: "Measures aggregate iOS shortcut adoption only." },
  "share-extension": { ar: "اعتماد تجميعي لامتداد المشاركة.", en: "Aggregate adoption for the share extension." },
  "sms-tracking": { ar: "تتبع تجميعي لرسائل Android.", en: "Aggregate tracking for Android messages." },
  "notification-listener": { ar: "اعتماد تجميعي لمستمع إشعارات Android.", en: "Aggregate adoption for the Android notification listener." },
};

const VERSION_STATE_LABELS: Record<string, Record<Locale, string>> = {
  current: { ar: "حالي", en: "Current" },
  "supported-older": { ar: "أقدم مدعوم", en: "Supported older" },
  unsupported: { ar: "غير مدعوم", en: "Unsupported" },
  unknown: { ar: "غير معروف", en: "Unknown" },
};

const DEVICE_CATEGORY_LABELS: Record<string, Record<Locale, string>> = {
  "هاتف": { ar: "هاتف", en: "Phone" },
  "لوحي": { ar: "لوحي", en: "Tablet" },
};

function trendToChartPoints(series: TrendSeries): ChartPoint[] {
  return series.points.map((point) => ({
    name: formatDate(point.timestamp).slice(0, 5),
    current: point.value,
    previous: point.comparisonValue,
    secondary: undefined,
  }));
}

function labelFor(map: Record<string, Record<Locale, string>>, locale: Locale, key: string): string {
  return map[key]?.[locale] ?? key;
}

function metricValue(metric: OverviewMetric, locale: Locale): string {
  if (metric.id === "mrr") return locale === "ar" ? "2.48 مليون SAR" : "2.48M SAR";
  if (metric.id === "imports") return locale === "ar" ? "1.92 مليون" : "1.92M";
  return metric.formattedValue;
}

function metricToCard(metric: OverviewMetric, locale: Locale): Metric {
  const tone: Metric["tone"] =
    metric.tone === "premium"
      ? "premium"
      : metric.tone === "warning"
        ? "attention"
        : "default";
  const copy = OVERVIEW_METRIC_COPY[metric.id]?.[locale];
  return {
    label: copy?.label ?? metric.id,
    value: metricValue(metric, locale),
    change: metric.change,
    note: copy?.note,
    tone,
    context: `${labelFor(METRIC_KIND_LABELS, locale, metric.kind)} · ${getPlatformLabel(locale, metric.platformScope)} · ${getPeriodLabel(locale, metric.period)} · ${getStatusLabel(locale, metric.freshness.state)}`,
  };
}

function findRegion(
  regions: { region: string; availability: string; message?: string; retryable: boolean }[] | undefined,
  name: string,
): RegionStateLike | undefined {
  const found = regions?.find((entry) => entry.region === name);
  if (!found) return undefined;
  return {
    availability: found.availability as RegionStateLike["availability"],
    message: found.message,
    retryable: found.retryable,
  };
}

function formatTime(iso: string): string {
  return formatDate(iso, true);
}

function serviceLabel(service: string, locale: Locale): string {
  return labelFor(SERVICE_LABELS, locale, service);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function subscriptionPlanLabel(plan: string, index: number, locale: Locale): string {
  const plans = ["Free", "Basic", "Premium"];
  return getPlanLabel(locale, plans[index] ?? plan);
}

function versionLabel(version: string, locale: Locale): string {
  if (version === "غير معروف") return labelFor(VERSION_STATE_LABELS, locale, "unknown");
  return version;
}

export default function OverviewPage() {
  const role = useSimulatedRole();
  const { direction, locale } = useLocale();
  const t = useT();
  const [range, setRange] = useState<DateRangeInput>({
    start: "2026-06-28",
    end: "2026-07-27",
    preset: "30d",
  });
  const [platform, setPlatform] = useState<"all" | "ios" | "android">("all");
  const [reportExport, setReportExport] = useState<AdminExportStatus | "pending" | null>(null);
  const period = (PERIOD_PRESETS as readonly string[]).includes(range.preset)
    ? (range.preset as "7d" | "30d" | "90d")
    : "30d";
  const [activityPager, setActivityPager] = useState({
    platform: "all" as "all" | "ios" | "android",
    period: "30d" as "7d" | "30d" | "90d",
    page: 1,
  });
  const activityPage =
    activityPager.platform === platform && activityPager.period === period
      ? activityPager.page
      : 1;

  const platformOptions = usePlatformOptions();
  const summary = useOverviewSummary({ platform, period, locale });
  const analytics = usePlatformAnalytics({ platform, period, locale });
  const attention = useAttention(role, { platform, period, page: 1, pageSize: 5 });
  const activity = useOverviewActivity({ platform, period, locale, page: activityPage, pageSize: 10 });

  const metrics = summary.data?.metrics ?? [];
  const userGrowthPoints = useMemo(
    () => (analytics.data ? trendToChartPoints(analytics.data.userGrowth) : []),
    [analytics.data],
  );
  const importVolumeSeries = useMemo(
    () => analytics.data?.comparisonTrends.find((series) => series.id === "import-volume"),
    [analytics.data],
  );
  const importVolumePoints = useMemo(
    () => (importVolumeSeries ? trendToChartPoints(importVolumeSeries).map((point) => ({ ...point, secondary: point.previous })) : []),
    [importVolumeSeries],
  );

  const summaryRegion = findRegion(summary.data?.regions, "metrics");
  const customersRegion = findRegion(analytics.data?.regions, "customers");
  const attentionRegion: RegionStateLike | undefined = attention.data?.region
    ? {
        availability: attention.data.region.availability,
        message: attention.data.region.message,
        retryable: attention.data.region.retryable,
      }
    : undefined;
  const activityRegion: RegionStateLike | undefined = activity.data?.region
    ? {
        availability: activity.data.region.availability,
        message: activity.data.region.message,
        retryable: activity.data.region.retryable,
      }
    : undefined;

  const customers = analytics.data?.customers;
  const subscription = summary.data?.subscriptionRevenue;
  const overlapNote = customers && customers.multiPlatformCustomers > 0;
  const summaryError = summary.error instanceof ApiError ? { code: summary.error.code } : undefined;
  const analyticsError = analytics.error instanceof ApiError ? { code: analytics.error.code } : undefined;
  const attentionError = attention.error instanceof ApiError ? { code: attention.error.code } : undefined;
  const activityError = activity.error instanceof ApiError ? { code: activity.error.code } : undefined;
  const listSeparator = locale === "ar" ? "، " : ", ";

  return (
    <div className="page overview-page" dir={direction}>
      <PageHeader
        eyebrow={t("overview.eyebrow")}
        title={t("overview.greeting")}
        description={t("overview.description")}
        actions={
          <>
            {platformOptions.data && (
              <PlatformFilter options={platformOptions.data.options} value={platform} onChange={setPlatform} />
            )}
            <DateRangeControl value={range} onChange={setRange} allowedPresets={PERIOD_PRESETS} />
            {hasPermission(role, "data_requests.exports.manage") && (
              reportExport && reportExport !== "pending" && reportExport.downloadUrl ? (
                <a className="button" data-spec="overview-export-download" href={reportExport.downloadUrl} rel="noreferrer">
                  <Download size={16} />
                  <span>{locale === "ar" ? "تنزيل التقرير" : "Download report"}</span>
                </a>
              ) : (
                <button
                  className="button"
                  data-spec="overview-export"
                  disabled={reportExport === "pending"}
                  onClick={async () => {
                    setReportExport("pending");
                    try {
                      const accepted = await reportExportsRepository.request({ exportType: "overview", period, platform, format: "csv" });
                      setReportExport(await reportExportsRepository.wait(accepted.attemptId));
                    } catch { setReportExport(null); }
                  }}
                >
                  <Download size={16} />
                  <span>{locale === "ar" ? "تصدير CSV" : "Export CSV"}</span>
                </button>
              )
            )}
            <button
              className="button"
              onClick={() => {
                summary.refetch();
                analytics.refetch();
                attention.refetch();
                activity.refetch();
              }}
            >
              <RefreshCw size={16} />
              <span>{t("overview.refresh")}</span>
            </button>
          </>
        }
      />

      <section aria-label={t("overview.metricsAria")}>
        <RegionState
          isPending={summary.isPending}
          isError={summary.isError}
          region={summaryRegion}
          error={summaryError}
          onRetry={() => summary.refetch()}
        >
          {metrics.length > 0 && (
            <>
              <div className="metrics-grid">
                {metrics.slice(0, 4).map((metric) => (
                  <div data-spec={metric.id === "unique-customers" ? "unique-customers-total" : undefined} key={metric.id}>
                    <MetricCard metric={metricToCard(metric, locale)} primary />
                  </div>
                ))}
              </div>
              <div className="metrics-grid" style={{ marginTop: 14 }}>
                {metrics.slice(4).map((metric) => (
                  <div key={metric.id}>
                    <MetricCard metric={metricToCard(metric, locale)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </RegionState>
      </section>

      <section className="section-grid" aria-label={t("overview.customerAlertsAria")}>
        <div>
          <RegionState
            isPending={analytics.isPending}
            isError={analytics.isError}
            region={customersRegion}
            error={analyticsError}
            onRetry={() => analytics.refetch()}
          >
            {analytics.data && (
              <ChartCard
                title={t("overview.userGrowthTitle")}
                subtitle={t("overview.userGrowthSubtitle")}
                summary={t("overview.userGrowthTitle")}
              >
                <TrendChart data={userGrowthPoints} compare={platform === "all"} />
              </ChartCard>
            )}
            {overlapNote && (
              <p className="region-warning" data-spec="overlap-warning" role="status">
                {t("overview.overlapWarning")}
              </p>
            )}
          </RegionState>
        </div>
        <article className="card attention-card">
          <div className="card-heading">
            <div>
              <h2>{t("overview.attentionTitle")}</h2>
              <p>{t("overview.attentionOpenCases", { count: attention.data?.totalItems ?? 0 })}</p>
            </div>
          </div>
          <RegionState
            isPending={attention.isPending}
            isError={attention.isError}
            region={attentionRegion}
            error={attentionError}
            onRetry={() => attention.refetch()}
            emptyLabel={t("overview.attentionEmpty")}
          >
            {attention.data && attention.data.items.length > 0 && (
              <div className="attention-list">
                {attention.data.items.map((item) => {
                  const permitted = hasPermission(role, item.permission);
                  const destination = item.destination && permitted ? item.destination : undefined;
                  const body = (
                    <>
                      <div className="attention-title">
                        <h3>{ATTENTION_SUMMARIES[item.id]?.[locale] ?? item.type}</h3>
                        <SeverityBadge severity={item.severity} />
                      </div>
                      <div className="attention-meta">
                        <span className="ltr">{item.id}</span>
                        <span>{formatTime(item.occurredAt)}</span>
                      </div>
                    </>
                  );
                  return (
                    <div className="attention-item" key={item.id}>
                      {destination ? <Link href={destination}>{body}</Link> : body}
                    </div>
                  );
                })}
              </div>
            )}
          </RegionState>
        </article>
      </section>

      <section className="section-grid equal" aria-label={t("overview.importAnalyticsAria")}>
        <RegionState
          isPending={analytics.isPending}
          isError={analytics.isError}
          region={customersRegion}
          error={analyticsError}
          onRetry={() => analytics.refetch()}
        >
          <ChartCard
            title={t("overview.importVolumeTitle")}
            subtitle={t("overview.importVolumeSubtitle")}
            summary={t("overview.importVolumeSummary")}
          >
            <VolumeChart data={importVolumePoints} stacked />
          </ChartCard>
        </RegionState>
        <div className="section-grid equal" style={{ marginTop: 0 }}>
          <RegionState
            isPending={summary.isPending}
            isError={summary.isError}
            region={summaryRegion}
            error={summaryError}
            onRetry={() => summary.refetch()}
          >
            <ChartCard
              title={t("overview.subscriptionDistributionTitle")}
              summary={
                subscription
                  ? subscription.distribution.map((d, index) => `${subscriptionPlanLabel(d.plan, index, locale)} ${Math.round(d.share * 100)}%`).join(listSeparator)
                  : t("overview.subscriptionDistributionUnavailable")
              }
            >
              <DonutChart
                data={
                  subscription
                    ? subscription.distribution.map((d, index) => ({ name: subscriptionPlanLabel(d.plan, index, locale), value: Math.round(d.share * 100) }))
                    : []
                }
              />
              <div className="legend">
                {subscription?.distribution.map((d, index) => (
                  <span key={d.plan}>
                    <i style={{ background: `var(--chart-series-${(index % 4) + 1})` }} />
                    {subscriptionPlanLabel(d.plan, index, locale)} {Math.round(d.share * 100)}%
                  </span>
                ))}
              </div>
            </ChartCard>
          </RegionState>
          <RegionState
            isPending={analytics.isPending}
            isError={analytics.isError}
            region={customersRegion}
            error={analyticsError}
            onRetry={() => analytics.refetch()}
          >
            <ChartCard
              title={t("overview.platformTitle")}
              summary={
                customers
                  ? `${t("overview.iosOnly")} ${customers.iosOnlyCustomers} · ${t("overview.androidOnly")} ${customers.androidOnlyCustomers} · ${t("overview.multiPlatform")} ${customers.multiPlatformCustomers}.`
                  : t("overview.platformUnavailable")
              }
            >
              <DonutChart
                data={
                  customers
                    ? [
                        { name: t("overview.iosOnly"), value: customers.iosOnlyCustomers },
                        { name: t("overview.androidOnly"), value: customers.androidOnlyCustomers },
                        { name: t("overview.multiPlatform"), value: customers.multiPlatformCustomers },
                      ]
                    : []
                }
              />
              <div className="legend">
                <span><i style={{ background: "var(--chart-series-1)" }} />{t("overview.iosOnly")} {customers?.iosOnlyCustomers ?? 0}</span>
                <span><i style={{ background: "var(--chart-series-2)" }} />{t("overview.androidOnly")} {customers?.androidOnlyCustomers ?? 0}</span>
                <span><i style={{ background: "var(--chart-series-3)" }} />{t("overview.multiPlatform")} {customers?.multiPlatformCustomers ?? 0}</span>
              </div>
            </ChartCard>
          </RegionState>
        </div>
      </section>

      <section className="section-grid equal" data-spec="adoption-summary" aria-label={t("overview.adoptionAria")}>
        <RegionState
          isPending={analytics.isPending}
          isError={analytics.isError}
          region={findRegion(analytics.data?.regions, "adoption") ?? customersRegion}
          error={analyticsError}
          onRetry={() => analytics.refetch()}
          emptyLabel={t("overview.adoptionEmpty")}
        >
          <ChartCard
            title={t("overview.appVersionTitle")}
            subtitle={getPlatformLabel(locale, platform)}
            summary={
              analytics.data?.versions.length
                ? analytics.data.versions.map((item) => `${versionLabel(item.version, locale)} ${percent(item.share)}`).join(listSeparator)
                : t("overview.versionPrompt")
            }
          >
            <DonutChart
              data={(analytics.data?.versions ?? []).map((item) => ({
                name: `${versionLabel(item.version, locale)} · ${labelFor(VERSION_STATE_LABELS, locale, item.supportState)}`,
                value: Math.round(item.share * 100),
              }))}
            />
            <div className="legend">
              {(analytics.data?.versions ?? []).map((item, index) => (
                <span key={`${item.platform}-${item.version}`}>
                  <i style={{ background: `var(--chart-series-${(index % 4) + 1})` }} />
                  {versionLabel(item.version, locale)} · {labelFor(VERSION_STATE_LABELS, locale, item.supportState)} · {percent(item.share)}
                </span>
              ))}
            </div>
          </ChartCard>
        </RegionState>
        <RegionState
          isPending={analytics.isPending}
          isError={analytics.isError}
          region={findRegion(analytics.data?.regions, "adoption") ?? customersRegion}
          error={analyticsError}
          onRetry={() => analytics.refetch()}
        >
          <article className="card">
            <div className="card-heading">
              <div>
                <h2>{t("overview.capabilitiesTitle")}</h2>
                <p>{getPlatformLabel(locale, platform)} · {t("overview.aggregateOnly")}</p>
              </div>
            </div>
            <div className="health-list">
              {(analytics.data?.capabilities ?? []).map((item) => (
                <div className="health-row" key={`${item.platform}-${item.capability}`}>
                  <div className="health-name">{labelFor(CAPABILITY_LABELS, locale, item.capability)}</div>
                  <div className="health-cell"><small>{t("overview.enabled")}</small><strong className="numbers ltr">{item.enabledPopulation.toLocaleString("en-US")}</strong></div>
                  <div className="health-cell"><small>{t("overview.eligible")}</small><strong className="numbers ltr">{item.eligiblePopulation.toLocaleString("en-US")}</strong></div>
                  <div className="health-cell"><small>{t("overview.rate")}</small><strong className="numbers ltr">{percent(item.rate)}</strong></div>
                  <small>{labelFor(CAPABILITY_CAVEATS, locale, item.capability)}</small>
                </div>
              ))}
              {(analytics.data?.devices ?? []).map((item) => (
                <div className="health-row" key={`${item.platform}-${item.category}`}>
                  <div className="health-name">{labelFor(DEVICE_CATEGORY_LABELS, locale, item.category)}</div>
                  <div className="health-cell"><small>{t("overview.devices")}</small><strong className="numbers ltr">{item.deviceCount.toLocaleString("en-US")}</strong></div>
                  <div className="health-cell"><small>{t("overview.share")}</small><strong className="numbers ltr">{percent(item.share)}</strong></div>
                </div>
              ))}
              {analytics.data && analytics.data.capabilities.length === 0 && analytics.data.devices.length === 0 && (
                <p className="region-warning">{t("overview.capabilitiesPrompt")}</p>
              )}
            </div>
          </article>
        </RegionState>
      </section>

      <section className="section-grid" aria-label={t("overview.operationalAria")}>
        <article className="card">
          <div className="card-heading">
            <div>
              <h2>{t("overview.operationalHealthTitle")}</h2>
              <p><span data-spec="global-health-label">{t("overview.globalLabel")}</span> · {t("overview.globalMeasurement")} · {t("overview.platformUnaffected")}</p>
            </div>
            <StatusBadge status="degraded" />
          </div>
          <RegionState
            isPending={summary.isPending}
            isError={summary.isError}
            region={summaryRegion}
            error={summaryError}
            onRetry={() => summary.refetch()}
          >
            <div className="health-list">
              {summary.data?.serviceHealth.map((service) => (
                <div className="health-row" key={service.service}>
                  <div className="health-name">
                    <span className={`health-dot ${service.status === "operational" ? "" : service.status === "degraded" || service.status === "maintenance" ? "warn" : "danger"}`} />
                    {serviceLabel(service.service, locale)}
                  </div>
                  <div className="health-cell"><small>{t("overview.status")}</small><StatusBadge status={STATUS_BY_SERVICE[service.status] ?? "operational"} /></div>
                  <div className="health-cell"><small>{t("overview.uptime")}</small><strong className="numbers ltr">{(service.uptime * 100).toFixed(2)}%</strong></div>
                  <div className="health-cell"><small>{t("overview.response")}</small><strong className="numbers ltr">{service.latencyMs} ms</strong></div>
                  <div className="health-cell"><small>{t("overview.error")}</small><strong className="numbers ltr">{(service.errorRate * 100).toFixed(2)}%</strong></div>
                </div>
              ))}
            </div>
          </RegionState>
        </article>
        <article className="card">
          <div className="card-heading">
            <div>
              <h2>{t("overview.recentActivityTitle")}</h2>
              <p>{t("overview.recentActivitySubtitle")}</p>
            </div>
          </div>
          <RegionState
            isPending={activity.isPending}
            isError={activity.isError}
            region={activityRegion}
            error={activityError}
            onRetry={() => activity.refetch()}
            emptyLabel={t("overview.activityEmpty")}
          >
            {activity.data && activity.data.items.length > 0 && (
              <>
                <div className="activity-list">
                  {activity.data.items.map((item) => {
                    const permitted = hasPermission(role, item.permission);
                    const destination = item.destination && permitted ? item.destination : undefined;
                    const meta = `${labelFor(ACTIVITY_COPY, locale, item.eventType)} · ${formatTime(item.occurredAt)}`;
                    return (
                      <div className="activity-item" key={item.id}>
                        <span className="activity-icon"><Activity size={16} /></span>
                        <div>
                          {destination ? (
                            <Link href={destination}><strong>{ACTIVITY_SUMMARIES[item.id]?.[locale] ?? item.eventType}</strong></Link>
                          ) : (
                            <strong>{ACTIVITY_SUMMARIES[item.id]?.[locale] ?? item.eventType}</strong>
                          )}
                          <small>{meta}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activity.data.page < activity.data.totalPages && (
                  <button
                    className="button"
                    data-spec="activity-load-more"
                    style={{ marginTop: 14 }}
                    onClick={() => setActivityPager({ platform, period, page: activityPage + 1 })}
                  >
                    <span>{t("overview.loadMore")}</span>
                    <ArrowLeft size={15} />
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, color: "var(--text-muted)", fontSize: 11 }}>
                  <Clock3 size={14} /> {t("overview.activityFooter", { period: getPeriodLabel(locale, period) })} · <span data-spec="activity-page">page {activity.data.page}</span>
                </div>
              </>
            )}
          </RegionState>
        </article>
      </section>
    </div>
  );
}
