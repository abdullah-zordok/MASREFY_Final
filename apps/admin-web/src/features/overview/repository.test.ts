import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { mockServer } from "@/mocks/server";
import { overviewRepository } from "./repository";

const fresh = { state: "fresh", asOf: "2026-07-27T10:00:00+03:00" } as const;

describe("overview summary repository", () => {
  test("preserves exact server financial values, currency, and filter query", async () => {
    mockServer.use(
      http.get("/api/v1/admin/overview", ({ request }) => {
        const url = new URL(request.url);
        expect(Object.fromEntries(url.searchParams)).toEqual({
          platform: "android",
          period: "7d",
          locale: "en",
        });
        return HttpResponse.json({
          query: { platform: "android", period: "7d", locale: "en" },
          metrics: [],
          subscriptionRevenue: {
            paidCustomers: 3,
            freeCustomers: 7,
            recurringRevenue: 1234.56,
            currency: "AED",
            distribution: [{ plan: "paid", customers: 3, share: 1 }],
            revenueTrend: {
              id: "revenue",
              label: "Revenue",
              kind: "currency",
              unit: "AED",
              period: "7d",
              platformScope: "android",
              points: [{ timestamp: fresh.asOf, value: 1234.56 }],
              summary: "Exact owner aggregate",
            },
            freshness: fresh,
          },
          operationalMetrics: [],
          serviceHealth: [],
          regions: [
            { region: "revenue", availability: "available", retryable: true },
          ],
          freshness: fresh,
        });
      }),
    );
    const result = await overviewRepository.getOverviewSummary({
      platform: "android",
      period: "7d",
      locale: "en",
    });
    expect(result.subscriptionRevenue).toMatchObject({
      recurringRevenue: 1234.56,
      currency: "AED",
    });
  });

  test("serializes query, validates success, and returns authoritative totals", async () => {
    const result = await overviewRepository.getOverviewSummary({
      platform: "ios",
      period: "30d",
    });
    expect(result.query.platform).toBe("ios");
    expect(result.query.period).toBe("30d");
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.subscriptionRevenue.currency).toBe("SAR");
    expect(
      result.serviceHealth.every((svc) => svc.platformScope === "global"),
    ).toBe(true);
  });

  test("defaults platform=all, period=30d, locale=ar", async () => {
    const result = await overviewRepository.getOverviewSummary({});
    expect(result.query).toEqual({
      platform: "all",
      period: "30d",
      locale: "ar",
    });
  });

  test("rejects an invalid summary response with a safe validation error", async () => {
    mockServer.use(
      http.get("/api/v1/admin/overview", () =>
        HttpResponse.json({ metrics: [{ label: "broken" }] }),
      ),
    );
    await expect(
      overviewRepository.getOverviewSummary({}),
    ).rejects.toMatchObject({
      code: "contract_mismatch",
      status: 502,
    });
  });

  test("maps forbidden, unavailable, rate-limited, and internal-error to safe errors", async () => {
    await expect(
      overviewRepository.getOverviewSummary({ scenario: "forbidden" }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      overviewRepository.getOverviewSummary({ scenario: "unavailable" }),
    ).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    await expect(
      overviewRepository.getOverviewSummary({ scenario: "internal-error" }),
    ).rejects.toMatchObject({ code: "internal_error", status: 500 });
  });

  test("preserves an explicit partial region without inventing totals", async () => {
    const result = await overviewRepository.getOverviewSummary({
      scenario: "partial",
    });
    expect(result.regions).toContainEqual(
      expect.objectContaining({ region: "revenue", availability: "partial" }),
    );
  });
});

describe("platform analytics repository", () => {
  test("covers the all/ios/android x 7d/30d/90d matrix and overlap semantics", async () => {
    const platforms = ["all", "ios", "android"] as const;
    const periods = ["7d", "30d", "90d"] as const;
    for (const platform of platforms) {
      for (const period of periods) {
        const result = await overviewRepository.getPlatformAnalytics({
          platform,
          period,
        });
        expect(result.query.platform).toBe(platform);
        expect(result.query.period).toBe(period);
        const c = result.customers;
        expect(
          c.iosOnlyCustomers +
            c.androidOnlyCustomers +
            c.multiPlatformCustomers,
        ).toBe(c.uniqueCustomersTotal);
        expect(c.newIosCustomers + c.newAndroidCustomers).toBe(
          c.newCustomersTotal,
        );
        expect(result.errorRateTrend.points.length).toBeGreaterThan(0);
      }
    }
  });

  test("rejects an impossible customer breakdown regionally", async () => {
    await expect(
      overviewRepository.getPlatformAnalytics({
        platform: "all",
        scenario: "impossible",
      }),
    ).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("rejects malformed pagination-independent fields", async () => {
    mockServer.use(
      http.get("/api/v1/admin/overview/platform-analytics", () =>
        HttpResponse.json({
          query: { platform: "all", period: "30d", locale: "ar" },
          customers: { uniqueCustomersTotal: -1 },
        }),
      ),
    );
    await expect(
      overviewRepository.getPlatformAnalytics({}),
    ).rejects.toMatchObject({
      code: "contract_mismatch",
    });
  });
});

describe("overview activity repository", () => {
  test("returns bounded pagination and platform filtering", async () => {
    const first = await overviewRepository.getOverviewActivity({
      platform: "all",
      period: "30d",
      page: 1,
      pageSize: 5,
    });
    expect(first.pageSize).toBe(5);
    expect(first.items.length).toBeLessThanOrEqual(5);
    expect(first.region.region).toBe("activity");
    const androidOnly = await overviewRepository.getOverviewActivity({
      platform: "android",
      period: "30d",
      page: 1,
      pageSize: 25,
    });
    expect(
      androidOnly.items.every(
        (item) =>
          item.platformScope === "android" || item.platformScope === "global",
      ),
    ).toBe(true);
    expect(androidOnly).toMatchObject({ page: 1, pageSize: 25 });
  });

  test("maps empty, partial, forbidden, stale, and safe-error behavior", async () => {
    const empty = await overviewRepository.getOverviewActivity({
      platform: "all",
      period: "30d",
      scenario: "empty",
    });
    expect(empty.items).toEqual([]);
    expect(empty.region.availability).toBe("empty");
    await expect(
      overviewRepository.getOverviewActivity({
        platform: "all",
        period: "30d",
        scenario: "forbidden",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  test("rejects invalid page and pageSize", async () => {
    await expect(
      overviewRepository.getOverviewActivity({
        platform: "all",
        period: "30d",
        page: 0,
        pageSize: 10,
      }),
    ).rejects.toThrow();
  });
});

void fresh;
