import type { ChartPoint, Incident, ServiceHealth } from "@/types/admin";
import type {
  ApiMonitoring,
  DatabaseMonitoring,
  HealthOverview,
  HealthStatus,
  MetricValue,
  OperationalRange,
  ProviderCategory,
  ProviderHealthPage,
  ProviderHealthSummary,
  StorageMonitoring,
} from "@/features/system-health/contracts";

const observedAt = "2026-08-01T11:58:00+03:00";
const staleAt = "2026-08-01T12:03:00+03:00";

function freshness(state: "fresh" | "stale" | "unknown" = "fresh") {
  return state === "unknown"
    ? { observedAt: null, staleAt: null, state, sourceLabel: "Phase 8 mock telemetry" }
    : { observedAt, staleAt, state, sourceLabel: "Phase 8 mock telemetry" };
}

function metric(key: string, label: string, value: number | null, unit: MetricValue["unit"], completeness: MetricValue["completeness"] = "complete"): MetricValue {
  return {
    key,
    label,
    value,
    unit,
    semantic: "selected_range",
    completeness,
    freshness: freshness(completeness === "unavailable" ? "unknown" : "fresh"),
  };
}

const serviceSeeds: Array<{
  id: string;
  name: string;
  category: HealthOverview["services"][number]["category"];
  status: HealthStatus;
  uptime: number | null;
  latency: number | null;
  errorRate: number | null;
  incident?: string;
}> = [
  { id: "SVC-API", name: "NestJS API", category: "api", status: "operational", uptime: 99.99, latency: 118, errorRate: 0.08 },
  { id: "SVC-DATABASE", name: "Supabase Database", category: "database", status: "operational", uptime: 99.98, latency: 24, errorRate: 0.02 },
  { id: "SVC-AUTH", name: "Supabase Auth", category: "auth", status: "operational", uptime: 99.99, latency: 94, errorRate: 0.04 },
  { id: "SVC-STORAGE", name: "Supabase Storage", category: "storage", status: "operational", uptime: 99.95, latency: 180, errorRate: 0.12 },
  { id: "SVC-REDIS", name: "Redis", category: "cache", status: "operational", uptime: 99.99, latency: 6, errorRate: 0.01 },
  { id: "SVC-WORKERS", name: "BullMQ Workers", category: "workers", status: "degraded", uptime: 99.81, latency: 420, errorRate: 1.14, incident: "INC-DEMO-WORKERS" },
  { id: "SVC-STRIPE", name: "Stripe", category: "payments", status: "operational", uptime: 99.97, latency: 286, errorRate: 0.07 },
  { id: "SVC-AI", name: "AI Providers", category: "ai", status: "partial_outage", uptime: 98.72, latency: 2400, errorRate: 4.82, incident: "INC-DEMO-AI" },
  { id: "SVC-EMAIL", name: "Email Provider", category: "email", status: "operational", uptime: 99.94, latency: 340, errorRate: 0.18 },
  { id: "SVC-PUSH", name: "Push Providers", category: "push", status: "operational", uptime: 99.91, latency: 310, errorRate: 0.21 },
  { id: "SVC-EXCHANGE", name: "Exchange Rate Provider", category: "exchange_rates", status: "maintenance", uptime: 99.87, latency: 510, errorRate: 0.34 },
  { id: "SVC-SENTRY", name: "Sentry", category: "monitoring", status: "operational", uptime: 99.99, latency: 102, errorRate: 0.02 },
];

