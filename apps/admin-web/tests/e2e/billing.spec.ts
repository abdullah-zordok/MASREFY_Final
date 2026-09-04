import { expect, test, type Page } from "@playwright/test";

const REFERENCE_PROJECT = "desktop-1440";

async function setRole(page: Page, role: string): Promise<void> {
  await page.goto("/admin");
  await page.evaluate((value) => window.sessionStorage.setItem("admin-simulated-role", value), role);
}

test.describe("billing subscription health", () => {
  test("billing operator sees authoritative overview, currency separation, and non-additive totals", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Reference desktop matrix.");

    await page.goto("/admin/subscriptions");

    await expect(page.getByRole("heading", { level: 1, name: /الاشتراكات والإيرادات/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("اشتراكات نشطة");
    await expect(page.locator("main")).toContainText("AED");
    await expect(page.locator("main")).toContainText("SAR");

    await expect(page.getByRole("group", { name: "المنصة" })).toBeVisible();
    await page.getByRole("group", { name: "المنصة" }).getByRole("button", { name: "متعدد المنصات" }).click();
    await expect(page.locator("main")).toContainText("اشتراكات فريدة");

    await page.getByRole("group", { name: "المنصة" }).getByRole("button", { name: "كل المنصات" }).click();
    await expect(page.locator("main")).toContainText(/لا يساوي جمع/);

    await expect(page.locator("main")).toContainText("قائمة الاشتراكات المقنعة");
    await expect(page.locator("main")).toContainText("@example.test");
  });

  test("subscription health stays free of unsafe browser output across states", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Scenario matrix runs on the reference desktop.");
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    for (const scenario of ["loading", "forbidden", "internal-error", "unavailable"] as const) {
      await page.evaluate((value) => window.sessionStorage.setItem("admin-mock-scenario", value), scenario);
      await page.goto("/admin/subscriptions", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeAttached();
    }
    await page.evaluate(() => window.sessionStorage.removeItem("admin-mock-scenario"));

    await expect(page.locator("body")).not.toContainText(/secret-token|provider secret|raw payload|cvv|card_number/i);
    const unexpectedErrors = browserErrors.filter(
      (message) => !/^Failed to load resource: the server responded with a status of (403|500|503) /.test(message),
    );
    expect(unexpectedErrors).toEqual([]);
  });
});

test.describe("subscription operations", () => {
  test("operator opens a masked subscription detail and confirms a simulated plan action", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Detail journey runs on the reference desktop.");

    await page.goto("/admin/subscriptions");
    await page.getByRole("link", { name: "SUB-123" }).first().click();

    await expect(page.getByRole("heading", { level: 1, name: /تفاصيل الاشتراك/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("STRIPE-CUSTOMER");
    await expect(page.locator("main")).toContainText("@example.test");
    await expect(page.locator("body")).not.toContainText(/cvv|pan_|billing_address|webhook_signature/i);

    await page.getByRole("button", { name: "تغيير الخطة" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("subscriptions.manage");
    await expect(dialog).toContainText("billing.subscription.action.planned");
    await dialog.getByLabel("سبب الإجراء").fill("مراجعة تشغيلية موثقة");
    await dialog.getByRole("button", { name: "تأكيد" }).click();

    await expect(page.locator("main")).toContainText(/تم تسجيل/);
  });

  test("non-billing role cannot reach subscription management", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Forbidden journey runs on the reference desktop.");
    await setRole(page, "import-operator");
    await page.goto("/admin/subscriptions");
    await expect(page.locator("main")).toContainText(/لا تملك صلاحية الوصول/);
  });
});

test.describe("plans and promotions", () => {
  test("billing operator reviews plans and promotional codes with explicit currency labels", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Configuration journey runs on the reference desktop.");

    await page.goto("/admin/subscriptions/plans");
    await expect(page.getByRole("heading", { level: 1, name: /الخطط والأسعار/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("Free");
    await expect(page.locator("main")).toContainText("Basic");
    await expect(page.locator("main")).toContainText("Premium");
    await expect(page.locator("main")).toContainText("AED");

    await page.goto("/admin/subscriptions/promotional-codes");
    await expect(page.getByRole("heading", { level: 1, name: /الأكواد الترويجية/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("WELCOME10");
  });
});

test.describe("payment triage", () => {
  test("operator reviews sanitized payment event detail and triages a failed payment", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Triage journey runs on the reference desktop.");

    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { level: 1, name: /المدفوعات والأحداث/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("مطابقة");

    await page.goto("/admin/payments/events/EVT-20260728-001");
    await expect(page.getByRole("heading", { level: 1, name: /تفاصيل حدث الدفع/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("SUB-123");
    await expect(page.locator("main")).toContainText("معاينة الحقول المسموحة");
    await expect(page.locator("body")).not.toContainText(/cvv|card_number|webhook_signature|rawPayload|\b4242\b/i);

    await page.goto("/admin/payments/failed");
    await expect(page.getByRole("heading", { level: 1, name: /المدفوعات الفاشلة/ })).toBeVisible();
    await page.getByRole("button", { name: "تمييز كمراجع" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("payment_failures.manage");
    await expect(dialog).toContainText("billing.failed-payment.action.planned");
    await dialog.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.locator("main")).toContainText(/FAIL-/);
  });
});

test.describe("reconciliation", () => {
  test("operator reviews reconciliation issues with simulated-only decisions", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== REFERENCE_PROJECT, "Reconciliation journey runs on the reference desktop.");

    await page.goto("/admin/payments/reconciliation");
    await expect(page.getByRole("heading", { level: 1, name: /مطابقة الفوترة/ })).toBeVisible();
    await expect(page.locator("main")).toContainText(/قرارات محاكاة فقط/);
    await expect(page.locator("main")).toContainText("REC-");

    const firstDecision = page.getByRole("button", { name: "تمييز كقيد المراجعة" }).first();
    await firstDecision.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("billing_reconciliation.manage");
    await dialog.getByRole("button", { name: "تأكيد" }).click();
  });
});

test("all eight billing routes render across configured viewports", async ({ page }) => {
  const routes = [
    ["/admin/subscriptions", /الاشتراكات والإيرادات/],
    ["/admin/subscriptions/SUB-123", /تفاصيل الاشتراك/],
    ["/admin/subscriptions/plans", /الخطط والأسعار/],
    ["/admin/subscriptions/promotional-codes", /الأكواد الترويجية/],
    ["/admin/payments", /المدفوعات والأحداث/],
    ["/admin/payments/events/EVT-20260728-001", /تفاصيل حدث الدفع/],
    ["/admin/payments/failed", /المدفوعات الفاشلة/],
    ["/admin/payments/reconciliation", /مطابقة الفوترة/],
  ] as const;

  for (const [route, expectation] of routes) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("main")).toContainText(expectation);
    await expect(page.locator("body")).not.toContainText(/secret-token|provider secret|cvv|raw payload/i);
  }
});
