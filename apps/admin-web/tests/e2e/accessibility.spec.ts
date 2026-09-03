import { expect, test } from "@playwright/test";

test("keyboard and dialog focus behavior remains operable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Keyboard reference journey runs once.",
  );
  await page.goto("/admin/imports");
  const retry = page.getByRole("button", { name: "إعادة المحاولة" }).first();
  await retry.focus();
  await retry.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "إعادة محاولة الاستيراد" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "إعادة محاولة الاستيراد" }),
  ).toBeHidden();
  await expect(retry).toBeFocused();
});

test("semantic labels, tables, masking, statuses, and chart summaries are present", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1440",
    "Semantic reference journey runs once.",
  );
  await page.goto("/admin/users");
  await expect(
    page.getByRole("navigation", { name: "التنقل الرئيسي" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "المستخدم" }),
  ).toBeVisible();
  await expect(page.locator(".badge").first()).not.toBeEmpty();
  await page.locator(".table-link").first().click();
  await expect(
    page.getByText("n***@example.test", { exact: true }),
  ).toBeVisible();

  await page.goto("/admin");
  await expect(page.locator(".chart-card .sr-only")).toHaveCount(5);
  for (const summary of await page.locator(".chart-card .sr-only").all()) {
    await expect(summary).not.toBeEmpty();
  }
});

test("mobile touch targets, drawer Escape, and reduced motion are enforced", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-390",
    "Mobile checks run only at 390px.",
  );
  await page.goto("/admin");
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const trigger = page.getByRole("button", { name: "فتح القائمة" });
  const box = await trigger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "التنقل الرئيسي" }),
  ).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Phase 2 dialogs, temporary-access context, and focus remain operable", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-1440", "mobile-390"].includes(testInfo.project.name),
    "Phase 2 accessibility runs at the required desktop and mobile references.",
  );
  await page.goto("/admin/users");
  const customer = page.getByRole("checkbox", { name: "تحديد نورة العتيبي" });
  await customer.focus();
  await customer.press("Space");
  await expect(customer).toBeChecked();

  await page.goto("/admin/users/USR-10482");
  const action = page.getByRole("button", { name: "تعليق الحساب" });
  await action.focus();
  await action.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "تعليق الحساب" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(action).toBeFocused();

  await page.addInitScript(() =>
    sessionStorage.setItem("admin-simulated-role", "support-agent"),
  );
  await page.goto("/admin/access-requests");
  await page.getByLabel("السبب").focus();
  await page.keyboard.type("مراجعة وصول موثقة باستخدام لوحة المفاتيح");
  const reviewRequest = page.getByRole("button", { name: "مراجعة الطلب" });
  await reviewRequest.focus();
  await reviewRequest.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "تأكيد طلب الوصول" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reviewRequest).toBeFocused();

  await page.goto("/admin/access-requests/ACC-1003/workspace");
  await expect(page.getByLabel("إشعار الوصول المؤقت")).toContainText(
    "TKT-12003",
  );
  await expect(page.locator("time")).toHaveAttribute("datetime", /.+/);
  const endAccess = page.getByRole("button", { name: "إنهاء الوصول" });
  if (testInfo.project.name === "mobile-390") {
    const box = await endAccess.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await endAccess.focus();
  await endAccess.press("Enter");
  await page.keyboard.press("Escape");
  await expect(endAccess).toBeFocused();
});

test("Spec 005 tables, filters, dialogs, and mobile parser guidance are accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-1440", "mobile-390"].includes(testInfo.project.name),
    "Spec 005 accessibility runs at desktop and mobile references.",
  );
  await page.goto("/admin/imports/duplicates");
  await expect(
    page.getByRole("heading", { level: 1, name: "مرشحو التكرار" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "بحث النتائج التشغيلية", exact: true }),
  ).toBeVisible();

  if (testInfo.project.name === "desktop-1440") {
    await expect(
      page.getByRole("columnheader", { name: "المعرّف" }),
    ).toBeVisible();
    const action = page.getByRole("button", { name: /تأكيد التكرار.*DUP-001/ });
    await action.focus();
    await action.press("Enter");
    await expect(page.getByRole("dialog")).toContainText(
      "imports.duplicates.manage",
    );
    await page.keyboard.press("Escape");
    await expect(action).toBeFocused();
  } else {
    const controls = await page
      .locator("button, input, select, textarea")
      .all();
    for (const control of controls.slice(0, 8)) {
      const box = await control.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.goto("/admin/parsers/rules/PRL-001");
    await expect(page.getByText(/يتطلب تحرير القواعد/)).toBeVisible();
  }
});

test("Spec 006 tables, cards, filters, confirmations, and mobile guidance are accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-1440", "mobile-390"].includes(testInfo.project.name),
    "Spec 006 accessibility runs at desktop and mobile references.",
  );
  await page.goto("/admin/ai/failures");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const filters = page.getByLabel("عوامل تصفية الذكاء الاصطناعي");
  await expect(filters).toBeVisible();
  await expect(filters.getByRole("textbox", { name: "بحث" })).toBeVisible();

  if (testInfo.project.name === "mobile-390") {
    await expect(page.locator(".mobile-data-card:visible")).toBeVisible();
    await expect(page.getByRole("note")).toContainText(/شاشة بعرض أكبر/);
    await expect(
      page.getByRole("button", { name: "acknowledge" }),
    ).toBeHidden();
  } else {
    await expect(
      page.getByRole("columnheader", { name: "المعرّف" }),
    ).toBeVisible();
    const action = page.getByRole("button", { name: "acknowledge" });
    await action.focus();
    await action.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "تأكيد" })).toBeDisabled();
    await dialog.getByLabel("سبب القرار").fill("قرار تشغيلي موثق");
    await expect(dialog.getByRole("button", { name: "تأكيد" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(action).toBeFocused();
  }
});

test("Phase 9 landmarks controls dialogs and reduced motion remain accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-1440", "mobile-390"].includes(testInfo.project.name),
    "Phase 9 accessibility runs at desktop and mobile references.",
  );

  await page.goto("/admin/admin-team");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Admin Team",
  );
  await expect(page.getByLabel("Search admins")).toBeVisible();
  await expect(page.locator(".badge + .sr-only").first()).toContainText(
    "Status",
  );

  if (testInfo.project.name === "mobile-390") {
    const searchBox = await page.getByLabel("Search admins").boundingBox();
    if (searchBox) {
      expect(
        Math.min(searchBox.width, searchBox.height),
      ).toBeGreaterThanOrEqual(44);
    }
  }

  await page.goto("/admin/admin-team/ADM-DEMO-SUPPORT-03");
  const action = page.getByRole("button", { name: "Revoke eligible sessions" });
  await action.focus();
  await action.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Revoke sessions" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(action).toBeFocused();

  await page.goto("/admin/settings/security");
  await expect(page.getByLabel("Settings reason")).toBeVisible();
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
});
