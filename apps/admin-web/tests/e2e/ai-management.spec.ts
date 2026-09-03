import { expect, test } from "@playwright/test";

test("AI overview route exposes safe operational summary", async ({ page }) => {
  const startedAt = Date.now();
  await page.goto("/admin/ai");
  await expect(page.getByRole("heading", { name: "إدارة الذكاء الاصطناعي" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("article").filter({ hasText: "الطلبات الأصلية" }).first()).toBeVisible();
  await page.getByLabel("المنصة").selectOption("ios");
  await expect(page.getByText("المنصة ios، الفترة 30d")).toBeAttached();
  await page.getByLabel("الفترة").selectOption("7d");
  await expect(page.getByText("المنصة ios، الفترة 7d")).toBeAttached();
  await expect(page.getByRole("link", { name: "المزودون" })).toBeVisible();
  await expect(page.getByRole("link", { name: "فتح حالات الفشل" })).toBeVisible();
  await expect(page.getByText(/لا تعرض هذه الصفحة المطالبات/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/rawPrompt|providerPayload|apiKey|token/i);
  expect(Date.now() - startedAt).toBeLessThan(90_000);
});

test("all ten AI management routes are available and privacy-safe", async ({ page }) => {
  const routes = [
    "/admin/ai",
    "/admin/ai/providers",
    "/admin/ai/providers/AIP-OPENAI",
    "/admin/ai/models",
    "/admin/ai/prompts",
    "/admin/ai/prompts/AIPR-RECEIPT-AR-V3",
    "/admin/ai/usage",
    "/admin/ai/failures",
    "/admin/ai/reports",
    "/admin/ai/safety-rules",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body"), route).not.toContainText(
      /rawPrompt|rawResponse|providerPayload|apiKey|credential|secret/i,
    );
  }
  await page.getByRole("button", { name: "تغيير اللغة" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("AI metadata filters remain usable without exposing content", async ({ page }) => {
  await page.goto("/admin/ai/usage");
  await page.getByLabel("المنصة").selectOption("ios");
  await expect(page.locator("td:visible, .mobile-data-card:visible").filter({ hasText: "AIU-0001" }).first()).toBeVisible();
  const filters = page.getByLabel("عوامل تصفية الذكاء الاصطناعي");
  await filters.getByRole("textbox", { name: "بحث" }).fill("does-not-exist");
  await expect(page.getByRole("status")).toContainText("لا توجد سجلات مطابقة");
  await filters.getByRole("textbox", { name: "بحث" }).fill("");
  await page.getByLabel("الحالة").fill("succeeded");
  await expect(page.locator("td:visible, .mobile-data-card:visible").filter({ hasText: "AIU-0001" }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/rawPrompt|rawResponse|providerPayload|apiKey|credential/i);
});

test("AI configuration and triage actions require scoped confirmation", async ({ page }, testInfo) => {
  await page.goto("/admin/ai/providers/AIP-OPENAI");
  if (testInfo.project.use.viewport?.width === 390) {
    await expect(page.getByRole("note")).toContainText(/شاشة بعرض أكبر/);
    await expect(page.getByRole("button", { name: "update_fallback" })).toBeHidden();
    return;
  }
  const fallbackTrigger = page.getByRole("button", { name: "update_fallback" });
  await fallbackTrigger.click();
  const providerDialog = page.getByRole("dialog");
  await expect(providerDialog).toContainText("AIP-OPENAI");
  await expect(providerDialog).toContainText("ai.providers.manage");
  await expect(providerDialog).toContainText(/يطبّق التغيير على إعدادات المزود/);
  await providerDialog.getByLabel("سبب القرار").fill("تحديث مسار fallback التجريبي");
  await providerDialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(providerDialog).not.toBeVisible();
  await expect(fallbackTrigger).toBeFocused();
  await expect(page.locator("ul li").first()).toContainText("AIM-GPT-4O-MINI");

  await page.goto("/admin/ai/failures");
  const acknowledgeTrigger = page.getByRole("button", { name: "acknowledge" });
  await acknowledgeTrigger.click();
  const failureDialog = page.getByRole("dialog");
  await expect(failureDialog).toContainText("AIF-0001");
  await expect(failureDialog).toContainText("ai.failures.manage");
  await failureDialog.getByLabel("سبب القرار").fill("مراجعة الإخفاق التشغيلي");
  await failureDialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(failureDialog).not.toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("td:visible, .mobile-data-card:visible").filter({ hasText: "acknowledged" }).first()).toBeVisible();
});

test("prompt activation is gated by required fictional tests", async ({ page }, testInfo) => {
  await page.goto("/admin/ai/prompts");
  if (testInfo.project.use.viewport?.width === 390) {
    await expect(page.getByRole("note")).toContainText(/شاشة بعرض أكبر/);
    return;
  }

  const activate = page.getByRole("button", { name: "activate" });
  await activate.nth(1).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("سبب القرار").fill("محاولة تفعيل مع اختبار مطلوب فاشل");
  await dialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(page.getByText(/تعذر تسجيل القرار.*تحقق من الأهلية/)).toBeVisible();
  await dialog.getByRole("button", { name: "إلغاء" }).click();

  await activate.first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("سبب القرار").fill("جميع الاختبارات المطلوبة ناجحة");
  await dialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("tr:visible, .mobile-data-card:visible").filter({ hasText: "AIPR-CAT-EN-V2" }).first()).toContainText("active");
});
