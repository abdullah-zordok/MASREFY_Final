import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  configureApiActorProvider,
  configureApiTokenProvider,
  liveCursor,
  rememberLiveCursor,
  requestJson,
} from "@/core/api/client";
import { resolveRoutePermission } from "@/components/admin/shell-state";
import { accessRepository } from "@/features/access/repository";
import { foundationRepository } from "@/features/foundation/repository";
import { usersRepository } from "@/features/users/repository";
import { securityRepository } from "@/features/security/repository";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const response = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(value),
  }) as unknown as Response;

describe("Admin live identity boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MOCKS", "false");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  });

  afterEach(() => vi.unstubAllEnvs());

  test("mounts Clerk at the root and protects Admin routes in middleware", () => {
    const layout = source("src/app/layout.tsx");
    const proxyPath = resolve(process.cwd(), "src/proxy.ts");

    expect(layout).toContain("ClerkProvider");
    expect(layout).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(existsSync(proxyPath)).toBe(true);
    const proxy = existsSync(proxyPath) ? readFileSync(proxyPath, "utf8") : "";
    expect(proxy).toContain("clerkMiddleware");
    expect(proxy).toContain("createRouteMatcher");
    expect(proxy).toContain("/admin(.*)");
  });

  test("refreshes and forwards the Clerk bearer without role or scenario authority", async () => {
    const tokens = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("session-token-1")
      .mockResolvedValueOnce("session-token-2");
    configureApiTokenProvider(tokens);
    window.sessionStorage.setItem("admin-simulated-role", "super-admin");
    window.sessionStorage.setItem("admin-mock-scenario", "forbidden");
    const request = vi.fn().mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal("fetch", request);

    const schema = z.object({ ok: z.literal(true) }).strict();
    await requestJson("/api/v1/admin/access/me", schema);
    await requestJson("/api/v1/admin/access/me", schema);

    expect(tokens).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map((call) => call[1]?.headers)).toEqual([
      { accept: "application/json", Authorization: "Bearer session-token-1" },
      { accept: "application/json", Authorization: "Bearer session-token-2" },
    ]);
  });

  test("uses strict authoritative self-context and actor-scoped cache state", () => {
    const schemas = source("src/features/foundation/schemas.ts");
    const repository = source("src/features/foundation/repository.ts");
    const hooks = source("src/features/foundation/hooks.ts");
    const client = source("src/core/api/client.ts");

    expect(repository).toContain('/api/v1/admin/access/me');
    expect(repository).not.toContain('/api/v1/admin/session');
    expect(schemas).toContain("adminSelfContextSchema");
    expect(schemas).toContain("effectivePermissionKeys");
    expect(schemas).toContain("mfaStatus");
    expect(schemas).not.toContain("developmentOnly: z.literal(true)");
    expect(hooks).toMatch(/session:\s*\(actorId: string\)/);
    expect(client).toContain("actorProvider");
    expect(client).toContain("actorScopedCursorKey");
  });

  test("preserves exact recent-auth failures and denies unknown Admin routes", async () => {
    configureApiTokenProvider(async () => "session-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(403, { code: "RECENT_AUTH_REQUIRED" })),
    );

    await expect(
      requestJson("/api/v1/admin/access/roles", z.never()),
    ).rejects.toMatchObject({ code: "recent_auth_required" });
    expect(resolveRoutePermission("/admin/unregistered-sensitive-route")).toBe(
      "forbidden",
    );
  });

  test("uses opaque API identifiers and hides simulated roles outside demo/test", () => {
    const userContracts = source("src/features/users/contracts.ts");
    const shell = source("src/components/admin/AdminShell.tsx");

    expect(userContracts).not.toMatch(/\^USR-|USR-DEMO/);
    expect(shell).toContain("mocksEnabled()");
    expect(shell).toMatch(/demoMode\s*&&\s*<RoleSwitcher/);
  });

  test("isolates cursors and query state by Clerk actor", () => {
    configureApiActorProvider(() => "user_admin_a");
    expect(liveCursor("audit", 1)).toBeNull();
    rememberLiveCursor("audit", 1, "cursor-a");
    expect(liveCursor("audit", 2)).toBe("cursor-a");

    configureApiActorProvider(() => "user_admin_b");
    expect(liveCursor("audit", 1)).toBeNull();
    expect(() => liveCursor("audit", 2)).toThrow("CURSOR_PAGE_UNAVAILABLE");
  });

  test("omits simulated role and scenario query authority in live repositories", async () => {
    configureApiTokenProvider(async () => "session-token");
    const request = vi.fn().mockResolvedValue(response(200, { groups: [] }));
    vi.stubGlobal("fetch", request);

    await expect(foundationRepository.getNavigation("super-admin")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    await expect(usersRepository.getUser({
      userId: "user_target_1",
      role: "super-admin",
      scenario: "forbidden",
    })).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(accessRepository.listRequests(
      { scenario: "forbidden" },
      "super-admin",
    )).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(
      securityRepository.listAuditEvents({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });

    expect(request).not.toHaveBeenCalled();
  });
});
