import { expect, test } from "@playwright/test";

test.describe("User Story 1", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "US1 runs once on the reference desktop.");
  });

  test("finds a unique multi-platform customer with authoritative totals", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("[data-spec='users-platform-totals']")).toContainText("unique:8;ios:5;android:5;multi:2");
    await expect(page.locator(".desktop-table tbody tr")).toHaveCount(8);

    const platform = page.getByRole("combobox", { name: "المنصة" });
    await platform.selectOption("ios");
    await expect(page.getByRole("button", { name: "Omar Kareem" })).toBeVisible();
    await platform.selectOption("android");
    await expect(page.getByRole("button", { name: "Omar Kareem" })).toBeVisible();
    await platform.selectOption("multi");
    await expect(page.locator(".desktop-table tbody tr")).toHaveCount(2);
  });

  test("opens a masked summary, links to the full profile, and returns focus", async ({ page }) => {
    await page.goto("/admin/users");
    const trigger = page.getByRole("button", { name: "Omar Kareem" });
    await trigger.click();
    await expect(page.getByText("o***@example.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "فتح الملف الكامل" }).last())
      .toHaveAttribute("href", "/admin/users/USR-10461");
    await page.getByRole("button", { name: "إغلاق" }).click();
    await expect(trigger).toBeFocused();
  });

  test("clears page-scoped selection when a filter changes", async ({ page }) => {
    await page.goto("/admin/users");
    const checkbox = page.getByRole("checkbox", { name: "تحديد Omar Kareem" });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await page.getByRole("combobox", { name: "المنصة" }).selectOption("multi");
    await expect(page.getByRole("checkbox", { name: "تحديد Omar Kareem" })).not.toBeChecked();
  });
});

test.describe("access request lifecycle", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Lifecycle mutations run once on the reference desktop.");
  });

  test("creates a bounded request and reports an overlapping duplicate safely", async ({ page }) => {
    await page.goto("/admin/access-requests");
    await page.getByLabel("السبب").fill("مراجعة جلسة مرتبطة بتذكرة الدعم");
    await page.getByLabel("بيانات التواصل المخفية").uncheck();
    await page.getByLabel("تشخيص الجلسات").check();
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await expect(page.getByRole("dialog", { name: "تأكيد طلب الوصول" })).toBeVisible();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("link", { name: "فتح طلب ACC-1007" })).toBeVisible();

    await page.getByLabel("السبب").fill("محاولة طلب متداخل لنفس التذكرة");
    await page.getByLabel("بيانات التواصل المخفية").check();
    await page.getByRole("button", { name: "مراجعة الطلب" }).click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("تعارض الطلب مع الحالة الحالية.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/stack|exception|payload/i);
  });

  test("separates requester and approver, reduces scope, and rejects invalid transitions", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "support-agent"));
    await page.goto("/admin/access-requests/ACC-1001");
    await expect(page.getByRole("note")).toContainText("لا يمكن لمقدم الطلب اعتماد طلبه");
    await expect(page.getByRole("button", { name: "اعتماد مخفض" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("security-administrator");
    await expect(page.getByRole("button", { name: "اعتماد مخفض" })).toBeVisible();
    await page.getByRole("button", { name: "اعتماد مخفض" }).click();
    await page.getByLabel("سبب القرار").fill("اعتماد نطاق مخفض بعد المراجعة");
    await page.getByLabel("وقت البدء").fill("2099-01-01T00:00");
    await page.getByRole("button", { name: "مراجعة القرار" }).click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("معتمد", { exact: true })).toBeVisible();
    await expect(page.getByText("profile-contact", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("account-status", { exact: true })).toHaveCount(0);

    const conflict = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/access-requests/ACC-1001/decision?role=security-administrator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "reject", reason: "لم تعد الحالة تسمح بالقرار" }),
      });
      return { status: response.status, body: await response.json() as { code: string } };
    });
    expect(conflict).toEqual({ status: 409, body: { code: "conflict", message: "تعارض الطلب مع الحالة الحالية." } });

    await page.getByRole("button", { name: "إلغاء الوصول" }).click();
    await page.getByLabel("سبب القرار").fill("إنهاء الوصول بعد اكتمال المراجعة");
    await page.getByRole("button", { name: "مراجعة القرار" }).click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("ملغى", { exact: true })).toBeVisible();
  });

  test("lets a separate approver reject while denied roles see no access content", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "security-administrator"));
    await page.goto("/admin/access-requests/ACC-1001");
    await page.getByRole("button", { name: "رفض" }).click();
    await page.getByLabel("سبب القرار").fill("لم تتحقق شروط الوصول المؤقت");
    await page.getByRole("button", { name: "مراجعة القرار" }).click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("مرفوض", { exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("billing-operator");
    await expect(page.locator("section[role='alert']")).toContainText("لا تملك صلاحية الوصول");
    await expect(page.getByRole("heading", { name: /طلب الوصول ACC-1001/ })).toHaveCount(0);
    await expect(page.locator('nav a[href="/admin/access-requests"]')).toHaveCount(0);
  });
});

