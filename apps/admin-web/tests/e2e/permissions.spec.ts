import { expect, test } from "@playwright/test";

const matrix = {
  "super-admin": ["/admin", "/admin/users", "/admin/access-requests", "/admin/imports", "/admin/system-health"],
  "support-agent": ["/admin", "/admin/users", "/admin/access-requests", "/admin/imports"],
  "billing-operator": ["/admin"],
  "import-operator": ["/admin", "/admin/imports"],
  "ai-operator": ["/admin"],
  "content-manager": ["/admin"],
  "security-administrator": ["/admin", "/admin/users", "/admin/access-requests", "/admin/imports", "/admin/system-health"],
} as const;

const navigationRoutes = [
  "/admin",
  "/admin/users",
  "/admin/access-requests",
  "/admin/imports",
  "/admin/system-health",
] as const;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Permission behavior is viewport-independent and runs once.",
  );
});

test("Phase 9 navigation and direct-route permissions are projected for all seven roles", async ({ page }) => {
  await page.goto("/admin");
  const switcher = page.getByRole("combobox").first();
  const superAdminLinks = ["/admin/admin-team", "/admin/roles", "/admin/settings"] as const;
  const limitedRoles = ["support-agent", "billing-operator", "import-operator", "ai-operator", "content-manager"] as const;

  await switcher.selectOption("super-admin");
  for (const route of superAdminLinks) {
    await expect(page.locator(`nav a[href="${route}"]`)).toHaveCount(1, {
      timeout: 15_000,
    });
  }

  await switcher.selectOption("security-administrator");
  await expect(page.locator('nav a[href="/admin/admin-team"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/admin/roles"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/admin/settings"]')).toHaveCount(0);

  for (const role of limitedRoles) {
    await switcher.selectOption(role);
    for (const route of superAdminLinks) {
      await expect(page.locator(`nav a[href="${route}"]`)).toHaveCount(0);
    }
  }

  await page.evaluate(() => sessionStorage.setItem("admin-simulated-role", "security-administrator"));
  await page.goto("/admin/settings/security");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("إعدادات الأمن");
  await page.goto("/admin/settings/maintenance");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("الصيانة");
  await page.goto("/admin/settings");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();

  await page.evaluate(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  await page.goto("/admin/admin-team");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
});

test("billing role cannot read any Spec 005 route or force direct actions", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  const deniedRoutes = [
    "/admin/imports/sessions",
    "/admin/imports/sessions/IMP-77241",
    "/admin/imports/failed",
    "/admin/imports/low-confidence",
    "/admin/imports/duplicates",
    "/admin/imports/unsupported",
    "/admin/parsers/banks",
    "/admin/parsers/banks/BNK-001",
    "/admin/parsers/senders",
    "/admin/parsers/rules",
    "/admin/parsers/rules/PRL-001",
    "/admin/parsers/test-cases",
    "/admin/parsers/versions",
    "/admin/parsers/merchant-rules",
    "/admin/parsers/category-rules",
  ];

  for (const route of deniedRoutes) {
    await page.goto(route);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/IMP-77241|PRL-001|BNK-001|SND-001/);
  }

  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/admin/parsers/merchant-rules/MR-001/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-simulated-role": "billing-operator",
      },
      body: JSON.stringify({
        action: "save",
        expectedState: "active",
        expectedRevision: 1,
        reason: "محاولة مباشرة غير مصرح بها",
        confirmationToken: "CONFIRM-SPEC-005",
      }),
    });
    return { status: result.status, body: await result.json() as { code: string } };
  });
  expect(response).toEqual({ status: 403, body: { code: "forbidden" } });
});

test("limited AI roles receive only their documented projections", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
  await page.goto("/admin/ai/providers");
  await expect(page.locator("main")).toContainText("USD");
  await expect(page.locator("main")).not.toContainText(/healthy|feature\/locale fallback/);
  await page.goto("/admin/ai/models");
  await expect(page.locator("main")).toContainText("cost-only");
  await expect(page.locator("main")).not.toContainText("receipt_analysis");

  const forbidden = await page.evaluate(async () => {
    const response = await fetch("/api/v1/admin/ai/providers/AIP-OPENAI/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-simulated-role": "billing-operator",
      },
      body: JSON.stringify({
        action: "deactivate",
        context: {
          reason: "direct forbidden decision",
          expectedState: "healthy",
          expectedRevision: 1,
          confirmationToken: "CONFIRM-SPEC-006",
        },
      }),
    });
    return { status: response.status, body: await response.json() as { code: string } };
  });
  expect(forbidden).toEqual({ status: 403, body: { code: "forbidden" } });
});

