import type { z } from "zod";
import {
  ApiError,
  normalizeApiError,
  normalizeHttpStatus,
  safeApiMessage,
  type ApiErrorCode,
} from "./errors";
import { ADMIN_ROLES } from "@/core/permissions/permissions";

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };
const cursorPages = new Map<string, Map<number, string | null>>();

export function mocksAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function mocksEnabled(): boolean {
  return (
    mocksAllowed() &&
    (process.env.NODE_ENV === "test" ||
      process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true") &&
    process.env.NEXT_PUBLIC_ENABLE_MOCKS !== "false"
  );
}

export function liveCursor(scope: string, page: number): string | null {
  if (page === 1) {
    cursorPages.set(scope, new Map([[1, null]]));
    return null;
  }
  const cursor = cursorPages.get(scope)?.get(page);
  if (cursor === undefined) throw new Error("CURSOR_PAGE_UNAVAILABLE");
  return cursor;
}

export function rememberLiveCursor(scope: string, page: number, next: string | null): void {
  cursorPages.get(scope)?.set(page + 1, next);
}

function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  if (typeof window !== "undefined") return path;
  return new URL(path, "http://localhost").toString();
}

const ALLOWED_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  "validation_error",
  "forbidden",
  "not_found",
  "conflict",
  "session_expired",
  "gone",
  "rate_limited",
  "provider_unavailable",
  "internal_error",
]);

async function parseError(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = normalizeHttpStatus(response.status);

  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      (("code" in payload &&
        typeof payload.code === "string" &&
        ALLOWED_ERROR_CODES.has(payload.code)) ||
        ("error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "code" in payload.error &&
          typeof payload.error.code === "string" &&
          ALLOWED_ERROR_CODES.has(payload.error.code)))
    ) {
      code = (
        "code" in payload
          ? payload.code
          : (payload.error as { code: string }).code
      ) as ApiErrorCode;
    }
  } catch {
    // The safe status-derived message is sufficient.
  }

  return new ApiError(code, safeApiMessage(code), response.status);
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  try {
    const developmentScenario =
      mocksEnabled() && typeof window !== "undefined"
        ? window.sessionStorage.getItem("admin-mock-scenario")
        : null;
    const simulatedRole =
      mocksEnabled() && typeof window !== "undefined"
        ? window.sessionStorage.getItem("admin-simulated-role")
        : null;

    const headers: Record<string, string> = {
      accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(developmentScenario
        ? { "x-mock-scenario": developmentScenario }
        : {}),
      ...(simulatedRole && ADMIN_ROLES.some((role) => role === simulatedRole)
        ? { "x-admin-simulated-role": simulatedRole }
        : {}),
      ...((options.headers as Record<string, string>) || {}),
    };
    if (
      options.method &&
      options.method !== "GET" &&
      !headers["Idempotency-Key"]
    ) {
      headers["Idempotency-Key"] = crypto.randomUUID();
    }

    const response = await fetch(apiUrl(path), {
      ...options,
      credentials: "same-origin",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) throw await parseError(response);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiError(
        "validation_error",
        safeApiMessage("validation_error"),
        502,
      );
    }
    return parsed.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export const apiClient = {
  get<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    return requestJson(path, schema, options);
  },
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return requestJson(path, schema, { method: "POST", body });
  },
  patch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return requestJson(path, schema, { method: "PATCH", body });
  },
};
