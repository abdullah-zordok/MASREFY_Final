import { beforeEach, describe, expect, test } from "vitest";
import { resetPhase2MockState } from "@/mocks/phase2-state";
import { accessRepository } from "./repository";

describe("access repository", () => {
  beforeEach(resetPhase2MockState);

  test("lists only support actor-visible masked requests", async () => {
    const page = await accessRepository.listRequests({}, "support-agent");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((request) =>
      request.requestedBy === "ADM-DEMO-SUPPORT" || request.assignee === "ADM-DEMO-SUPPORT")).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/@(?!(?:example\.test))/);
  });

  test("supports empty, large, slow, and partial list scenarios", async () => {
    await expect(accessRepository.listRequests({ scenario: "empty" }, "super-admin"))
      .resolves.toMatchObject({ items: [], region: { availability: "empty" } });
    await expect(accessRepository.listRequests({ scenario: "large", pageSize: 100 }, "super-admin"))
      .resolves.toMatchObject({ pagination: { totalItems: 120 } });
    await expect(accessRepository.listRequests({ scenario: "slow" }, "super-admin"))
      .resolves.toMatchObject({ region: { availability: "available" } });
    await expect(accessRepository.listRequests({ scenario: "partial" }, "super-admin"))
      .resolves.toMatchObject({ region: { availability: "partial" } });
  });

  test.each([
    ["validation", "validation_error", 400],
    ["forbidden", "forbidden", 403],
    ["conflict", "conflict", 409],
    ["rate-limit", "rate_limited", 429],
    ["unavailable", "provider_unavailable", 503],
    ["internal-error", "internal_error", 500],
    ["unsafe-response", "contract_mismatch", 502],
  ] as const)("maps the %s scenario to a safe error", async (scenario, code, status) => {
    await expect(accessRepository.listRequests({ scenario }, "super-admin"))
      .rejects.toMatchObject({ code, status });
  });

  test("returns a safe not-found error for an unknown request", async () => {
    await expect(accessRepository.getRequest("ACC-9999", "super-admin"))
      .rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  test("creates and reads a request through parsed boundaries", async () => {
    const created = await accessRepository.createRequest({
      userId: "USR-10461",
      supportTicketId: "TKT-12002",
      assignee: "ADM-DEMO-SECURITY",
      reason: "طلب دعم موثق لمراجعة إعداد الجهاز",
      requestedScope: ["device-diagnostics"],
      maskingRequired: true,
      durationMinutes: 20,
      customerApprovalRequired: false,
    }, "support-agent");
    await expect(accessRepository.getRequest(created.id, "support-agent")).resolves.toMatchObject({ id: created.id });
  });

  test("rejects duplicate and forbidden operations safely", async () => {
    await expect(accessRepository.createRequest({
      userId: "USR-10482",
      supportTicketId: "TKT-12001",
      assignee: "ADM-DEMO-SUPPORT",
      reason: "طلب دعم موثق محدود النطاق",
      requestedScope: ["profile-contact"],
      maskingRequired: true,
      durationMinutes: 30,
      customerApprovalRequired: false,
    }, "support-agent")).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(accessRepository.listRequests({}, "billing-operator"))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  test("allows a separate approver to reduce and approve", async () => {
    const approved = await accessRepository.decideRequest("ACC-1001", {
      decision: "approve",
      reason: "تمت مراجعة الطلب",
      approvedScope: ["profile-contact"],
      durationMinutes: 10,
      startsAt: new Date(Date.now() - 1_000).toISOString(),
    }, "security-administrator");
    expect(approved).toMatchObject({
      status: "approved",
      approvedScope: ["profile-contact"],
      approvedDurationMinutes: 10,
    });
  });

  test("projects and ends only the assignee workspace", async () => {
    const workspace = await accessRepository.getWorkspace("ACC-1003", "support-agent");
    expect(workspace.sections.map((section) => section.scope)).toEqual(workspace.approvedScope);
    await expect(accessRepository.getWorkspace("ACC-1003", "security-administrator"))
      .rejects.toMatchObject({ code: "forbidden" });
    await expect(accessRepository.endAccess("ACC-1003", {}, "support-agent"))
      .resolves.toMatchObject({ status: "revoked" });
    await expect(accessRepository.getWorkspace("ACC-1003", "support-agent"))
      .rejects.toMatchObject({ code: "conflict" });
  });
});
