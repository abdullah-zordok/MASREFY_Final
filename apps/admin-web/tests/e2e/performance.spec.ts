import { expect, test } from "@playwright/test";

test("reference shell and local interactions meet Phase 0 responsiveness gates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Performance gate uses the documented reference viewport.");
  await page.goto("/admin");
  await expect(page.locator("[data-admin-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const shellVisibleMs = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return performance.now() - navigation.responseEnd;
  });

  const acknowledgementMs = await page
    .locator(".topbar-actions > .icon-button")
    .nth(1)
    .evaluate(async (button) => {
      const interactionStarted = performance.now();
      (button as HTMLElement).click();
      await new Promise(requestAnimationFrame);
      return performance.now() - interactionStarted;
    });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  expect(shellVisibleMs).toBeLessThanOrEqual(2_500);
  expect(acknowledgementMs).toBeLessThanOrEqual(200);
});

test("standard AI overview, detail, and filtering meet Phase 5 p95 gates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Performance sampling uses the documented reference viewport.");
  await page.goto("/admin/ai");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const samples = await page.evaluate(async () => {
    const timings = { readiness: [] as number[], filters: [] as number[] };
    for (let index = 0; index < 20; index += 1) {
      let started = performance.now();
      const overview = await fetch("/api/v1/admin/ai/overview?platform=all&period=30d");
      const provider = await fetch("/api/v1/admin/ai/providers/AIP-OPENAI");
      if (!overview.ok || !provider.ok) throw new Error(`AI readiness sample failed: ${overview.status}/${provider.status}`);
      timings.readiness.push(performance.now() - started);

      started = performance.now();
      const validFiltered = await fetch("/api/v1/admin/ai/usage?page=1&pageSize=25&platform=ios&search=Usage&sort=updatedAt&order=desc");
      if (!validFiltered.ok) throw new Error("AI filter sample failed");
      timings.filters.push(performance.now() - started);
    }
    return timings;
  });
  const p95 = (values: number[]) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
  expect(p95(samples.readiness)).toBeLessThanOrEqual(2_000);
  expect(p95(samples.filters)).toBeLessThanOrEqual(1_000);
});

test("Phase 9 representative endpoints meet usable mock response gates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Phase 9 performance sampling uses the documented reference viewport.");
  await page.goto("/admin/admin-team");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const samples = await page.evaluate(async () => {
    const endpoints = [
      "/api/v1/admin/admin-users?page=1&pageSize=25",
      "/api/v1/admin/permissions",
      "/api/v1/admin/settings/mobile",
      "/api/v1/admin/feature-flags?page=1&pageSize=25",
      "/api/v1/admin/maintenance",
      "/api/v1/admin/search?q=Maha",
      "/api/v1/admin/attention",
    ];
    const timings: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const started = performance.now();
      const responses = await Promise.all(endpoints.map((endpoint) => fetch(endpoint)));
      if (responses.some((response) => !response.ok)) throw new Error("Phase 9 endpoint sample failed");
      timings.push(performance.now() - started);
    }
    return timings;
  });

  const p95 = [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1];
  expect(p95).toBeLessThanOrEqual(2_000);
});
