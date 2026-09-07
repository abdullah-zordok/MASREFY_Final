import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommunicationActionDialog } from "./CommunicationActionDialog";
import { OperationalFilters } from "./OperationalFilters";
import { SafeText } from "./SafeText";

const mountedRoots: Root[] = [];

afterEach(async () => {
  await Promise.all(mountedRoots.splice(0).map(async (root) => act(async () => root.unmount())));
  document.body.replaceChildren();
});

describe("communications shared components", () => {
  test("renders labelled operational filters and permission denial", () => {
    const filterMarkup = renderToStaticMarkup(
      <OperationalFilters
        filters={{ search: "", platform: "all", status: "", priority: "" }}
        labels={{ search: "بحث", platform: "المنصة", status: "الحالة", priority: "الأولوية" }}
        onChange={() => undefined}
      />,
    );

    expect(filterMarkup).toContain("بحث");
    expect(filterMarkup).toContain("المنصة");
    expect(filterMarkup).toContain("الحالة");
    expect(filterMarkup).toContain("الأولوية");
    expect(renderToStaticMarkup(
      <OperationalFilters
        filters={{}}
        labels={{ search: "بحث", platform: "المنصة" }}
        onChange={() => undefined}
        permissionDenied
      />,
    )).toContain("غير مصرح");
  });

  test("renders empty, partial, and unavailable regions accessibly", () => {
    const markup = renderToStaticMarkup(
      <OperationalFilters
        emptyMessage="لا توجد نتائج"
        filters={{}}
        labels={{ search: "بحث", platform: "المنصة" }}
        onChange={() => undefined}
        partialMessage="بيانات جزئية"
        unavailableMessage="غير متاح"
      />,
    );

    expect(markup).toContain("لا توجد نتائج");
    expect(markup).toContain("role=\"status\"");
    expect(markup).toContain("role=\"alert\"");
  });

  test("renders customer text as escaped plain text with direction and reduced motion", () => {
    const markup = renderToStaticMarkup(
      <SafeText direction="ltr" maxLength={18} reducedMotion text="<script>alert('xss')</script>" />,
    );

    expect(markup).toMatch(/^<span\b/);
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("dir=\"ltr\"");
    expect(markup).toContain("transition:none");
  });

  test("renders loading, empty, and unavailable text states", () => {
    expect(renderToStaticMarkup(<SafeText loading text="" />)).toContain("جار التحميل");
    expect(renderToStaticMarkup(<SafeText emptyMessage="لا يوجد محتوى" text="" />)).toContain("لا يوجد محتوى");
    expect(renderToStaticMarkup(<SafeText text="" unavailableMessage="غير متاح" />)).toContain("غير متاح");
  });

  test("renders dialog action context and live feedback", () => {
    const markup = renderToStaticMarkup(
      <CommunicationActionDialog
        actionContext={{ action: "assign", expectedVersion: 1, reason: "Team handoff" }}
        actionLabel="تأكيد"
        cancelLabel="إلغاء"
        errorMessage="فشل الإجراء"
        message="هل تريد تأكيد هذا الإجراء؟"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
        pending
        successMessage="تم بنجاح"
        title="تأكيد الإجراء"
      />,
    );

    expect(markup).toContain("تأكيد الإجراء");
    expect(markup).toContain("Team handoff");
    expect(markup).toContain("role=\"status\"");
    expect(markup).toContain("role=\"alert\"");
  });

  test("restores focus to the trigger on cancel", async () => {
    const host = document.createElement("div");
    const trigger = document.createElement("button");
    const onCancel = vi.fn();
    let root: Root;

    trigger.textContent = "Open";
    document.body.append(trigger, host);
    trigger.focus();

    await act(async () => {
      root = createRoot(host);
      mountedRoots.push(root);
      root.render(
        <CommunicationActionDialog
          actionLabel="تأكيد"
          cancelLabel="إلغاء"
          message="هل تريد تأكيد هذا الإجراء؟"
          onCancel={onCancel}
          onConfirm={() => undefined}
          open
          title="تأكيد الإجراء"
          triggerRef={{ current: trigger }}
        />,
      );
    });

    const cancelButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "إلغاء");
    expect(cancelButton).toBeDefined();

    await act(async () => cancelButton?.click());

    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  test("renders permission denial without the confirm action", () => {
    const markup = renderToStaticMarkup(
      <CommunicationActionDialog
        actionLabel="تأكيد"
        cancelLabel="إلغاء"
        deniedMessage="غير مصرح بهذا الإجراء"
        message="هل تريد تأكيد هذا الإجراء؟"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
        permissionDenied
        title="تأكيد الإجراء"
      />,
    );

    expect(markup).toContain("غير مصرح بهذا الإجراء");
    expect(markup).not.toContain(">تأكيد</button>");
  });
});
