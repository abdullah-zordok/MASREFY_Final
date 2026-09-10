import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { mockServer } from "@/mocks/server";
import {
  AiSettingsView,
  ImportSettingsView,
  MobileSettingsView,
  SecuritySettingsView,
  SettingsOverviewView,
  SubscriptionSettingsView,
  FeatureFlagsSettingsView,
  MaintenanceSettingsView,
} from "./SettingsViews";

const roots: Root[] = [];

async function renderView(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    flushSync(() => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          {node}
        </QueryClientProvider>,
      );
    });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  return host;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => act(async () => root.unmount())));
  delete process.env.NEXT_PUBLIC_ENABLE_MOCKS;
});

describe("US4 feature flag and maintenance views", () => {
  test("renders editable flags, read-only ended flags, and safe rollout update", async () => {
    const host = await renderView(<FeatureFlagsSettingsView />);
    expect(host.textContent).toContain("أعلام الميزات");
    expect(host.textContent).toContain("العلم المنتهي للقراءة فقط");
    await act(async () => {
      const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent === "تحديث النشر") as HTMLButtonElement;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(host.textContent).toContain("Feature flag updated safely");
    expect(host.textContent).not.toMatch(/customer id|custom audience/i);
  });

  test("renders maintenance transition controls and safe success", async () => {
    const host = await renderView(<MaintenanceSettingsView />);
    expect(host.textContent).toContain("الصيانة");
    expect(host.textContent).toContain("off");
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(host.textContent).toContain("Maintenance updated safely");
  });
});

describe("US3 settings views", () => {
  test("renders six settings forms without provider secrets", async () => {
    const views = [
      { node: <SettingsOverviewView key="general" />, text: "إعدادات النظام" },
      { node: <MobileSettingsView key="mobile" />, text: "إعدادات الجوال" },
      { node: <ImportSettingsView key="imports" />, text: "إعدادات الاستيراد" },
      { node: <AiSettingsView key="ai" />, text: "إعدادات الذكاء الاصطناعي" },
      { node: <SubscriptionSettingsView key="subscriptions" />, text: "الإصدار المجاني" },
      { node: <SecuritySettingsView key="security" />, text: "إعدادات الأمن" },
    ] as const;

    for (const { node, text } of views) {
      const host = await renderView(node);
      expect(host.textContent).toContain(text);
      expect(host.textContent).toContain("النسخة");
      expect(host.textContent).not.toMatch(/secret|api key|credential|token/i);
    }
  });

  test("saves changed fields atomically and preserves permission denial", async () => {
    const host = await renderView(<MobileSettingsView />);
    await act(async () => {
      (host.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(host.textContent).toContain("تم حفظ الإعدادات بشكل ذري");

    window.sessionStorage.setItem("admin-simulated-role", "support-agent");
    const denied = await renderView(<MobileSettingsView />);
    expect(denied.textContent).toContain("operations.settings.read");
  });

  test("submits the operator-entered live setting value instead of a constant", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    let submitted: unknown;
    mockServer.use(
      http.get("/api/v1/admin/settings/operations.performance.series_limit", () =>
        HttpResponse.json({ key: "operations.performance.series_limit", value: 120, sensitivity: "internal", redacted: false, version: 2, updatedAt: "2026-09-06T13:00:00.000Z" }),
      ),
      http.patch("/api/v1/admin/settings/operations.performance.series_limit", async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ resourceId: "operations.performance.series_limit", status: "updated", version: 3 });
      }),
    );
    const host = await renderView(<MobileSettingsView />);
    const input = host.querySelector('input[name="value"]') as HTMLInputElement;
    expect(input.value).toBe("120");
    input.value = "240";
    await act(async () => {
      (host.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(submitted).toMatchObject({ value: 240, expectedVersion: 2 });
  });
});