test.describe("temporary workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("admin-simulated-role", "support-agent"));
  });

  test("projects only assigned scope and denies a non-assignee", async ({ page }, testInfo) => {
    await page.goto("/admin/access-requests/ACC-1003/workspace");
    await expect(page.getByRole("heading", { name: "مساحة الدعم المؤقتة" })).toBeVisible();
    await expect(page.getByLabel("إشعار الوصول المؤقت")).toContainText("TKT-12003");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["تشخيص الجلسات", "حالة الحساب"]);
    await expect(page.getByText("بيانات التواصل المخفية")).toHaveCount(0);
    await expect(page.getByText("تشخيص الأجهزة")).toHaveCount(0);

    if (["tablet-768", "mobile-390"].includes(testInfo.project.name)) return;
    await page.getByRole("combobox", { name: "الدور التجريبي" }).selectOption("super-admin");
    await expect(page.getByRole("heading", { name: "مساحة الدعم المؤقتة" })).toHaveCount(0);
    await expect(page.getByText("هذه مساحة دعم مؤقتة ومراقبة")).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toContainText("لا تملك صلاحية الوصول");
  });

  test("ends access, clears workspace content, and blocks direct reopening", async ({ page }) => {
    await page.goto("/admin/access-requests/ACC-1003/workspace");
    await page.getByLabel("ملاحظة محلية غير محفوظة").fill("ملاحظة يجب حذفها");
    await page.getByRole("button", { name: "إنهاء الوصول" }).click();
    await expect(page.getByRole("dialog", { name: "إنهاء الوصول المؤقت" })).toBeVisible();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page).toHaveURL(/\/admin\/access-requests\/ACC-1003$/);
    await expect(page.getByText("ملغى", { exact: true })).toBeVisible();

    const reopened = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/access-requests/ACC-1003/workspace?role=support-agent");
      return { status: response.status, body: await response.json() as { code: string } };
    });
    expect(reopened).toMatchObject({ status: 409, body: { code: "conflict" } });
    await expect(page.getByText("ملاحظة يجب حذفها")).toHaveCount(0);
  });

  test("removes near-expiry content and keeps it absent after browser lifecycle events", async ({ page }) => {
    await page.goto("/admin/access-requests/ACC-1003/workspace?__scenario=near-expiry");
    await expect(page.getByRole("heading", { name: "مساحة الدعم المؤقتة" })).toBeVisible();
    await expect(page.getByText("الجلسات النشطة")).toBeVisible();
    await expect(page.getByText("انتهت صلاحية الوصول المؤقت")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("الجلسات النشطة")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("الجلسات النشطة")).toHaveCount(0, { timeout: 500 });
    await expect(page.getByText("انتهت صلاحية الوصول المؤقت")).toBeVisible();
    await page.goto("/admin/access-requests/ACC-1003");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/admin\/access-requests\/ACC-1003\/workspace/);
    await expect(page.getByText("الجلسات النشطة")).toHaveCount(0);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByText("الجلسات النشطة")).toHaveCount(0);
  });
});

