import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Spec 002 overview journeys run once on the reference desktop.");
});

test("overview switches combined, iOS, and Android analytics without summing unique customers", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.locator("[data-spec='unique-customers-total']")).toContainText("128,450");
  await expect(page.locator("[data-spec='overlap-warning']")).toBeVisible();
  await expect(page.locator("[data-spec='global-health-label']")).toContainText(/Global|عام/);

  await page.getByRole("button", { name: "iOS" }).click();
  await expect(page.locator("[data-spec='unique-customers-total']")).toContainText("71,150");
  await expect(page.locator("[data-spec='adoption-summary']")).toContainText(/Shortcut|الاختصارات/);
  await expect(page.locator("[data-spec='adoption-summary']")).toContainText(/Share Extension|امتداد المشاركة/);
  await expect(page.locator("[data-spec='global-health-label']")).toContainText(/Global|عام/);

  await page.getByRole("button", { name: "Android" }).click();
  await expect(page.locator("[data-spec='unique-customers-total']")).toContainText("62,250");
  await expect(page.locator("[data-spec='adoption-summary']")).toContainText(/SMS Tracking|تتبع SMS/);
  await expect(page.locator("[data-spec='adoption-summary']")).toContainText(/Notification Listener|مستمع الإشعارات/);
  await expect(page.locator("[data-spec='global-health-label']")).toContainText(/Global|عام/);
});

test("activity pagination is bounded and resets when the platform changes", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.locator("[data-spec='activity-page']")).toContainText("1");
  await page.locator("[data-spec='activity-load-more']").click();
  await expect(page.locator("[data-spec='activity-page']")).toContainText("2");

  await page.getByRole("button", { name: "Android" }).click();
  await expect(page.locator("[data-spec='activity-page']")).toContainText("1");
});

test("aggregate export reaches a private short-lived download link", async ({ page }) => {
  await page.goto("/admin");
  await page.locator("[data-spec='overview-export']").click();
  await expect(page.locator("[data-spec='overview-export-download']")).toHaveAttribute(
    "href",
    /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\//,
  );
});