function overview(range: OperationalRange, options: { partial?: boolean; stale?: boolean; unknown?: boolean } = {}): HealthOverview {
  const state = options.unknown ? "unknown" : options.stale ? "stale" : "fresh";
  return {
    range,
    summary: options.partial ? "Partial telemetry is available for the selected range." : "One worker backlog and one provider issue need attention.",
    services: serviceSeeds.map((seed, index) => ({
      id: seed.id,
      name: seed.name,
      category: seed.category,
      status: options.unknown && index === 0 ? "unknown" : seed.status,
      uptime: metric("uptime", "Uptime", options.unknown && index === 0 ? null : seed.uptime, "percent", options.unknown && index === 0 ? "unavailable" : "complete"),
      latency: metric("latency", "Latency", seed.latency, "milliseconds"),
      errorRate: metric("error_rate", "Error rate", seed.errorRate, "percent"),
      freshness: freshness(state),
      lastIncident: seed.incident ? {
        id: seed.incident,
        kind: "incident",
        label: `${seed.name} safe incident`,
        href: `/admin/security/incidents/${seed.incident}`,
      } : null,
      impactSummary: seed.status === "operational" ? "No active customer impact." : "Limited fictional operational impact.",
      platformImpact: {
        total: seed.status === "operational" ? 0 : 9,
        ios: seed.status === "operational" ? 0 : 4,
        android: seed.status === "operational" ? 0 : 3,
        unknown: seed.status === "operational" ? 0 : 2,
        semantic: "unique_customers",
        completeness: options.partial ? "partial" : "complete",
      },
    })),
    attention: [
      { id: "INC-DEMO-WORKERS", kind: "incident", label: "Worker backlog incident", href: "/admin/security/incidents/INC-DEMO-WORKERS" },
      { id: "INC-DEMO-AI", kind: "incident", label: "AI provider degradation", href: "/admin/security/incidents/INC-DEMO-AI" },
    ],
    freshness: freshness(state),
    partial: Boolean(options.partial),
    partialReason: options.partial ? "One provider observation is delayed." : null,
  };
}

export const healthOverviewFixtures: Record<string, HealthOverview> = {
  "1h": overview("1h"),
  "24h": overview("24h"),
  "7d": overview("7d"),
  "30d": overview("30d"),
  partial: overview("24h", { partial: true }),
  stale: overview("24h", { stale: true }),
  unknown: overview("24h", { unknown: true }),
};

function apiMonitoring(range: OperationalRange, options: { partial?: boolean; stale?: boolean; unavailable?: boolean } = {}): ApiMonitoring {
  const state = options.unavailable ? "unknown" : options.stale ? "stale" : "fresh";
  const completeness = options.unavailable ? "unavailable" : options.partial ? "partial" : "complete";
  return {
    range,
    requestVolume: metric("request_volume", "Request volume", options.unavailable ? null : 1284, "count", completeness),
    errorRate: metric("error_rate", "Error rate", options.unavailable ? null : 0.8, "percent", completeness),
    latency: metric("latency", "Latency", options.unavailable ? null : 142, "milliseconds", completeness),
    series: [
      { at: "2026-08-01T09:00:00+03:00", value: options.unavailable ? null : 126 },
      { at: "2026-08-01T10:00:00+03:00", value: options.unavailable ? null : 138 },
      { at: "2026-08-01T11:00:00+03:00", value: options.unavailable ? null : 142 },
    ],
    endpoints: [
      {
        routePattern: "/api/v1/admin/imports/:scope",
        requestVolume: metric("imports_volume", "Imports volume", 392, "count", completeness),
        errorRate: metric("imports_errors", "Imports errors", 1.1, "percent", completeness),
        p95Latency: metric("imports_p95", "Imports p95", 210, "milliseconds", completeness),
        statusCodeGroup: "mixed",
      },
      {
        routePattern: "/api/v1/admin/reports/:type",
        requestVolume: metric("reports_volume", "Reports volume", 218, "count", completeness),
        errorRate: metric("reports_errors", "Reports errors", 0.4, "percent", completeness),
        p95Latency: metric("reports_p95", "Reports p95", 184, "milliseconds", completeness),
        statusCodeGroup: "2xx",
      },
    ],
    statusCodes: [
      { group: "2xx", count: 1220 },
      { group: "4xx", count: 61 },
      { group: "5xx", count: 3 },
    ],
    freshness: freshness(state),
    partialReason: options.partial ? "One endpoint group is delayed." : null,
  };
}

