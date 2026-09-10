import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, test, vi } from "vitest";

import { mockServer } from "@/mocks/server";
import { reportExportsRepository } from "./report-exports";

const id = "99000000-0000-4000-8000-000000000001";
const now = "2026-09-04T00:00:00.000Z";

afterEach(() => vi.useRealTimers());

describe("Admin report exports", () => {
  test("requests, polls, and returns only a fresh private link", async () => {
    vi.useFakeTimers().setSystemTime(new Date(now));
    mockServer.use(
      http.post("/api/v1/admin/exports", async ({ request }) => {
        expect(await request.json()).toEqual({
          exportType: "overview",
          period: "30d",
          platform: "all",
          format: "csv",
        });
        return HttpResponse.json(
          {
            attemptId: id,
            status: "queued",
            ledgerVersion: 41,
            schemaVersion: 1,
            generatedAt: now,
          },
          { status: 202 },
        );
      }),
      http.get(`/api/v1/admin/exports/${id}`, () =>
        HttpResponse.json({
          id,
          reportType: "account_activity",
          format: "csv",
          delivery: "download",
          status: "ready",
          metadata: {},
          requestedAt: now,
          expiresAt: "2026-09-05T00:00:00.000Z",
          downloadUrl:
            "https://project.supabase.co/storage/v1/object/sign/report-exports/key?token=opaque",
          downloadUrlExpiresAt: "2026-09-04T00:05:00.000Z",
        }),
      ),
    );
    const accepted = await reportExportsRepository.request({
      exportType: "overview",
      period: "30d",
      platform: "all",
      format: "csv",
    });
    expect(accepted).toMatchObject({ ledgerVersion: 41, schemaVersion: 1 });
    await expect(
      reportExportsRepository.wait(accepted.attemptId, {
        sleep: async () => {},
      }),
    ).resolves.toMatchObject({
      status: "ready",
      downloadUrl: expect.stringMatching(/^https:/),
      downloadUrlExpiresAt: "2026-09-04T00:05:00.000Z",
    });
  });

  test("rejects expired, overlong, and incomplete signed-link states", async () => {
    vi.useFakeTimers().setSystemTime(new Date(now));
    for (const status of [
      {
        downloadUrl: "https://project.supabase.co/private",
        downloadUrlExpiresAt: "2026-09-03T23:59:59.000Z",
      },
      {
        downloadUrl: "https://project.supabase.co/private",
        downloadUrlExpiresAt: "2026-09-04T00:15:01.000Z",
      },
      { downloadUrl: "https://project.supabase.co/private" },
    ]) {
      mockServer.use(
        http.get(`/api/v1/admin/exports/${id}`, () =>
          HttpResponse.json({
            id,
            reportType: "account_activity",
            format: "csv",
            delivery: "download",
            status: "ready",
            metadata: {},
            requestedAt: now,
            expiresAt: "2026-09-05T00:00:00.000Z",
            ...status,
          }),
        ),
      );
      await expect(reportExportsRepository.get(id)).rejects.toThrow();
    }
  });

  test("bounds polling work before making a request", async () => {
    await expect(
      reportExportsRepository.wait(id, { attempts: 0 }),
    ).rejects.toThrow("report_export_poll_invalid");
    await expect(
      reportExportsRepository.wait(id, { attempts: 101 }),
    ).rejects.toThrow("report_export_poll_invalid");
    await expect(
      reportExportsRepository.wait(id, { delayMs: -1 }),
    ).rejects.toThrow("report_export_poll_invalid");
  });

  test("requires explicit support context only for user-level exports", () => {
    expect(() =>
      reportExportsRepository.request({
        exportType: "user_report",
        period: "30d",
        platform: "all",
        format: "json",
      }),
    ).toThrow();
    expect(() =>
      reportExportsRepository.request({
        exportType: "overview",
        period: "30d",
        platform: "all",
        format: "json",
        userId: "target",
        supportReason: "Customer approved request",
      }),
    ).toThrow();
  });
});
