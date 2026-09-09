import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { http, HttpResponse } from "msw";
import { mockServer } from "@/mocks/server";
import { aiRepository } from "@/features/ai/repository";

const id = "99000000-0000-4000-8000-000000000001";

describe("Phase 09 live Admin AI mapping", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ENABLE_MOCKS;
  });

  test("accepts the backend wire page, maps UI-safe records, and exposes route management", async () => {
    process.env.NEXT_PUBLIC_ENABLE_MOCKS = "false";
    mockServer.use(
      http.get("/api/v1/admin/ai/providers", () =>
        HttpResponse.json({
          items: [
            {
              id,
              kind: "provider",
              version: 2,
              data: {
                key: "openrouter",
                displayName: "OpenRouter",
                approved: true,
                zdrCapable: true,
                trainingPolicy: "no_training",
                retentionReviewedAt: "2026-09-03T00:00:00.000Z",
                createdAt: "2026-09-03T00:00:00.000Z",
                updatedAt: "2026-09-03T00:00:00.000Z",
              },
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get("/api/v1/admin/ai/routes", () =>
        HttpResponse.json({
          items: [{ id, kind: "route", version: 3, data: route(true) }],
          nextCursor: null,
        }),
      ),
      http.patch(`/api/v1/admin/ai/routes/${id}`, () =>
        HttpResponse.json({
          id,
          kind: "route",
          version: 4,
          data: route(false),
        }),
      ),
    );
    await expect(
      aiRepository.listProviders({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      items: [{ name: "OpenRouter", health: "healthy", revision: 2 }],
    });
    await expect(
      aiRepository.listRoutes({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({ items: [{ kind: "route", version: 3 }] });
    await expect(
      aiRepository.updateRoute(`AIR-${id}`, {
        expectedVersion: 3,
        reason: "Disable route during provider incident",
        enabled: false,
      }),
    ).resolves.toMatchObject({ version: 4 });
  });

  test("contains no fixture confirmation token or provider credential", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/ai/repository.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /CONFIRM-SPEC-006|OPENROUTER_API_KEY|Bearer\s+sk-/i,
    );
  });
});

function route(enabled: boolean) {
  return {
    workload: "financial_assistant",
    primaryModelId: id,
    fallbackModelIds: ["99000000-0000-4000-8000-000000000002"],
    providerAllowlist: ["openai"],
    zdrRequired: true,
    maxPrice: { prompt: "0.1", completion: "0.2" },
    limits: {
      inputTokens: 100,
      outputTokens: 50,
      timeoutMs: 1000,
      monthlyBudget: "10",
    },
    enabled,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}