test("seven simulated roles expose only their allowed route links", async ({ page }) => {
  await page.goto("/admin");
  const switcher = page.getByRole("combobox", { name: "الدور التجريبي" });
  await expect(page.locator("nav a").first()).toBeVisible();

  for (const [role, allowedRoutes] of Object.entries(matrix)) {
    await switcher.selectOption(role);
    await page.reload();
    const healthButton = page.getByRole("button", { name: /صحة النظام|System Health/ });
    if (allowedRoutes.includes("/admin/system-health" as never)) {
      await expect(healthButton).toHaveAttribute("aria-expanded", "false");
      await healthButton.click();
      await expect(healthButton).toHaveAttribute("aria-expanded", "true");
    } else {
      await expect(healthButton).toHaveCount(0);
    }
    for (const route of navigationRoutes) {
      const link = page.locator(`nav a[href="${route}"]`);
      await expect(link).toHaveCount(allowedRoutes.includes(route as never) ? 1 : 0);
    }
  }
});

test("role simulation states that backend authorization remains required", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText(/التفويض الفعلي يتم من الخادم/)).toBeVisible();
});

test("direct denied routes remove protected content", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("billing-operator");
  await page.goto("/admin/users");
  await expect(page.locator("section[role='alert']")).toContainText("لا تملك صلاحية الوصول");
  await expect(page.getByRole("heading", { name: "إدارة المستخدمين" })).toHaveCount(0);
});

const deniedPhase2Routes = [
  ["/admin/users/USR-10482", "USR-10482"],
  ["/admin/access-requests", "ACC-1001"],
  ["/admin/access-requests/ACC-1001", "ACC-1001"],
  ["/admin/access-requests/ACC-1003/workspace", "TKT-12003"],
] as const;

for (const [route, marker] of deniedPhase2Routes) {
  test(`denied Phase 2 route ${route} removes protected marker`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "billing-operator"));
    await page.goto(route);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(marker);
  });
}

test("unsafe search input is rendered as text and never executable markup", async ({ page }) => {
  await page.goto("/admin");
  await page.locator(".global-search input").fill("<script>window.__unsafe=true</script>");
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__unsafe"))).toBeUndefined();
});

test("masked user details do not expose an unmasked email", async ({ page }) => {
  await page.goto("/admin/users");
  await page.locator(".table-link").first().click();
  await expect(page.getByText("n***@example.test", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("nora@example.test");
});

test("expired mock sessions remove all protected page content", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("admin-mock-scenario", "expired"));
  await page.goto("/admin");
  await expect(page.locator("section[role='alert']")).toContainText("انتهت صلاحية الوصول المؤقت");
  await expect(page.getByRole("heading", { name: /صباح الخير/ })).toHaveCount(0);
});

test("sensitive retry acknowledges pending state and blocks duplicate submission", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("admin-mock-scenario", "slow"));
  await page.goto("/admin/imports");
  await page.getByRole("button", { name: "إعادة المحاولة" }).first().click();
  const confirm = page.getByRole("button", { name: "تأكيد" });
  await confirm.click();
  await expect(page.getByRole("button", { name: /جاري التنفيذ/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /جاري التنفيذ/ })).toHaveCount(1);
});

test("rate-limited sensitive mutations return only a safe error", async ({ page }) => {
  await page.goto("/admin/users/USR-10482");
  await expect(page.getByRole("heading", { name: "نورة العتيبي" })).toBeVisible();
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/admin/users/USR-10482/suspend?role=super-admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-scenario": "rate-limited",
      },
      body: JSON.stringify({
        reason: "محاولة آمنة خاضعة لحد الطلبات",
        durationDays: 1,
        internalNote: "",
        notifyUser: false,
      }),
    });
    return { status: result.status, body: await result.json() as { code: string; message: string } };
  });
  expect(response).toEqual({
    status: 429,
    body: { code: "rate_limited", message: "حاول لاحقاً." },
  });
});

test("Spec 005 routes enforce read and action permissions independently", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("support-agent");
  await page.goto("/admin/imports/sessions");
  await expect(page.getByRole("heading", { name: "جلسات الاستيراد" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الإجراءات المتاحة" })).toHaveCount(0);

  await page.goto("/admin/imports/sessions/IMP-77241");
  await expect(page.locator("main").getByRole("alert")).toContainText("لا تملك صلاحية الوصول");

  await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("security-administrator");
  await page.goto("/admin/parsers/rules");
  await expect(page.getByRole("heading", { name: "قواعد المحلل" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "الإجراءات المتاحة" })).toHaveCount(0);
});
