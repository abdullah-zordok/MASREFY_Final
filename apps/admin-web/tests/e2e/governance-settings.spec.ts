import { expect, test, type Page } from "@playwright/test";

async function openInEnglish(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test("US1 admin team governance works in Arabic RTL, English LTR, keyboard dialogs, and mobile", async ({ page }, testInfo) => {
  await page.goto("/admin/admin-team");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("فريق الإدارة");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toContainText("n***@example.test");
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Admin Team");

  await page.getByRole("link", { name: /Salem Support/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Salem Support");
  await page.getByRole("button", { name: "Revoke sessions" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Revoke sessions" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Revoke sessions" })).toBeFocused();

  await openInEnglish(page, "/admin/admin-team/invite");
  await page.getByLabel("Email").fill("playwright.admin@example.test");
  await page.getByLabel("Name").fill("Playwright Admin");
  await page.getByRole("button", { name: "Create pending invitation" }).click();
  await expect(page.locator("main")).toContainText("Pending invitation created safely");

  if (testInfo.project.name === "mobile-390") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("US2 role governance reviews matrix and custom roles safely", async ({ page }, testInfo) => {
  await openInEnglish(page, "/admin/roles");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roles and Permissions");
  await expect(page.locator("main")).toContainText(/immutable/i);
  await expect(page.locator("body")).not.toContainText(/delete/i);

  await openInEnglish(page, "/admin/roles/permissions");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Permission Matrix");
  await expect(page.locator("main")).toContainText("admin-team.read");

  await openInEnglish(page, "/admin/roles/new");
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.locator("main")).toContainText("Role created safely");

  await openInEnglish(page, "/admin/roles/ROLE-DEMO-CUSTOM-RISK");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Risk Reviewer");
  if (testInfo.project.name === "mobile-390") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("US3 settings groups save changed fields safely", async ({ page }, testInfo) => {
  for (const route of [
    "/admin/settings",
    "/admin/settings/mobile",
    "/admin/settings/imports",
    "/admin/settings/ai",
    "/admin/settings/subscriptions",
    "/admin/settings/security",
  ]) {
    await openInEnglish(page, route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main")).toContainText("Version");
    await page.getByRole("button", { name: "Save changed fields" }).click();
    await expect(page.locator("main")).toContainText("Settings saved atomically");
    await expect(page.locator("body")).not.toContainText(/secret|api key|credential|token/i);
  }
  if (testInfo.project.name === "mobile-390") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("US4 feature flags and maintenance transitions are bounded", async ({ page }, testInfo) => {
  await openInEnglish(page, "/admin/settings/feature-flags");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Feature Flags");
  await expect(page.locator("main")).toContainText("Ended flag read-only");
  await page.getByRole("button", { name: "Update rollout" }).first().click();
  await expect(page.locator("main")).toContainText("Feature flag updated safely");
  await expect(page.locator("body")).not.toContainText(/customer id|custom audience/i);

  await openInEnglish(page, "/admin/settings/maintenance");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maintenance");
  await page.getByRole("button", { name: /Move to scheduled/ }).click();
  await expect(page.locator("main")).toContainText("Maintenance updated safely");
  if (testInfo.project.name === "mobile-390") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("US5 global search includes authorized admin users", async ({ page }, testInfo) => {
  await openInEnglish(page, "/admin");
  if (testInfo.project.name === "mobile-390") {
    await openInEnglish(page, "/admin/admin-team/ADM-DEMO-SECURITY-02");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Maha Security");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    return;
  }
  await page.locator(".global-search input").fill("Maha");
  await expect(page.locator(".search-results")).toContainText(/admin_user|Admin Users|Maha Security/);
  await page.getByRole("link", { name: /Maha Security/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maha Security");
});

test("US6 attention panel shows governance events and safe links", async ({ page }, testInfo) => {
  await openInEnglish(page, "/admin");
  await page.getByRole("button", { name: /الإشعارات|notifications/i }).click();
  const panel = page.getByRole("complementary", { name: /التنبيهات|Alerts/ });
  await expect(panel).toContainText("Admin role governance review requires attention.");
  await panel.getByRole("link", { name: /Admin role governance review/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Admin Team");
  if (testInfo.project.name === "mobile-390") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("US7 complete admin frontend traverses governance settings search and attention", async ({ page }, testInfo) => {
  await openInEnglish(page, "/admin/admin-team");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Admin Team");
  await page.getByRole("link", { name: /Maha Security/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Maha Security");

  await openInEnglish(page, "/admin/roles/permissions");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Permission Matrix");
  await expect(page.locator("main")).toContainText("settings.maintenance.manage");

  await openInEnglish(page, "/admin/settings/mobile");
  await page.getByRole("button", { name: "Save changed fields" }).click();
  await expect(page.locator("main")).toContainText("Settings saved atomically");

  await openInEnglish(page, "/admin");
  if (testInfo.project.name !== "mobile-390") {
    await page.locator(".global-search input").fill("Maha");
    await expect(page.locator(".search-results")).toContainText("Maha Security");
  }
  await page.locator(".notification").click();
  await expect(page.locator(".attention-panel")).toContainText("Admin role governance");

  await page.evaluate(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  await page.goto("/admin/roles");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
