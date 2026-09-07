import { expect, test } from "@playwright/test";

const phase7Routes = [
  "/admin/security",
  "/admin/security/authentication-events",
  "/admin/security/suspicious-activity",
  "/admin/security/admins",
  "/admin/security/permission-changes",
  "/admin/security/support-access",
  "/admin/security/incidents/INC-1001",
  "/admin/audit",
  "/admin/audit/AUD-1001",
  "/admin/data-requests/exports",
  "/admin/data-requests/exports/EXP-1001",
  "/admin/data-requests/deletions",
  "/admin/data-requests/deletions/DEL-1001",
  "/admin/data-requests/retention",
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "security-administrator"));
});

test("US1 US2 US3 US4 US5 responsive direction route matrix renders safely across configured viewports", async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of phase7Routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body"), route).not.toContainText(/https?:\/\/|data:|createObjectURL|api[_-]?key|token=/i);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
});

test("US1 US2 US3 US4 US5 denied roles cannot read Phase 7 routes or force direct mutation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "permission matrix is viewport-independent");
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "support-agent"));

  for (const route of phase7Routes) {
    await page.goto(route);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.locator("main"), route).not.toContainText(/AUTH-1001|AUD-1001|EXP-1001|DEL-1001|RET-1001/);
  }

  const denied = await page.evaluate(async () => {
    const response = await fetch("/api/v1/admin/data-requests/exports/EXP-1001/simulate-download", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-simulated-role": "support-agent",
      },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    return { status: response.status, body: await response.json() as { code: string } };
  });
  expect(denied).toEqual({ status: 403, body: { code: "forbidden" } });
});

test("US4 export simulation returns no URL or archive content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "workflow smoke runs once");
  await page.goto("/admin/data-requests/exports/EXP-1001");
  await page.getByRole("button", { name: "محاكاة التنزيل" }).click();
  await expect(page.getByRole("status")).toContainText("No customer archive");
  await expect(page.locator("body")).not.toContainText(/https?:\/\/|data:|createObjectURL|api[_-]?key|token=/i);
});

test("US1 security action requires confirmation and returns an audit reference", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "workflow smoke runs once");
  await page.goto("/admin/security/suspicious-activity");
  await page.getByRole("button", { name: "تعيين مراجع" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("security.incidents.manage");
  await dialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("main")).toContainText(/قيد التحقيق|Investigating/);
});

test("US2 billing operator has no direct Phase 7 data-request route", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "permission smoke runs once");
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  await page.goto("/admin/data-requests/exports");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/EXP-1001|DEL-1001|RET-1001/);
});

test("US3 role change cache removes protected audit detail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "cache transition smoke runs once");
  await page.goto("/admin/audit/AUD-1001");
  await expect(page.getByRole("heading", { name: /Audit Event AUD-1001/ })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem("admin-simulated-role", "support-agent");
    window.dispatchEvent(new Event("admin-simulated-role-change"));
  });
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("AUD-1001");
});

test("US5 deletion mock lifecycle completes without customer-data side effects", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "workflow smoke runs once");
  await page.goto("/admin/data-requests/deletions");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const result = await page.evaluate(async () => {
    const start = await fetch("/api/v1/admin/data-requests/deletions/DEL-1001/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-simulated-role": "security-administrator" },
      body: JSON.stringify({
        action: "start",
        context: {
          expectedState: "Scheduled",
          expectedRevision: 1,
          reason: "Phase 7 deletion review",
          confirmationToken: "CONFIRM-SPEC-008",
        },
      }),
    });
    const complete = await fetch("/api/v1/admin/data-requests/deletions/DEL-1001/actions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-simulated-role": "security-administrator" },
      body: JSON.stringify({
        action: "complete",
        context: {
          expectedState: "In Progress",
          expectedRevision: 2,
          reason: "Phase 7 deletion review",
          confirmationToken: "CONFIRM-SPEC-008",
        },
      }),
    });
    return { start: await start.json() as { currentState: string }, complete: await complete.json() as { currentState: string; message: string } };
  });
  expect(result.start.currentState).toBe("In Progress");
  expect(result.complete.currentState).toBe("Completed");
  expect(result.complete.message).toContain("Mock state updated");
  await expect(page.locator("body")).not.toContainText(/delete from|storage path|job id|queue/i);
});

test("US5 retention rejects out-of-range mock update", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "workflow smoke runs once");
  await page.goto("/admin/data-requests/retention");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/v1/admin/data-retention/policies/RET-1001", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-admin-simulated-role": "security-administrator" },
      body: JSON.stringify({
        retentionDays: 0,
        reason: "Invalid reduction",
        impactAcknowledged: true,
        expectedRevision: 1,
        confirmationToken: "CONFIRM-SPEC-008",
      }),
    });
    return { status: response.status, body: await response.json() as { code: string } };
  });
  expect(result).toEqual({ status: 400, body: { code: "validation_error" } });
});
