import { describe, expect, test } from "vitest";
import { resolveAdminRuntime } from "./runtime";

const liveEnvironment = {
  NEXT_PUBLIC_CLIENT_MODE: "live",
  NEXT_PUBLIC_API_URL: "https://api.masarifi.test",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_bWFzYXJpZmkudGVzdCQ",
};

describe("Admin runtime policy", () => {
  test.each(["live", "demo", "test"] as const)(
    "accepts the explicit %s mode outside production",
    (mode) => {
      expect(
        resolveAdminRuntime(
          mode === "live"
            ? liveEnvironment
            : { NEXT_PUBLIC_CLIENT_MODE: mode },
          "development",
        ).mode,
      ).toBe(mode);
    },
  );

  test.each(["demo", "test"] as const)("rejects %s mode in production", (mode) => {
    expect(() =>
      resolveAdminRuntime({ NEXT_PUBLIC_CLIENT_MODE: mode }, "production"),
    ).toThrow("production requires live client mode");
  });

  test("requires live HTTPS API and Clerk configuration", () => {
    expect(() =>
      resolveAdminRuntime(
        { ...liveEnvironment, NEXT_PUBLIC_API_URL: "http://api.masarifi.test" },
        "development",
      ),
    ).toThrow("valid HTTPS API URL");
    expect(() =>
      resolveAdminRuntime(
        {
          ...liveEnvironment,
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_live_secret",
        },
        "development",
      ),
    ).toThrow("valid Clerk publishable key");
    expect(() => resolveAdminRuntime(liveEnvironment, "production")).toThrow(
      "production Clerk publishable key",
    );
  });

  test("rejects production mocks and client-controlled authority", () => {
    expect(() =>
      resolveAdminRuntime(
        { ...liveEnvironment, NEXT_PUBLIC_ENABLE_MOCKS: "true" },
        "production",
      ),
    ).toThrow("production mocks are forbidden");
    for (const name of [
      "NEXT_PUBLIC_MOCK_SCENARIO",
      "NEXT_PUBLIC_ADMIN_ROLE",
    ]) {
      expect(() =>
        resolveAdminRuntime(
          { ...liveEnvironment, [name]: "super-admin" },
          "development",
        ),
      ).toThrow("client authority variable");
    }
  });

  test.each([
    "NEXT_PUBLIC_OPENROUTER_API_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_SECRET_KEY",
  ])("rejects forbidden public secret variable %s", (name) => {
    expect(() =>
      resolveAdminRuntime(
        { ...liveEnvironment, [name]: "exposed" },
        "development",
      ),
    ).toThrow("forbidden public secret variable");
  });

  test("keeps billing unavailable", () => {
    expect(resolveAdminRuntime(liveEnvironment, "development").billingAvailable).toBe(
      false,
    );
  });
});
