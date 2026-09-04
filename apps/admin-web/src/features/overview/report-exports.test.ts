import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";

import { mockServer } from "@/mocks/server";
import { reportExportsRepository } from "./report-exports";

const id = "99000000-0000-4000-8000-000000000001";
const now = "2026-09-04T00:00:00.000Z";

describe("Admin report exports", () => {
  test("requests, polls, and returns only a fresh private link", async () => {
    mockServer.use(
      http.post("/api/v1/admin/exports", () =>
        HttpResponse.json(
          {
            attemptId: id,
            status: "queued",
            ledgerVersion: 0,
            schemaVersion: 1,
            generatedAt: now,
          },
          { status: 202 },
        ),
      ),
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
        }),
      ),
    );
    const accepted = await reportExportsRepository.request({
      exportType: "overview",
      period: "30d",
      platform: "all",
      format: "csv",
    });
    await expect(
      reportExportsRepository.wait(accepted.attemptId, {
        sleep: async () => {},
      }),
    ).resolves.toMatchObject({
      status: "ready",
      downloadUrl: expect.stringMatching(/^https:/),
    });
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
