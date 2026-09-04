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

test("Spec 007 routes are available, responsive, and privacy-safe", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main"), route).not.toContainText(/rawPrompt|rawResponse|providerPayload|apiKey|deviceToken|emailAddress|secret|password|@example\.com/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true);
  }
});

test("Spec 007 notification campaign preview is aggregate-only and supports LTR toggle", async ({ page }) => {
  await page.goto("/admin/notifications/campaigns/new");
  await expect(page.getByText(/مؤهل: 1280|Eligible: 1280/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/recipient|deviceToken|emailAddress|providerPayload/i);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
