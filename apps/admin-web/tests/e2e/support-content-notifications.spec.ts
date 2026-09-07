import { expect, test } from "@playwright/test";

const routes = [
  "/admin/support",
  "/admin/support/tickets",
  "/admin/support/tickets/TKT-1001",
  "/admin/support/categories",
  "/admin/feedback",
  "/admin/feedback/FDB-1001",
  "/admin/feedback/abuse",
  "/admin/content/categories",
  "/admin/content/categories/CAT-1001",
  "/admin/content/tips",
  "/admin/content/faqs",
  "/admin/content/onboarding",
  "/admin/content/help-center",
  "/admin/content/announcements",
  "/admin/content/email-templates",
  "/admin/content/push-templates",
  "/admin/notifications",
  "/admin/notifications/campaigns",
  "/admin/notifications/campaigns/new",
  "/admin/notifications/campaigns/CMP-1001",
  "/admin/notifications/transactional",
  "/admin/notifications/delivery-logs",
];

test("Phase 11 routes are available at five viewports and remain privacy-safe", async ({ page }) => {
  test.setTimeout(240_000);
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main"), route).not.toContainText(/rawPrompt|rawResponse|providerPayload|apiKey|deviceToken|emailAddress|secret|password|@example\.com/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true);
  }
});

test("Phase 11 notification campaign preview is aggregate-only and supports RTL/LTR", async ({ page }) => {
  await page.goto("/admin/notifications/campaigns/new");
  await expect(page.getByText(/مؤهل: 1280|Eligible: 1280/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/recipient|deviceToken|emailAddress|providerPayload/i);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("Phase 11 detail actions are keyboard operable and send only versioned reasoned payloads", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "action contracts are viewport-independent");
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    (window as typeof window & { phase11Requests: Array<{ url: string; body: Record<string, unknown> }> }).phase11Requests = [];
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/v1\/admin\/(?:support\/tickets|feedback|content|notifications\/campaigns)\/[^/]+\/actions$/.test(url)) {
        (window as typeof window & { phase11Requests: Array<{ url: string; body: Record<string, unknown> }> }).phase11Requests.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      }
      return originalFetch(input, init);
    };
  });
  for (const [route, label, action] of [
    ["/admin/support/tickets/TKT-1001", "حل التذكرة", "resolve"],
    ["/admin/feedback/FDB-1001", "مراجعة الملاحظة", "review"],
    ["/admin/content/categories/CAT-1001", "نشر", "publish"],
    ["/admin/notifications/campaigns/CMP-1001", "اعتماد", "approve"],
  ] as const) {
    await page.goto(route);
    const button = page.getByRole("button", { name: label });
    await button.focus();
    await expect(button).toBeFocused();
    await button.press("Enter");
    const request = await expect.poll(() => page.evaluate(() => (window as typeof window & { phase11Requests: Array<{ url: string; body: Record<string, unknown> }> }).phase11Requests.at(-1))).toEqual(expect.objectContaining({ body: expect.objectContaining({ action }) }));
    void request;
    const body = await page.evaluate(() => (window as typeof window & { phase11Requests: Array<{ url: string; body: Record<string, unknown> }> }).phase11Requests.at(-1)?.body);
    expect(body).toEqual(expect.objectContaining({ action, expectedVersion: expect.any(Number), reason: expect.stringMatching(/^.{10,500}$/) }));
    expect(Object.keys(body ?? {}).sort()).toEqual(["action", "expectedVersion", "reason"]);
  }
});

test("a billing-only role cannot read Phase 11 support or content details", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "permission matrix is viewport-independent");
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  for (const route of ["/admin/support/tickets/TKT-1001", "/admin/content/categories/CAT-1001"]) {
    await page.goto(route);
    await expect(page.getByRole("alert", { name: /لا تملك صلاحية الوصول|Access denied/i })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/private note|deviceToken|providerPayload/i);
  }
});