function databaseMonitoring(range: OperationalRange, options: { partial?: boolean; stale?: boolean; unavailable?: boolean } = {}): DatabaseMonitoring {
  const completeness = options.unavailable ? "unavailable" : options.partial ? "partial" : "complete";
  return {
    range,
    connectionUsage: metric("connection_usage", "Connection usage", options.unavailable ? null : 62, "percent", completeness),
    queryLatency: metric("query_latency", "Query latency", options.unavailable ? null : 38, "milliseconds", completeness),
    storageUsage: metric("database_storage", "Database storage", options.unavailable ? null : 71, "percent", completeness),
    slowQueries: options.unavailable ? [] : [
      {
        label: "Aggregated import lookup",
        operation: "select",
        count: metric("slow_query_count", "Slow query count", 8, "count", completeness),
        p95Duration: metric("slow_query_p95", "Slow query p95", 410, "milliseconds", completeness),
      },
    ],
    backupState: options.unavailable ? "unavailable" : "healthy",
    recoveryState: options.unavailable ? "unavailable" : "healthy",
    freshness: freshness(options.unavailable ? "unknown" : options.stale ? "stale" : "fresh"),
    incident: options.partial ? { id: "INC-DEMO-DATABASE", kind: "incident", label: "Database telemetry delay" } : null,
  };
}

function storageMonitoring(range: OperationalRange, options: { partial?: boolean; stale?: boolean; unavailable?: boolean } = {}): StorageMonitoring {
  const completeness = options.unavailable ? "unavailable" : options.partial ? "partial" : "complete";
  return {
    range,
    storageUsage: metric("storage_usage", "Storage usage", options.unavailable ? null : 55, "percent", completeness),
    uploadCount: metric("upload_count", "Uploads", options.unavailable ? null : 412, "count", completeness),
    failedUploads: metric("failed_uploads", "Failed uploads", options.unavailable ? null : 3, "count", completeness),
    temporaryFiles: metric("temporary_files", "Temporary files", options.partial ? null : 29, "count", options.partial ? "unavailable" : completeness),
    cleanupState: options.unavailable ? "unavailable" : options.partial ? "delayed" : "healthy",
    freshness: freshness(options.unavailable ? "unknown" : options.stale ? "stale" : "fresh"),
    incident: options.partial ? { id: "INC-DEMO-STORAGE", kind: "incident", label: "Storage cleanup delay" } : null,
  };
}

export const apiMonitoringFixtures: Record<string, ApiMonitoring> = {
  "1h": apiMonitoring("1h"),
  "24h": apiMonitoring("24h"),
  "7d": apiMonitoring("7d"),
  "30d": apiMonitoring("30d"),
  partial: apiMonitoring("24h", { partial: true }),
  stale: apiMonitoring("24h", { stale: true }),
  unavailable: apiMonitoring("24h", { unavailable: true }),
};

export const databaseMonitoringFixtures: Record<string, DatabaseMonitoring> = {
  "1h": databaseMonitoring("1h"),
  "24h": databaseMonitoring("24h"),
  "7d": databaseMonitoring("7d"),
  "30d": databaseMonitoring("30d"),
  partial: databaseMonitoring("24h", { partial: true }),
  stale: databaseMonitoring("24h", { stale: true }),
  unavailable: databaseMonitoring("24h", { unavailable: true }),
};

export const storageMonitoringFixtures: Record<string, StorageMonitoring> = {
  "1h": storageMonitoring("1h"),
  "24h": storageMonitoring("24h"),
  "7d": storageMonitoring("7d"),
  "30d": storageMonitoring("30d"),
  partial: storageMonitoring("24h", { partial: true }),
  stale: storageMonitoring("24h", { stale: true }),
  unavailable: storageMonitoring("24h", { unavailable: true }),
};

