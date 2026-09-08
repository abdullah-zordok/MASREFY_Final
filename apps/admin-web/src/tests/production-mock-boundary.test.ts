import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Admin production mock boundary", () => {
  test("fails every unhandled API request and contains no bypass mode", () => {
    const provider = readFileSync(
      resolve(process.cwd(), "src/app/MockProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain('pathname.startsWith("/api/")');
    expect(provider).toContain("print.error()");
    expect(provider).not.toContain('onUnhandledRequest: "bypass"');
  });

  test("loads the browser worker only behind the runtime mock policy", () => {
    const provider = readFileSync(
      resolve(process.cwd(), "src/app/MockProvider.tsx"),
      "utf8",
    );
    expect(provider).toContain("mocksEnabled()");
    expect(provider).toContain('import("@/mocks/browser")');
  });

  test("exposes the public mock flag to the browser bundle with a static env access", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "src/core/config/runtime.ts"),
      "utf8",
    );
    expect(runtime).toContain("process.env.NEXT_PUBLIC_ENABLE_MOCKS");
  });
});
