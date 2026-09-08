import { describe, expect, test } from "vitest";
import { validateAdminServerRuntime } from "./server-runtime";

const live = {
  NODE_ENV: "production",
  CLERK_SECRET_KEY: ["sk", "live", "bWFzYXJpZmkudGVzdCQ"].join("_"),
};

describe("Admin server runtime", () => {
  test("requires the server-only Clerk live secret in production", () => {
    expect(() => validateAdminServerRuntime(live)).not.toThrow();
    expect(() =>
      validateAdminServerRuntime({ NODE_ENV: "production" }),
    ).toThrow("Clerk secret");
    expect(() =>
      validateAdminServerRuntime({ ...live, CLERK_SECRET_KEY: "sk_test_example" }),
    ).toThrow("Clerk secret");
  });
});