const providerSeeds: Array<{
  id: string;
  name: string;
  category: ProviderCategory;
  status: HealthStatus;
  latency: number | null;
  errorRate: number | null;
  fallbackState: ProviderHealthSummary["fallbackState"];
  capabilities: string[];
  safeError?: string;
}> = [
  { id: "PRV-STRIPE", name: "Stripe", category: "stripe", status: "operational", latency: 286, errorRate: 0.07, fallbackState: "not_applicable", capabilities: ["payments", "subscriptions"] },
  { id: "PRV-AI", name: "AI Providers", category: "ai", status: "partial_outage", latency: 2400, errorRate: 4.82, fallbackState: "active", capabilities: ["receipt extraction", "classification"], safeError: "Elevated safe timeout code" },
  { id: "PRV-EMAIL", name: "Email Provider", category: "email", status: "operational", latency: 340, errorRate: 0.18, fallbackState: "available", capabilities: ["transactional email"] },
  { id: "PRV-PUSH", name: "Push Provider", category: "push", status: "degraded", latency: 620, errorRate: 1.4, fallbackState: "available", capabilities: ["mobile push"], safeError: "Delivery delay code" },
  { id: "PRV-EXCHANGE", name: "Exchange Rates", category: "exchange_rates", status: "maintenance", latency: 510, errorRate: 0.34, fallbackState: "not_applicable", capabilities: ["daily rates"] },
];

function providerSummary(seed: (typeof providerSeeds)[number], access: ProviderHealthSummary["access"] = "full"): ProviderHealthSummary {
  return {
    id: seed.id,
    name: seed.name,
    category: seed.category,
    status: seed.status,
    latency: metric("provider_latency", "Provider latency", seed.latency, "milliseconds", seed.latency === null ? "unavailable" : "complete"),
    errorRate: metric("provider_error_rate", "Provider error rate", seed.errorRate, "percent", seed.errorRate === null ? "unavailable" : "complete"),
    lastSuccessAt: seed.status === "partial_outage" ? "2026-08-01T10:52:00+03:00" : "2026-08-01T11:52:00+03:00",
    lastCheckedAt: observedAt,
    freshness: freshness(),
    capabilities: seed.capabilities,
    fallbackState: seed.fallbackState,
    safeError: seed.safeError ?? null,
    platformImpact: {
      total: seed.status === "operational" ? 0 : 42,
      ios: seed.status === "operational" ? 0 : 20,
      android: seed.status === "operational" ? 0 : 18,
      unknown: seed.status === "operational" ? 0 : 4,
      semantic: "requests",
      completeness: "complete",
    },
    access,
    incident: seed.status === "operational" ? null : { id: `INC-${seed.id}`, kind: "incident", label: `${seed.name} safe incident` },
  };
}

function providerPage(options: { partial?: boolean; stale?: boolean; unavailable?: boolean; access?: ProviderHealthSummary["access"] } = {}): ProviderHealthPage {
  const items = providerSeeds.map((seed) => providerSummary({
    ...seed,
    latency: options.unavailable ? null : seed.latency,
    errorRate: options.unavailable ? null : seed.errorRate,
  }, options.access));
  return {
    items: options.partial ? items.slice(0, 4) : items,
    page: 1,
    pageSize: 25,
    total: options.partial ? 4 : items.length,
    freshness: freshness(options.unavailable ? "unknown" : options.stale ? "stale" : "fresh"),
    partial: Boolean(options.partial),
    partialReason: options.partial ? "One provider observation is delayed." : null,
  };
}

export const providerHealthFixtures: Record<string, ProviderHealthPage> = {
  full: providerPage(),
  domain: providerPage({ access: "domain" }),
  partial: providerPage({ partial: true }),
  stale: providerPage({ stale: true }),
  unavailable: providerPage({ unavailable: true }),
};

