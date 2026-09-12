import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { http, HttpResponse } from "msw";
import { LocaleProvider } from "@/core/localization/provider";
import { mockServer } from "@/mocks/server";
import { DeletionDetailRoute, DeletionRequestsRoute } from "./PrivacyViews";

const deletionId = "13000000-0000-4000-8000-000000000021";
const roots: Root[] = [];

function deletionPage(status: "verified" | "failed" = "verified") {
  return {
    items: [{
      id: deletionId,
      status,
      requestedAt: "2026-09-12T10:00:00.000Z",
      coolingOffEndsAt: "2026-09-13T10:00:00.000Z",
      completedAt: null,
      version: status === "verified" ? 2 : 3,
    }],
    nextCursor: null,
  };
}

async function renderView(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    flushSync(() => root.render(
      <LocaleProvider locale="en" setLocale={() => undefined}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          {node}
        </QueryClientProvider>
      </LocaleProvider>,
    ));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  return host;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
  mockServer.use(
    http.get("/api/v1/admin/privacy/deletions", () => HttpResponse.json(deletionPage())),
  );
});

afterEach(async () => {
  process.env.NEXT_PUBLIC_ENABLE_MOCKS = "true";
  await Promise.all(roots.splice(0).map(async (root) => act(async () => root.unmount())));
  document.body.replaceChildren();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

describe("live account deletion views", () => {
  test("renders real workflow dates without inventing customer or checklist data", async () => {
    const host = await renderView(<DeletionRequestsRoute />);

    expect(host.textContent).toContain(deletionId);
    expect(host.textContent).toContain("Customer details are not exposed by this API");
    expect(host.textContent).toContain("Cooling-off ends");
    expect(host.textContent).toContain("No checklist data is exposed by this API");
    expect(host.textContent).not.toContain("undefined");
  });

  test("shows only a backend-supported action on the detail view", async () => {
    const host = await renderView(<DeletionDetailRoute requestId={deletionId} />);

    expect(host.textContent).toContain("Deletion Request");
    expect(host.querySelector("button")?.textContent?.toLowerCase()).toContain("cancel");
    expect(host.textContent).not.toMatch(/start|complete/i);
  });
});
