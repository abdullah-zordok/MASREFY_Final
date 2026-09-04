"use client";

import { useMemo, useState } from "react";
import { ChartCard, DonutChart } from "@/components/admin/Charts";
import { PermissionBoundary } from "@/components/admin/PermissionBoundary";
import {
  MetricCard,
  PageHeader,
  RegionState,
  type RegionStateLike,
} from "@/components/admin/ui";
import { useSimulatedRole } from "@/core/auth/use-simulated-role";
import { hasPermission } from "@/core/permissions/role-map";
import { ApiError } from "@/core/api/errors";
import { useSubscriptionOverview } from "@/features/billing/hooks";
import { getPeriodLabel, getPlanLabel, getPlatformLabel } from "@/core/localization/display-labels";
import { useLocale } from "@/core/localization/provider";
import type {
  Period,
  PlatformFilter as BillingPlatformFilter,
  SubscriptionOverview,
} from "@/features/billing/contracts";
import { formatAdminNumber } from "@/lib/admin-utils";
import type { Metric } from "@/types/admin";

const PERIODS: readonly Period[] = ["7d", "30d", "90d"];
const PLATFORMS: readonly BillingPlatformFilter[] = ["all", "ios", "android", "multi_platform"];

const billingOverviewCopy = {
  ar: {
    eyebrow: "الفوترة / الاشتراكات",
    title: "الاشتراكات والإيرادات",
    description: "مؤشرات تشغيلية تجريبية للفوترة، ببيانات مقنعة وعملات منفصلة وبلا أي اتصال بمزود دفع حقيقي.",
    period: "الفترة",
    platform: "المنصة",
    empty: "لا توجد بيانات اشتراكات للفترة والمنصة المحددة.",
    subscriptionMetrics: "مؤشرات الاشتراكات",
    activeSubscriptions: "اشتراكات نشطة",
    uniqueSubscriptions: "اشتراكات فريدة",
    activeNote: "إجمالي تعاقدي من واجهة mock",
    nonAdditiveNote: "إجمالي فريد لا يساوي جمع المنصات المتداخلة",
    revenue: "الإيراد الشهري المتكرر",
    revenueNote: "يعرض كل عملة منفصلة دون تحويل أو دمج",
    failedRenewals: "فشل التجديد",
    failedRenewalsNote: "لا يعرض بيانات دفع خاصة",
    movement: "حركة الاشتراكات",
    trialing: "تجريبي",
    upgrades: "ترقيات",
    downgrades: "تنزيلات",
    cancellations: "إلغاءات",
    churnRate: "معدل churn",
    distribution: "توزيع الاشتراكات والمنصات",
    planDistribution: "توزيع الخطط",
    platformDistribution: "توزيع المنصات",
    subscriberCount: "عدد المشتركين",
  },
  en: {
    eyebrow: "Billing / Subscriptions",
    title: "Subscriptions and Revenue",
    description: "Mock billing operating metrics with masked data, separate currencies, and no real payment provider connection.",
    period: "Period",
    platform: "Platform",
    empty: "No subscription data for the selected period and platform.",
    subscriptionMetrics: "Subscription metrics",
    activeSubscriptions: "Active subscriptions",
    uniqueSubscriptions: "Unique subscriptions",
    activeNote: "Contract total from the mock surface",
    nonAdditiveNote: "Unique total; overlapping platforms are not added together",
    revenue: "Monthly recurring revenue",
    revenueNote: "Shows each currency separately without conversion or merging",
    failedRenewals: "Failed renewals",
    failedRenewalsNote: "No private payment data is shown",
    movement: "Subscription movement",
    trialing: "Trialing",
    upgrades: "Upgrades",
    downgrades: "Downgrades",
    cancellations: "Cancellations",
    churnRate: "Churn rate",
    distribution: "Subscription and platform distribution",
    planDistribution: "Plan distribution",
    platformDistribution: "Platform distribution",
    subscriberCount: "Subscriber count",
  },
} as const;

function formatNumber(value: number): string {
  return formatAdminNumber(value);
}

function formatCurrency(value: number, currency: string): string {
  return `${formatAdminNumber(value)} ${currency}`;
}

function metric(label: string, value: string, note?: string, change?: number): Metric {
  return { label, value, note, change };
}

function revenueMetric(data: SubscriptionOverview, currency: "AED" | "SAR", label: string, note: string): Metric {
  const group = data.currencyGroups.find((item) => item.currency === currency);
  return metric(
    `${label} ${currency}`,
    formatCurrency(group?.value ?? 0, currency),
    note,
  );
}

