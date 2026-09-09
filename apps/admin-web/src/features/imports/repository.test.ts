import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { resetPhase4State } from "@/mocks/phase4-import-state";
import { mockServer } from "@/mocks/server";
import { phase4OverviewFixtures } from "@/mocks/fixtures/imports";
import { importsRepository, phase4Repository } from "./repository";

function liveSession(id: string, startedAt: string) {
  return {
    id,
    sourceType: "sms" as const,
    sourceName: null,
    schemaVersion: 1 as const,
    status: "failed",
    itemCount: 1,
    acceptedCount: 0,
    rejectedCount: 1,
    attemptCount: 1,
    nextAttemptAt: startedAt,
    startedAt,
    completedAt: startedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
    version: 1,
  };
}

describe("imports repository", () => {
  beforeEach(() => {
    resetPhase4State();
    window.sessionStorage.clear();
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  afterEach(() => {
    window.sessionStorage.clear();
    delete process.env.NEXT_PUBLIC_ENABLE_MOCKS;
  });

  test("returns sanitized paginated records matching source filters", async () => {
    const result = await importsRepository.getImports({
      page: 1,
      pageSize: 25,
      platform: "android",
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.platform === "Android")).toBe(
      true,
    );
    expect(
      result.items.every((item) => !/\b\d{10,}\b/.test(item.sanitizedResult)),
    ).toBe(true);
  });

  test("supports empty and conflict scenarios", async () => {
    await expect(
      importsRepository.getImports({
        page: 1,
        pageSize: 25,
        scenario: "empty",
      }),
    ).resolves.toMatchObject({ items: [], totalItems: 0 });
    await expect(
      importsRepository.retryImport("IMP-77241", 1, "conflict"),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  test("denies the legacy imports overview when the simulated role cannot read imports", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "billing-operator");

    await expect(
      importsRepository.getImports({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("rejects a direct retry without confirmation and expected state", async () => {
    const response = await fetch("/api/v1/admin/imports/IMP-77241/retry", {
      method: "POST",
      headers: { "x-admin-simulated-role": "import-operator" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_error",
    });
  });
});

describe("Spec 005 repository boundaries", () => {
  beforeEach(() => {
    resetPhase4State();
    window.sessionStorage.clear();
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  });

  afterEach(() => {
    window.sessionStorage.clear();
    delete process.env.NEXT_PUBLIC_ENABLE_MOCKS;
  });

  test("returns authoritative combined, Android, and iOS overviews", async () => {
    const [combined, android, ios] = await Promise.all([
      phase4Repository.getOverview("all"),
      phase4Repository.getOverview("android"),
      phase4Repository.getOverview("ios"),
    ]);

    expect(combined.uniqueCustomers).not.toBe(
      android.uniqueCustomers + ios.uniqueCustomers,
    );
    expect(combined.uniqueCustomerSemantics).toBe("authoritative");
    expect(android.platform).toBe("android");
    expect(ios.platform).toBe("ios");
  });

  test.each([
    ["import-operator", "import-operator"],
    ["invalid-role", null],
  ])(
    "sends only allowlisted development role %s",
    async (storedRole, expectedHeader) => {
      let receivedRole: string | null = "not-observed";
      mockServer.use(
        http.get("/api/v1/admin/imports/overview", ({ request }) => {
          receivedRole = request.headers.get("x-admin-simulated-role");
          return HttpResponse.json(phase4OverviewFixtures.all);
        }),
      );
      window.sessionStorage.setItem("admin-simulated-role", storedRole);

      await phase4Repository.getOverview("all");

      expect(receivedRole).toBe(expectedHeader);
    },
  );

  test("serializes validated filters and returns bounded session pages", async () => {
    const response = await phase4Repository.list("sessions", {
      platform: "android",
      source: "android_sms",
      parserVersionId: "PV-3182",
      appVersion: "4.8.1",
      dateFrom: "2026-07-29",
      dateTo: "2026-07-29",
      sort: "appVersion",
      order: "asc",
      page: 1,
      pageSize: 25,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: "IMP-77241",
      platform: "android",
      source: "android_sms",
    });
    expect(response.totalPages).toBe(1);
  });

  test("supports large pages and filtered pagination without leaking fixtures", async () => {
    const firstPage = await phase4Repository.list("sessions", {
      scenario: "large",
      page: 1,
      pageSize: 50,
      sort: "id",
      order: "asc",
    });
    const secondPage = await phase4Repository.list("sessions", {
      scenario: "large",
      page: 2,
      pageSize: 50,
      sort: "id",
      order: "asc",
    });

    expect(firstPage.items).toHaveLength(50);
    expect(secondPage.items).toHaveLength(50);
    expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
  });

  test("rejects unsafe response scenarios at the production schema boundary", async () => {
    await expect(
      phase4Repository.list("sessions", {
        page: 1,
        pageSize: 25,
        scenario: "unsafe-response",
      }),
    ).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("receives structurally reduced records for limited support access", async () => {
    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    const response = await phase4Repository.list("sessions", {
      page: 1,
      pageSize: 25,
    });

    expect(response.items[0].accessLevel).toBe("limited");
    expect(response.items[0].preview).toBeUndefined();
    expect(response.items[0].definition).toBeUndefined();
    expect(response.items[0].actions).toEqual([]);
  });

  test("uses production cursor, filter, publish, and idempotency contracts when mocks are disabled", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    let sessionRequest = 0;
    let publishBody: unknown;
    let publishKey: string | null = null;
    mockServer.use(
      http.get("/api/v1/admin/imports/sessions", ({ request }) => {
        sessionRequest += 1;
        const url = new URL(request.url);
        expect(url.searchParams.get("limit")).toBe("100");
        expect(url.searchParams.get("status")).toBe("failed");
        expect(url.searchParams.get("sourceType")).toBe("sms");
        expect(url.searchParams.get("cursor")).toBe(
          sessionRequest === 1 ? null : "cursor-1",
        );
        expect(request.headers.get("x-admin-simulated-role")).toBeNull();
        return HttpResponse.json({
          items:
            sessionRequest === 1
              ? [liveSession("IMP-LIVE-1", "2026-09-02T10:00:00Z")]
              : [liveSession("IMP-LIVE-2", "2026-09-02T09:00:00Z")],
          nextCursor: sessionRequest === 1 ? "cursor-1" : null,
        });
      }),
      http.post(
        "/api/v1/admin/parsers/versions/:versionId/publish",
        async ({ request }) => {
          publishBody = await request.json();
          publishKey = request.headers.get("idempotency-key");
          return HttpResponse.json({
            operationId: "80000000-0000-4000-8000-000000000080",
            replayed: false,
            requestId: "admin-live-publish",
            occurredAt: "2026-09-02T10:01:00.000Z",
            resource: {
              ruleId: "80000000-0000-4000-8000-000000000081",
              versionId: "PV-3182",
              status: "active",
              versionNumber: 3,
              publishedAt: "2026-09-02T10:01:00.000Z",
            },
          });
        },
      ),
    );

    const page = await phase4Repository.list("sessions", {
      status: "failed",
      source: "android_sms",
      page: 1,
      pageSize: 25,
    });
    expect(page.items.map((item) => item.id)).toEqual([
      "IMP-LIVE-1",
      "IMP-LIVE-2",
    ]);
    await expect(
      phase4Repository.act("versions", "PV-3182", {
        action: "release",
        expectedState: "testing",
        expectedRevision: 3,
        reason: "Publishing a fully passing parser corpus",
      }),
    ).resolves.toMatchObject({ affectedId: "PV-3182", currentState: "active" });
    expect(publishBody).toEqual({
      action: "publish",
      reason: "Publishing a fully passing parser corpus",
      expectedVersion: 3,
    });
    expect(publishKey).toBe("tracking-admin:versions:PV-3182:release:3");
  });

  test("retries a live failed session with its current revision and a stable key", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    let body: unknown;
    let key: string | null = null;
    mockServer.use(
      http.post(
        "/api/v1/admin/imports/sessions/:sessionId/retry-handoff",
        async ({ request }) => {
          body = await request.json();
          key = request.headers.get("idempotency-key");
          return HttpResponse.json({
            operationId: "80000000-0000-4000-8000-000000000070",
            replayed: false,
            requestId: "admin-live-retry",
            occurredAt: "2026-09-02T10:02:00.000Z",
            resource: {
              ...liveSession("IMP-LIVE-7", "2026-09-02T10:00:00.000Z"),
              status: "received",
              updatedAt: "2026-09-02T10:02:00.000Z",
              version: 8,
            },
          });
        },
      ),
    );

    await importsRepository.retryImport("IMP-LIVE-7", 7);

    expect(body).toEqual({
      action: "retry_handoff",
      reason: "إعادة محاولة مؤكدة من واجهة الإدارة التجريبية",
      expectedVersion: 7,
    });
    expect(key).toBe("tracking-admin:sessions:IMP-LIVE-7:retry_handoff:7");
  });

  test("rejects incomplete live overview, detail, and mutation responses", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/imports/overview", () =>
        HttpResponse.json({
          totalSessions: 4,
          uniqueCustomers: 2,
          totalItems: 9,
          failedSessions: 1,
          highestFailureSource: "sms",
        }),
      ),
      http.get("/api/v1/admin/imports/sessions/:sessionId", () =>
        HttpResponse.json({
          id: "IMP-LIVE-9",
          sourceType: "sms",
          status: "failed",
          startedAt: "2026-09-02T10:00:00.000Z",
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
          version: 1,
        }),
      ),
      http.post("/api/v1/admin/imports/sessions/:sessionId/retry-handoff", () =>
        HttpResponse.json({
          resource: { id: "IMP-LIVE-9", status: "received" },
        }),
      ),
    );

    await expect(phase4Repository.getOverview("all")).rejects.toMatchObject({
      code: "contract_mismatch",
    });
    await expect(
      phase4Repository.getDetail("sessions", "IMP-LIVE-9"),
    ).rejects.toMatchObject({ code: "contract_mismatch" });
    await expect(
      phase4Repository.act("sessions", "IMP-LIVE-9", {
        action: "retry_handoff",
        expectedState: "failed",
        expectedRevision: 1,
        reason: "Retry after reviewing the failed import",
      }),
    ).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("maps exact live overview and session detail fields without defaults", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/imports/overview", () =>
        HttpResponse.json({
          totalSessions: 4,
          uniqueCustomers: 2,
          totalItems: 9,
          failedSessions: 1,
          reviewSessions: 2,
          highestFailureSource: "sms",
        }),
      ),
      http.get("/api/v1/admin/imports/sessions/:sessionId", () =>
        HttpResponse.json({
          ...liveSession("IMP-LIVE-10", "2026-09-02T10:00:00.000Z"),
          itemCount: 6,
          acceptedCount: 4,
          rejectedCount: 2,
          completedAt: "2026-09-02T10:03:00.000Z",
          updatedAt: "2026-09-02T10:03:00.000Z",
        }),
      ),
    );

    await expect(phase4Repository.getOverview("all")).resolves.toMatchObject({
      platform: "all",
      uniqueCustomers: 2,
      totalSessions: 4,
      totalItems: 9,
      failedSessions: 1,
      highestFailureSource: "sms",
    });
    await expect(
      phase4Repository.getDetail("sessions", "IMP-LIVE-10"),
    ).resolves.toMatchObject({
      totalItems: 6,
      successfulItems: 4,
      failedItems: 2,
      timeline: [
        {
          label: "started",
          timestamp: "2026-09-02T10:00:00.000Z",
          status: "completed",
        },
        {
          label: "completed",
          timestamp: "2026-09-02T10:03:00.000Z",
          status: "failed",
        },
      ],
    });
    await expect(phase4Repository.getOverview("ios")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });

  test("keeps unavailable legacy import columns absent in live mode", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/imports/overview", () =>
        HttpResponse.json({
          totalSessions: 1,
          uniqueCustomers: 1,
          totalItems: 1,
          failedSessions: 1,
          reviewSessions: 0,
          highestFailureSource: "sms",
        }),
      ),
      http.get("/api/v1/admin/imports/sessions", () =>
        HttpResponse.json({
          items: [liveSession("IMP-LIVE-11", "2026-09-02T10:00:00.000Z")],
          nextCursor: null,
        }),
      ),
    );

    const result = await importsRepository.getImports({
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]).toMatchObject({
      id: "IMP-LIVE-11",
      source: "sms",
      platform: "Android",
      attempts: 1,
      status: "failed",
    });
    expect(result.items[0]).not.toHaveProperty("user");
    expect(result.items[0]).not.toHaveProperty("bank");
    expect(result.items[0]).not.toHaveProperty("parserVersion");
    expect(result.items[0]).not.toHaveProperty("appVersion");
  });

  test("traverses the complete live cursor set before reporting exact page totals", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    const at = "2026-09-02T10:00:00.000Z";
    const records = Array.from({ length: 30 }, (_, index) => ({
      id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sourceType: "sms",
      sourceName: null,
      schemaVersion: 1,
      status: "failed",
      itemCount: 1,
      acceptedCount: 0,
      rejectedCount: 1,
      attemptCount: 1,
      nextAttemptAt: at,
      startedAt: at,
      completedAt: at,
      createdAt: at,
      updatedAt: at,
      version: 1,
    }));
    let calls = 0;
    mockServer.use(
      http.get("/api/v1/admin/imports/sessions", ({ request }) => {
        calls += 1;
        const url = new URL(request.url);
        expect(url.searchParams.get("limit")).toBe("100");
        expect(url.searchParams.get("status")).toBe("failed");
        expect(url.searchParams.get("sourceType")).toBe("sms");
        return HttpResponse.json({ items: records, nextCursor: null });
      }),
    );

    const result = await phase4Repository.list("sessions", {
      status: "failed",
      source: "android_sms",
      page: 2,
      pageSize: 25,
    });

    expect(calls).toBe(1);
    expect(result.items).toHaveLength(5);
    expect(result.totalItems).toBe(30);
    expect(result.totalPages).toBe(2);
  });

  test("rejects sensitive or incomplete live records without synthetic defaults", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/imports/sessions", () =>
        HttpResponse.json({
          items: [
            {
              id: "80000000-0000-4000-8000-000000000001",
              sourceType: "sms",
              status: "failed",
              requestHash: "must-not-cross-the-boundary",
            },
          ],
          nextCursor: null,
        }),
      ),
    );

    await expect(
      phase4Repository.list("sessions", { page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  test("derives test-case state from enabled and leaves revisionless failures unavailable", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    let failureRequests = 0;
    mockServer.use(
      http.get("/api/v1/admin/parsers/test-cases", () =>
        HttpResponse.json({
          items: [
            {
              id: "80000000-0000-4000-8000-000000000091",
              parserVersionId: "80000000-0000-4000-8000-000000000092",
              name: "Expense parser",
              enabled: false,
              lastResult: null,
              lastRunAt: null,
              createdAt: "2026-09-02T10:00:00.000Z",
              updatedAt: "2026-09-02T10:00:00.000Z",
              version: 3,
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get("/api/v1/admin/imports/failures", () => {
        failureRequests += 1;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await expect(
      phase4Repository.list("test-cases", { page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      items: [{ status: "inactive", revision: 3 }],
    });
    await expect(
      phase4Repository.list("failures", { page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(failureRequests).toBe(0);
  });

  test("encodes and validates session detail identifiers", async () => {
    await expect(
      phase4Repository.getDetail("sessions", "IMP-77241"),
    ).resolves.toMatchObject({
      id: "IMP-77241",
      expectedCurrentState: "failed",
    });
    expect(() => phase4Repository.getDetail("sessions", "../unsafe")).toThrow();
  });

  test("locks actions behind confirmation and expected revision", async () => {
    await expect(
      phase4Repository.act("sessions", "IMP-77241", {
        action: "retry_handoff",
        expectedState: "failed",
        expectedRevision: 1,
        reason: "إعادة محاولة تشغيلية",
      }),
    ).resolves.toMatchObject({
      affectedId: "IMP-77241",
      previousState: "failed",
      currentState: "processing",
      outcome: "success",
    });

    await expect(
      phase4Repository.act("sessions", "IMP-77241", {
        action: "retry_handoff",
        expectedState: "failed",
        expectedRevision: 1,
        reason: "إرسال مكرر",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  test("enforces version tests, active-scope uniqueness, and rollback lineage", async () => {
    await expect(
      phase4Repository.act("versions", "PV-3183", {
        action: "release",
        expectedState: "draft",
        expectedRevision: 1,
        reason: "إصدار غير مؤهل",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await phase4Repository.act("versions", "PV-3182", {
      action: "retire",
      expectedState: "active",
      expectedRevision: 1,
      reason: "إحالة الإصدار النشط للتقاعد",
    });
    await phase4Repository.act("versions", "PV-3183", {
      action: "test",
      expectedState: "draft",
      expectedRevision: 1,
      reason: "تشغيل الاختبارات المطلوبة",
    });
    await expect(
      phase4Repository.act("versions", "PV-3183", {
        action: "release",
        expectedState: "testing",
        expectedRevision: 2,
        reason: "الإصدار بعد نجاح الاختبارات",
      }),
    ).resolves.toMatchObject({ currentState: "active" });
    await expect(
      phase4Repository.act("versions", "PV-3182", {
        action: "rollback",
        expectedState: "retired",
        expectedRevision: 2,
        reason: "إنشاء مسودة تراجع",
      }),
    ).resolves.toMatchObject({ createdDraftId: "PV-RB-001" });
  });

  test("rejects overlapping sender and category patterns through handlers", async () => {
    await expect(
      phase4Repository.act("senders", "SND-001", {
        action: "save",
        expectedState: "active",
        expectedRevision: 1,
        reason: "اختبار تعارض نمط مرسل",
        proposal: { pattern: "^ALT-DEMO$" },
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await expect(
      phase4Repository.act("category-rules", "CR-001", {
        action: "save",
        expectedState: "active",
        expectedRevision: 1,
        reason: "اختبار تعارض نمط تصنيف",
        proposal: { pattern: "demo-transport" },
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