test.describe("profile, actions, and bounded bulk scope", () => {
  test("keeps the masked profile and device/session semantics responsive", async ({ page }, testInfo) => {
    await page.goto("/admin/users/USR-10482");
    await expect(page.getByText("n***@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("iPhone رئيسي", { exact: false }).first()).toBeVisible();
    const sessionRegion = ["tablet-768", "mobile-390"].includes(testInfo.project.name)
      ? page.locator(".mobile-cards")
      : page.locator(".desktop-table");
    await expect(sessionRegion.getByText("الرياض، السعودية", { exact: true }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/raw ip|token|fingerprint|salary|merchant/i);
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(hasOverflow).toBe(false);
    await page.evaluate(() => sessionStorage.setItem("admin-mock-scenario", "partial"));
    await page.reload();
    await expect(page.locator(".region-warning")).toHaveCount(3);
  });

  test("validates and applies every controlled customer action with safe locking and conflicts", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Sensitive mutations run once on the reference desktop.");
    await page.goto("/admin/users/USR-10482");
    await page.getByRole("button", { name: "تعليق الحساب" }).click();
    const dialog = page.getByRole("dialog", { name: "تعليق الحساب" });
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("تحقق من البيانات المدخلة.")).toBeVisible();
    await dialog.getByLabel("سبب الإجراء").fill("تعليق موثق مرتبط بتذكرة دعم");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("status")).toContainText("تم تنفيذ الإجراء");
    await expect(page.getByRole("button", { name: "إعادة التفعيل" })).toBeVisible();

    const conflict = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/users/USR-10482/suspend?role=super-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "محاولة تعليق مكرر آمنة", durationDays: 30, internalNote: "", notifyUser: false }),
      });
      return { status: response.status, body: await response.json() as { code: string } };
    });
    expect(conflict).toMatchObject({ status: 409, body: { code: "conflict" } });

    await page.getByRole("button", { name: "إعادة التفعيل" }).click();
    await page.getByRole("dialog").getByLabel("سبب الإجراء").fill("إعادة تفعيل موثقة بعد اكتمال المراجعة");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("button", { name: "تعليق الحساب" })).toBeVisible();

    await page.getByRole("button", { name: "تحديث التحقق" }).click();
    await page.getByRole("dialog").getByLabel("سبب الإجراء").fill("تحديث حالة التحقق بعد مراجعة المستندات");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("status").last()).toContainText("تم تنفيذ الإجراء");

    await page.getByRole("button", { name: /إلغاء جهاز/ }).first().click();
    await page.getByRole("dialog").getByLabel("سبب الإجراء").fill("إلغاء جهاز غير موثوق بعد مراجعة الدعم");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("تم إلغاء الجهاز.")).toBeVisible();

    await page.evaluate(() => sessionStorage.setItem("admin-mock-scenario", "slow"));
    await page.getByRole("button", { name: /إنهاء جلسة/ }).last().click();
    await page.getByRole("dialog").getByLabel("سبب الإجراء").fill("إنهاء جلسة محددة بعد مراجعة الوصول");
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("button", { name: /جاري التنفيذ/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /جاري التنفيذ/ })).toHaveCount(1);
    await expect(page.getByRole("status").last()).toContainText("تم تنفيذ الإجراء");
    await page.evaluate(() => sessionStorage.removeItem("admin-mock-scenario"));
  });

  test("submits only explicit current-page IDs for bulk work", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Bulk mutation runs once on the reference desktop.");
    await page.goto("/admin/users");
    await page.getByRole("checkbox", { name: "تحديد نورة العتيبي" }).check();
    await page.getByRole("checkbox", { name: "تحديد Omar Kareem" }).check();
    await page.getByRole("button", { name: "مراجعة الإجراء" }).click();
    await page.getByLabel("سبب الإجراء").fill("إجراء جماعي محدود بالصفحة الحالية");
    const requestPromise = page.waitForRequest((request) => request.url().includes("/bulk-actions"));
    await page.evaluate(() => sessionStorage.setItem("admin-mock-scenario", "slow"));
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("button", { name: /جاري التنفيذ/ })).toBeDisabled();
    const body = (await requestPromise).postDataJSON() as { userIds: string[] };
    expect(body.userIds).toHaveLength(2);
    expect(new Set(body.userIds)).toEqual(new Set(["USR-10482", "USR-10461"]));
    await expect(page.getByRole("status")).toContainText(/نجح|تعذر/);
    await expect(page.getByRole("checkbox", { name: "تحديد نورة العتيبي" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "تحديد Omar Kareem" })).not.toBeChecked();
    await expect(page.getByRole("region", { name: "إجراءات جماعية" })).toHaveCount(0);
    await page.evaluate(() => sessionStorage.removeItem("admin-mock-scenario"));
  });

  test("keeps masked export and notification handoff mock-only", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Mock-only bulk outcomes run once.");
    const externalRequests: string[] = [];
    let downloads = 0;
    page.on("request", (request) => {
      if (!request.url().startsWith("http://127.0.0.1:3100")) externalRequests.push(request.url());
    });
    page.on("download", () => { downloads += 1; });
    await page.goto("/admin/users");

    const selectCustomer = () => page.getByRole("checkbox", { name: "تحديد نورة العتيبي" }).check();
    await selectCustomer();
    await page.getByRole("combobox", { name: "الإجراء الجماعي" }).selectOption("export-summary");
    const review = page.getByRole("button", { name: "مراجعة الإجراء" });
    await review.click();
    await page.keyboard.press("Escape");
    await expect(review).toBeFocused();
    await review.click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("status")).toContainText("1 نجح");

    await selectCustomer();
    await page.getByRole("combobox", { name: "الإجراء الجماعي" }).selectOption("notification-handoff");
    await page.getByRole("button", { name: "مراجعة الإجراء" }).click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByRole("status")).toContainText("1 نجح");
    expect(downloads).toBe(0);
    expect(externalRequests).toEqual([]);
  });
});