export function BillingOverview({
  initialPeriod = "30d",
  initialPlatform = "all",
}: {
  initialPeriod?: Period;
  initialPlatform?: BillingPlatformFilter;
}) {
  const role = useSimulatedRole();
  const { locale } = useLocale();
  const copy = billingOverviewCopy[locale];
  const allowed = hasPermission(role, "subscriptions.read");
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [platform, setPlatform] = useState<BillingPlatformFilter>(initialPlatform);
  const overview = useSubscriptionOverview({ period, platform });
  const error = overview.error instanceof ApiError ? { code: overview.error.code } : undefined;
  const region: RegionStateLike | undefined = overview.data?.region;

  const planData = useMemo(() => {
    const kpis = overview.data?.kpis;
    if (!kpis) return [];
    return [
      { name: getPlanLabel(locale, "Free"), value: kpis.free },
      { name: getPlanLabel(locale, "Basic"), value: kpis.basic },
      { name: getPlanLabel(locale, "Premium"), value: kpis.premium },
    ];
  }, [locale, overview.data]);

  return (
    <PermissionBoundary allowed={allowed} permission="subscriptions.read">
      <div className="page">
        <PageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          actions={
            <>
              <div className="segmented-control" role="group" aria-label={copy.period}>
                {PERIODS.map((item) => (
                  <button
                    aria-pressed={period === item}
                    className={period === item ? "active" : ""}
                    key={item}
                    onClick={() => setPeriod(item)}
                    type="button"
                  >
                    {getPeriodLabel(locale, item)}
                  </button>
                ))}
              </div>
              <div className="segmented-control" role="group" aria-label={copy.platform}>
                {PLATFORMS.map((item) => (
                  <button
                    aria-pressed={platform === item}
                    className={platform === item ? "active" : ""}
                    key={item}
                    onClick={() => setPlatform(item)}
                    type="button"
                  >
                    {getPlatformLabel(locale, item)}
                  </button>
                ))}
              </div>
            </>
          }
        />

        <RegionState
          isPending={overview.isPending}
          isError={overview.isError}
          region={region}
          error={error}
          onRetry={() => overview.refetch()}
          permission="subscriptions.read"
          emptyLabel={copy.empty}
        >
          {overview.data && (
            <>
              <section className="metrics-grid" aria-label={copy.subscriptionMetrics}>
                <MetricCard
                  metric={metric(
                    platform === "all" ? copy.activeSubscriptions : copy.uniqueSubscriptions,
                    formatNumber(overview.data.kpis.active),
                    platform === "all" ? copy.nonAdditiveNote : copy.activeNote,
                  )}
                  primary
                />
                <MetricCard metric={revenueMetric(overview.data, "AED", copy.revenue, copy.revenueNote)} primary />
                <MetricCard metric={revenueMetric(overview.data, "SAR", copy.revenue, copy.revenueNote)} primary />
                <MetricCard metric={metric(copy.failedRenewals, formatNumber(overview.data.kpis.failedRenewals), copy.failedRenewalsNote)} />
              </section>

              <section className="metrics-grid" aria-label={copy.movement}>
                <MetricCard metric={metric(copy.trialing, formatNumber(overview.data.kpis.trialing))} />
                <MetricCard metric={metric(copy.upgrades, formatNumber(overview.data.kpis.upgrades), undefined, overview.data.kpis.upgrades > 0 ? 1 : 0)} />
                <MetricCard metric={metric(copy.downgrades, formatNumber(overview.data.kpis.downgrades), undefined, overview.data.kpis.downgrades > 0 ? -1 : 0)} />
                <MetricCard metric={metric(copy.cancellations, formatNumber(overview.data.kpis.cancellations), `${copy.churnRate} ${(overview.data.kpis.churnRate * 100).toFixed(1)}%`)} />
              </section>

              <section className="section-grid equal" aria-label={copy.distribution}>
                <ChartCard
                  title={copy.planDistribution}
                  summary={planData.map((item) => `${item.name} ${item.value}`).join("، ")}
                >
                  <DonutChart data={planData} />
                  <div className="legend">
                    {planData.map((item, index) => (
                      <span key={item.name}>
                        <i style={{ background: `var(--chart-series-${(index % 4) + 1})` }} />
                        {item.name} {formatNumber(item.value)}
                      </span>
                    ))}
                  </div>
                </ChartCard>

                <article className="card attention-card platform-distribution-card">
                  <div className="card-heading">
                    <div>
                      <h2>{copy.platformDistribution}</h2>
                    </div>
                  </div>
                  <div className="health-list platform-distribution-list">
                    {overview.data.platformBreakdown.filter((item) => item.platform !== "unattributed").map((item) => (
                      <div className="health-row platform-distribution-row" key={item.platform}>
                        <div className="health-name">{getPlatformLabel(locale, item.platform)}</div>
                        <div className="health-cell">
                          <small>{copy.subscriberCount}</small>
                          <strong className="numbers ltr">{item.uniqueSubscriptions.toLocaleString("en-US")}</strong>
                        </div>
                        {item.revenue.map((moneyValue) => (
                          <div className="health-cell" key={moneyValue.currency}>
                            <small>{moneyValue.currency}</small>
                            <strong className="numbers ltr">{moneyValue.amount.toLocaleString("en-US")}</strong>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </>
          )}
        </RegionState>
      </div>
    </PermissionBoundary>
  );
}
