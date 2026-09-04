import { expect, test } from "@playwright/test";

const routes: readonly [string, string, "support-agent"?][] = [
  ["/admin", "صباح الخير"],
  ["/admin/users", "إدارة المستخدمين"],
  ["/admin/users/USR-10482", "نورة العتيبي"],
  ["/admin/access-requests", "طلبات الوصول المؤقت"],
  ["/admin/access-requests/ACC-1001", "طلب الوصول ACC-1001"],
  ["/admin/access-requests/ACC-1003/workspace", "مساحة الدعم المؤقتة", "support-agent"],
  ["/admin/imports", "الاستيراد"],
  ["/admin/system-health", "صحة النظام"],
  ["/admin/ai", "إدارة الذكاء الاصطناعي"],
  ["/admin/ai/failures", "إخفاقات الذكاء الاصطناعي"],
];

for (const [route, heading, role] of routes) {
  test(`${route} preserves its approved Arabic route`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    if (role) {
      await page.addInitScript((simulatedRole) => {
        sessionStorage.setItem("admin-simulated-role", simulatedRole);
      }, role);
    }
    await page.goto(route);

    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "تبديل المظهر" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "تغيير اللغة" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
}

test("/admin/imports retains its approved operational hierarchy after Spec 005", async ({ page }) => {
  await page.goto("/admin/imports");
  await expect(page.getByRole("heading", { level: 1, name: "الاستيراد والأتمتة" })).toBeVisible();
  await expect(page.locator(".metrics-grid .metric-card")).toHaveCount(4);
  await expect(page.locator(".chart-card")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "عمليات الاستيراد الفاشلة" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "تحليلات الاستيراد حسب المنصة" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Phase 9 routes preserve approved shell direction theme and overflow", async ({ page }, testInfo) => {
  test.skip(
    !["desktop-1440", "tablet-768", "mobile-390"].includes(testInfo.project.name),
    "Phase 9 visual preservation runs at the representative approved widths.",
  );
  const phase9Routes = [
    "/admin/admin-team",
    "/admin/admin-team/invite",
    "/admin/admin-team/ADM-DEMO-SECURITY-02",
    "/admin/roles",
    "/admin/roles/new",
    "/admin/roles/permissions",
    "/admin/roles/ROLE-DEMO-SUPPORT",
    "/admin/roles/ROLE-DEMO-CUSTOM-01/edit",
    "/admin/settings",
    "/admin/settings/mobile",
    "/admin/settings/feature-flags",
    "/admin/settings/imports",
    "/admin/settings/ai",
    "/admin/settings/subscriptions",
    "/admin/settings/security",
    "/admin/settings/maintenance",
  ] as const;

  for (const route of phase9Routes) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await page.locator(".topbar-actions > .icon-button").first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