export const services: ServiceHealth[] = [
  ["NestJS API", "operational", "99.99%", "118 ms", "0.08%", "18 يوماً", "الآن"],
  ["Supabase Database", "operational", "99.98%", "24 ms", "0.02%", "31 يوماً", "الآن"],
  ["Supabase Auth", "operational", "99.99%", "94 ms", "0.04%", "42 يوماً", "الآن"],
  ["Supabase Storage", "operational", "99.95%", "180 ms", "0.12%", "12 يوماً", "منذ دقيقة"],
  ["Redis", "operational", "99.99%", "6 ms", "0.01%", "64 يوماً", "الآن"],
  ["BullMQ Workers", "degraded", "99.81%", "420 ms", "1.14%", "نشط", "منذ دقيقة"],
  ["Stripe", "operational", "99.97%", "286 ms", "0.07%", "23 يوماً", "منذ دقيقتين"],
  ["AI Providers", "partial-outage", "98.72%", "2.4 s", "4.82%", "نشط", "منذ دقيقة"],
  ["Email Provider", "operational", "99.94%", "340 ms", "0.18%", "9 أيام", "منذ دقيقتين"],
  ["Push Provider", "operational", "99.91%", "310 ms", "0.21%", "7 أيام", "منذ دقيقتين"],
  ["Exchange Rate Provider", "maintenance", "99.87%", "510 ms", "0.34%", "صيانة مجدولة", "منذ 3 دقائق"],
  ["Sentry", "operational", "99.99%", "102 ms", "0.02%", "55 يوماً", "الآن"],
].map(([name, status, uptime, latency, errorRate, lastIncident, lastCheck]) => ({
  name, status, uptime, latency, errorRate, lastIncident, lastCheck,
})) as ServiceHealth[];

export const requestVolume: ChartPoint[] = [
  { name: "00:00", current: 44 }, { name: "04:00", current: 31 }, { name: "08:00", current: 82 },
  { name: "12:00", current: 104 }, { name: "16:00", current: 96 }, { name: "20:00", current: 71 },
];

export const latencyTrend: ChartPoint[] = requestVolume.map((point, index) => ({
  name: point.name, current: [104, 96, 124, 138, 118, 110][index], previous: 200,
}));

export const incidents: Incident[] = [
  { id: "INC-2048", severity: "critical", service: "AI Providers", title: "تراجع أداء معالجة الإيصالات", detail: "تأخر في معالجة صور الإيصالات مع تفعيل المزود البديل.", startedAt: "2026-07-25T07:42:00+03:00", status: "قيد المعالجة", affectedArea: "استيراد الإيصالات", timeline: ["07:42 اكتشاف ارتفاع زمن الاستجابة", "07:49 تفعيل المزود البديل", "08:12 انخفاض معدل الخطأ"] },
  { id: "INC-2044", severity: "medium", service: "BullMQ Workers", title: "تراكم مهام التقارير", detail: "زمن الانتظار أعلى من الهدف التشغيلي.", startedAt: "2026-07-25T04:05:00+03:00", status: "مراقبة", affectedArea: "التقارير الشهرية", timeline: ["04:05 رصد التراكم", "04:22 زيادة العمال", "05:10 بدء انخفاض القائمة"] },
];

export const healthSummary = [
  { label: "الخدمات العاملة", value: "9 / 12" },
  { label: "الخدمات المتراجعة", value: "2" },
  { label: "الحوادث النشطة", value: "2" },
  { label: "متوسط استجابة API", value: "118 ms" },
  { label: "معدل الخطأ", value: "0.08%" },
  { label: "قائمة الانتظار", value: "1,284" },
];

export const errorRateTrend: ChartPoint[] = requestVolume.map((point, index) => ({
  ...point,
  current: [.06, .04, .08, .12, .09, .08][index],
}));

export const queueSummary = [
  { label: "بانتظار", value: "1,284" },
  { label: "نشطة", value: "86" },
  { label: "مكتملة", value: "42,840" },
  { label: "فاشلة", value: "37" },
  { label: "مؤجلة", value: "112" },
  { label: "معادة", value: "64" },
];
