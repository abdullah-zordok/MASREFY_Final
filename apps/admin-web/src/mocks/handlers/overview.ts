import { http, HttpResponse } from "msw";
import {
  buildOverviewSummary,
  buildPlatformAnalytics,
  dataFreshness,
  overviewActivityFixture,
  staleFreshness,
} from "@/mocks/fixtures/overview";
import type { ReportingPeriod } from "@/features/overview/contracts";
import { readScenario } from "@/mocks/scenarios/foundation";
import { scenarioResponse } from "./shared";

type PlatformFilter = "all" | "ios" | "android";
const reportAttemptId = "99000000-0000-4000-8000-000000000001";

function readPlatform(request: Request): PlatformFilter {
  const value = new URL(request.url).searchParams.get("platform");
  return value === "ios" || value === "android" ? value : "all";
}

function readPeriod(request: Request): ReportingPeriod {
  const value = new URL(request.url).searchParams.get("period");
  return value === "7d" || value === "90d" ? value : "30d";
}

function readRawScenario(request: Request): string | null {
  const url = new URL(request.url);
  return (
    request.headers.get("x-mock-scenario") ?? url.searchParams.get("__scenario")
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page,
    pageSize,
    totalItems: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

function availableRegion(region: "activity" | "customers" | "metrics") {
  return { region, availability: "available" as const, retryable: true };
}

export const overviewHandlers = [
  http.post("/api/v1/admin/exports", () =>
    HttpResponse.json(
      {
        attemptId: reportAttemptId,
        status: "queued",
        ledgerVersion: 0,
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
      },
      { status: 202 },
    ),
  ),
  http.get(`/api/v1/admin/exports/${reportAttemptId}`, () => {
    const now = Date.now();
    return HttpResponse.json({
      id: reportAttemptId,
      reportType: "account_activity",
      format: "csv",
      delivery: "download",
      status: "ready",
      metadata: {},
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
      downloadUrl:
        "https://project.supabase.co/storage/v1/object/sign/report-exports/admin.csv?token=opaque",
      downloadUrlExpiresAt: new Date(now + 5 * 60_000).toISOString(),
    });
  }),
  http.get("/api/v1/admin/overview", async ({ request }) => {
    const scenario = readScenario(request);
    const errorResponse = await scenarioResponse(scenario);
    if (errorResponse) return errorResponse;
    const platform = readPlatform(request);
    const period = readPeriod(request);
    const raw = readRawScenario(request);
    const summary = buildOverviewSummary(platform, period);
    if (raw === "stale") {
      return HttpResponse.json({
        ...summary,
        freshness: staleFreshness,
        regions: summary.regions.map((region) => ({
          ...region,
          availability: "stale" as const,
          lastSuccessfulAt: staleFreshness.asOf,
          retryable: true,
        })),
      });
    }
    if (raw === "partial") {
      return HttpResponse.json({
        ...summary,
        regions: [
          ...summary.regions,
          {
            region: "revenue" as const,
            availability: "partial" as const,
            retryable: true,
            message: "بعض بيانات الإيراد غير متاحة مؤقتاً.",
          },
        ],
      });
    }
    if (scenario === "empty") {
      return HttpResponse.json({
        ...summary,
        metrics: [],
        regions: [
          {
            region: "metrics" as const,
            availability: "empty" as const,
            retryable: true,
            message: "لا توجد بيانات للمنصة والفترة المحددة.",
          },
        ],
      });
    }
    return HttpResponse.json(summary);
  }),

  http.get("/api/v1/admin/overview/platform-analytics", async ({ request }) => {
    const scenario = readScenario(request);
    const errorResponse = await scenarioResponse(scenario);
    if (errorResponse) return errorResponse;
    const platform = readPlatform(request);
    const period = readPeriod(request);
    const raw = readRawScenario(request);
    if (raw === "impossible") {
      return HttpResponse.json({
        query: { platform, period, locale: "ar" },
        customers: {
          uniqueCustomersTotal: 100000,
          iosCustomers: 60000,
          androidCustomers: 50000,
          iosOnlyCustomers: 20000,
          androidOnlyCustomers: 20000,
          multiPlatformCustomers: 40000,
          activeCustomersTotal: 70000,
          activeIosCustomers: 40000,
          activeAndroidCustomers: 35000,
          newCustomersTotal: 3000,
          newIosCustomers: 2000,
          newAndroidCustomers: 1500,
          period,
          freshness: dataFreshness(),
        },
      });
    }
    const analytics = buildPlatformAnalytics(platform, period);
    if (raw === "stale") {
      return HttpResponse.json({
        ...analytics,
        regions: analytics.regions.map((region) => ({
          ...region,
          availability: "stale" as const,
          lastSuccessfulAt: staleFreshness.asOf,
          retryable: true,
        })),
      });
    }
    if (scenario === "empty") {
      return HttpResponse.json({
        ...analytics,
        customers: {
          ...analytics.customers,
          uniqueCustomersTotal: 0,
          iosCustomers: 0,
          androidCustomers: 0,
          iosOnlyCustomers: 0,
          androidOnlyCustomers: 0,
          multiPlatformCustomers: 0,
          activeCustomersTotal: 0,
          activeIosCustomers: 0,
          activeAndroidCustomers: 0,
          newCustomersTotal: 0,
          newIosCustomers: 0,
          newAndroidCustomers: 0,
        },
        regions: [
          {
            region: "customers" as const,
            availability: "empty" as const,
            retryable: true,
            message: "لا توجد بيانات عملاء للمنصة والفترة المحددة.",
          },
        ],
      });
    }
    return HttpResponse.json(analytics);
  }),

  http.get("/api/v1/admin/overview/activity", async ({ request }) => {
    const scenario = readScenario(request);
    const errorResponse = await scenarioResponse(scenario);
    if (errorResponse) return errorResponse;
    const platform = readPlatform(request);
    const period = readPeriod(request);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1") || 1;
    const pageSize = Math.min(
      25,
      Number(url.searchParams.get("pageSize") ?? "10") || 10,
    );
    const filtered = overviewActivityFixture.filter((item) => {
      if (platform === "all") return true;
      if (platform === "ios")
        return item.platformScope === "ios" || item.platformScope === "global";
      return (
        item.platformScope === "android" || item.platformScope === "global"
      );
    });
    void period;
    if (scenario === "empty") {
      return HttpResponse.json({
        ...paginate([], page, pageSize),
        region: {
          region: "activity" as const,
          availability: "empty" as const,
          retryable: true,
          message: "لا يوجد نشاط للمنصة والفترة المحددة.",
        },
      });
    }
    return HttpResponse.json({
      ...paginate(filtered, page, pageSize),
      region: availableRegion("activity"),
    });
  }),
];
