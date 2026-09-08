import { z } from "zod";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { configureApiTokenProvider, requestJson } from "./client";
import { ApiError } from "./errors";
import { sanitizeForLog } from "./safe-log";

const schema = z.object({ state: z.enum(["ready"]) }).strict();
const response = (status: number, value?: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(value),
  }) as unknown as Response;

describe("Admin strict HTTP client", () => {
  beforeEach(() => configureApiTokenProvider(async () => "clerk-session"));

  test("injects the Clerk bearer and preserves idempotency and version headers", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(response(200, { state: "ready" }));
    vi.stubGlobal("fetch", request);

    await expect(
      requestJson("/api/v1/admin/me", schema, {
        method: "PATCH",
        body: { locale: "en" },
        headers: {
          Authorization: "Bearer attacker",
          "Idempotency-Key": "profile-1",
          "If-Match": '"7"',
        },
      }),
    ).resolves.toEqual({ state: "ready" });

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer clerk-session",
          "Idempotency-Key": "profile-1",
          "If-Match": '"7"',
        }),
      }),
    );
  });

  test("reuses an automatic idempotency key after an ambiguous network failure", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response(200, { state: "ready" }));
    vi.stubGlobal("fetch", request);

    await expect(
      requestJson("/api/v1/admin/action", schema, {
        method: "POST",
        body: { value: 1 },
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    await requestJson("/api/v1/admin/action", schema, {
      method: "POST",
      body: { value: 1 },
    });

    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      "Idempotency-Key": request.mock.calls[1][1]?.headers["Idempotency-Key"],
    });
  });

  test("keeps an automatic idempotency key across consecutive retryable outcomes", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response(503, { code: "PROVIDER_UNAVAILABLE" }))
      .mockResolvedValueOnce(response(200, { state: "ready" }));
    vi.stubGlobal("fetch", request);
    const invoke = () =>
      requestJson("/api/v1/admin/action", schema, {
        method: "POST",
        body: { value: 2 },
      });

    await expect(invoke()).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(invoke()).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(invoke()).resolves.toEqual({ state: "ready" });

    const keys = request.mock.calls.map(
      (call) => call[1]?.headers["Idempotency-Key"],
    );
    expect(new Set(keys).size).toBe(1);
  });

  test.each([
    ["PROVIDER_UNAVAILABLE", "provider_unavailable"],
    ["INVALID_CURSOR", "validation_error"],
  ])("maps accepted API error %s", async (serverCode, clientCode) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(503, { code: serverCode })));
    await expect(requestJson("/known", schema)).rejects.toMatchObject({
      code: clientCode,
    });
  });

  test.each(["https://attacker.test/collect", "//attacker.test/collect", "relative"])(
    "rejects non-local request path %s before sending the Clerk bearer",
    async (path) => {
      const request = vi.fn();
      vi.stubGlobal("fetch", request);

      await expect(requestJson(path, schema)).rejects.toMatchObject({
        code: "contract_mismatch",
      });
      expect(request).not.toHaveBeenCalled();
    },
  );

  test("decodes flat safe errors and rejects unsupported codes without leaking messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(422, {
          code: "VALIDATION_FAILED",
          message: "secret provider detail",
        }),
      ),
    );
    await expect(requestJson("/known", schema)).rejects.toMatchObject({
      code: "validation_error",
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response(500, { code: "NEW_FATAL_STATE", message: "secret token" }),
        ),
    );
    const failure = await requestJson("/unknown", schema).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "contract_mismatch" });
    expect((failure as Error).message).not.toContain("secret");
  });

  test("requires explicit values for 204 and 304 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(204)));
    await expect(
      requestJson("/empty", z.null(), { emptyValue: null }),
    ).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(304)));
    await expect(
      requestJson("/cached", schema, {
        notModifiedValue: { state: "ready" },
      }),
    ).resolves.toEqual({ state: "ready" });

    await expect(requestJson("/missing-cache", schema)).rejects.toMatchObject({
      code: "contract_mismatch",
    });
  });

  test("fails explicitly on malformed JSON and unknown response states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
      } as unknown as Response),
    );
    await expect(requestJson("/malformed", schema)).rejects.toMatchObject({
      code: "contract_mismatch",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(200, { state: "future" })),
    );
    await expect(requestJson("/state", schema)).rejects.toMatchObject({
      code: "contract_mismatch",
    });
  });

  test("fails safely on timeouts and caller aborts", async () => {
    const pending = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () =>
            reject(
              Object.assign(new Error("aborted token=secret"), {
                name: "AbortError",
              }),
            );
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener("abort", abort);
        }),
    );
    vi.stubGlobal("fetch", pending);
    await expect(
      requestJson("/slow", schema, { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      requestJson("/aborted", schema, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  test("redacts request paths, tokens, payloads, and errors from logs", () => {
    expect(
      sanitizeForLog({
        path: "/api/v1/admin/me?email=person@example.test",
        authorization: "Bearer secret",
        payload: { name: "Person" },
        error: new Error("token secret"),
        status: 500,
      }),
    ).toEqual({
      path: "[REDACTED]",
      authorization: "[REDACTED]",
      payload: "[REDACTED]",
      error: "[REDACTED]",
      status: 500,
    });
  });
});
