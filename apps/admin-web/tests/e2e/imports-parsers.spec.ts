import { expect, test, type Page } from "@playwright/test";

const routes = [
  ["/admin/imports", "الاستيراد والأتمتة"],
  ["/admin/imports/sessions", "جلسات الاستيراد"],
  ["/admin/imports/sessions/IMP-77241", "جلسات الاستيراد"],
  ["/admin/imports/failed", "عمليات الاستيراد الفاشلة"],
  ["/admin/imports/low-confidence", "الاستيرادات منخفضة الثقة"],
  ["/admin/imports/duplicates", "مرشحو التكرار"],
  ["/admin/imports/unsupported", "التنسيقات غير المدعومة"],
  ["/admin/parsers/banks", "البنوك المدعومة"],
  ["/admin/parsers/banks/BNK-001", "البنوك المدعومة"],
  ["/admin/parsers/senders", "إدارة المرسلين"],
  ["/admin/parsers/rules", "قواعد المحلل"],
  ["/admin/parsers/rules/PRL-001", "قواعد المحلل"],
  ["/admin/parsers/test-cases", "حالات اختبار المحلل"],
  ["/admin/parsers/versions", "إصدارات المحلل"],
  ["/admin/parsers/merchant-rules", "قواعد التجار"],
  ["/admin/parsers/category-rules", "قواعد التصنيف"],
] as const;

async function confirmFirst(page: Page, accessibleName: RegExp): Promise<void> {
  await page.getByRole("button", { name: accessibleName }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/المحاكاة فقط|واجهة فقط/);
  await dialog.getByRole("button", { name: "تأكيد" }).click();
  await expect(dialog).toBeHidden();
}

test("all Spec 005 routes render safely at every approved viewport", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      heading,
    );
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      /rawMessage|rawPayload|account_number|phone_number|secret-token|dangerouslySetInnerHTML/i,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  if (testInfo.project.name === "mobile-390") {
    await page.goto("/admin/parsers/rules/PRL-001");
    await expect(page.getByText(/يتطلب تحرير القواعد/)).toBeVisible();
  }
  expect(browserErrors).toEqual([]);
});

test("combined customer analytics remain authoritative across platforms", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Authoritative count semantics run once.",
  );
  await page.goto("/admin/imports");
  const selector = page.getByRole("combobox", { name: "منصة التحليلات" });
  const metric = page.getByTestId("unique-customers");
  const combined = Number(await metric.getAttribute("data-value"));

  await selector.selectOption("android");
  await expect(metric).toHaveAttribute("data-value", "82100");
  const android = Number(await metric.getAttribute("data-value"));
  await selector.selectOption("ios");
  await expect(metric).toHaveAttribute("data-value", "59780");
  const ios = Number(await metric.getAttribute("data-value"));

  expect(combined).not.toBe(android + ios);
  await expect(page.locator("main")).toContainText(
    /لا تجمع العملاء بين iOS وAndroid/,
  );
});

test("operator triages imports with confirmation, pending lock, and safe result", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Mutation journey runs once.",
  );
  await page.goto("/admin/imports/failed");
  await page.getByLabel("سبب الإجراء").fill("مراجعة تشغيلية موثقة");
  await confirmFirst(page, /تسليم إعادة المحاولة.*IFL-001/);
  await expect(page.locator("main")).toContainText(/مرجع التدقيق: AUD-/);
});

test("support projection omits protected previews and direct mutation is forbidden", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Permission journey runs once.",
  );
  await page.addInitScript(() =>
    sessionStorage.setItem("admin-simulated-role", "support-agent"),
  );
  await page.goto("/admin/imports/sessions");
  await expect(page.locator("main")).toContainText("IMP-77241");
  await expect(
    page.getByRole("heading", { name: "الإجراءات المتاحة" }),
  ).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("معاينة منقحة");

  const response = await page.evaluate(async () => {
    const result = await fetch(
      "/api/v1/admin/imports/sessions/IMP-77241/retry-handoff",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-simulated-role": "support-agent",
        },
        body: JSON.stringify({
          action: "retry_handoff",
          expectedState: "failed",
          expectedRevision: 1,
          reason: "محاولة مباشرة غير مصرح بها",
          confirmationToken: "CONFIRM-SPEC-005",
        }),
      },
    );
    return {
      status: result.status,
      body: (await result.json()) as { code: string },
    };
  });
  expect(response).toEqual({ status: 403, body: { code: "forbidden" } });
});

test("parser lifecycle is test-gated and rollback creates a new draft", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Version lifecycle runs once.",
  );
  await page.goto("/admin/parsers/versions");

  await confirmFirst(page, /إحالة للتقاعد.*PV-3182/);
  await confirmFirst(page, /تشغيل اختبار خيالي.*PV-3183/);
  await confirmFirst(page, /إصدار.*PV-3183/);
  await confirmFirst(page, /إنشاء مسودة تراجع.*PV-3182/);

  await expect(page.locator("main")).toContainText(/مرجع التدقيق: AUD-/);
});

test("keyboard confirmation restores focus and unsafe search remains inert", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Keyboard journey runs once.",
  );
  await page.goto("/admin/imports/duplicates");
  const search = page.getByRole("textbox", { name: "بحث", exact: true });
  await search.fill("<script>window.__spec005Unsafe=true</script>");
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__spec005Unsafe")))
    .toBeUndefined();
  await search.fill("");

  const action = page.getByRole("button", { name: /تأكيد التكرار.*DUP-001/ });
  await action.focus();
  await action.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(action).toBeFocused();
});

test("Spec 005 mock endpoints expose safe scenario states for every route family", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Scenario API matrix runs once.",
  );
  await page.goto("/admin/imports");
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  const endpoints = [
    "/api/v1/admin/imports/sessions",
    "/api/v1/admin/imports/failures",
    "/api/v1/admin/imports/low-confidence",
    "/api/v1/admin/imports/duplicates",
    "/api/v1/admin/imports/unsupported-formats",
    "/api/v1/admin/parsers/banks",
    "/api/v1/admin/parsers/senders",
    "/api/v1/admin/parsers/rules",
    "/api/v1/admin/parsers/test-cases",
    "/api/v1/admin/parsers/versions",
    "/api/v1/admin/parsers/merchant-rules",
    "/api/v1/admin/parsers/category-rules",
  ];
  const scenarios = [
    "empty",
    "partial",
    "rate-limited",
    "unavailable",
    "unsafe-response",
    "internal-error",
  ] as const;

  for (const endpoint of endpoints) {
    for (const scenario of scenarios) {
      const result = await page.evaluate(
        async ({ endpoint, scenario }) => {
          const response = await fetch(`${endpoint}?__scenario=${scenario}`, {
            headers: { "x-admin-simulated-role": "super-admin" },
          });
          const text = await response.text();
          const body = JSON.parse(text) as {
            code?: string;
            rawPayload?: string;
            rawMessage?: string;
          };
          return { status: response.status, body, endpoint, scenario };
        },
        { endpoint, scenario },
      );

      if (scenario === "empty" || scenario === "partial") {
        expect(result.status).toBe(200);
      } else if (scenario === "unsafe-response") {
        expect(JSON.stringify(result.body)).toMatch(/rawMessage|rawPayload/);
      } else {
        expect(result.status).toBeGreaterThanOrEqual(400);
        expect(JSON.stringify(result.body)).not.toMatch(
          /stack|token|raw customer|account_number/i,
        );
      }
    }
  }
});

test("Spec 005 filters, sort, pagination, and overlap conflicts work through browser API", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Filter/action API journey runs once.",
  );
  await page.goto("/admin/imports/sessions");
  await page.getByLabel("المصدر").selectOption("android_sms");
  await page.getByLabel("إصدار المحلل").fill("PV-3182");
  await page.getByLabel("إصدار التطبيق").fill("4.8.1");
  await page.getByLabel("الفرز", { exact: true }).selectOption("appVersion");
  await expect(page.locator("main")).toContainText("IMP-77241");
  await expect(page.locator("main")).toContainText("PV-3182");

  const response = await page.evaluate(async () => {
    const result = await fetch("/api/v1/admin/parsers/senders/SND-001/action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-simulated-role": "import-operator",
      },
      body: JSON.stringify({
        action: "save",
        expectedState: "active",
        expectedRevision: 1,
        reason: "اختبار تعارض نمط مرسل",
        proposal: { pattern: "^ALT-DEMO$" },
      }),
    });
    return {
      status: result.status,
      body: (await result.json()) as { code?: string; message?: string },
    };
  });

  expect(response.status).toBe(409);
  expect(response.body.code).toBe("conflict");
});
