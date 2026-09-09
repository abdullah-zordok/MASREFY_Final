import type { z } from "zod";
import {
  ApiError,
  normalizeApiError,
  safeApiMessage,
  type ApiErrorCode,
} from "./errors";
import { ADMIN_ROLES } from "@/core/permissions/permissions";
import { mocksAllowed, mocksEnabled } from "@/core/config/runtime";
import { safeDevelopmentLog } from "./safe-log";

export { mocksAllowed, mocksEnabled };

type TokenProvider = () => Promise<string | null>;
type ActorProvider = () => string | null;
type RequestOptions<T = unknown> = Omit<RequestInit, "body"> & {
  body?: unknown;
  emptyValue?: T;
  notModifiedValue?: T;
  timeoutMs?: number;
};
const cursorPages = new Map<string, Map<number, string | null>>();
const automaticOperationIds = new Map<
  string,
  { id: string; expiresAt: number }
>();
const AUTOMATIC_OPERATION_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_AUTOMATIC_OPERATIONS = 256;
let tokenProvider: TokenProvider | null = null;
let actorProvider: ActorProvider | null = null;

export function configureApiTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export function configureApiActorProvider(provider: ActorProvider): void {
  actorProvider = provider;
}

function actorScopedCursorKey(scope: string): string {
  const actor = actorProvider?.();
  if (!actor && !mocksEnabled())
    throw new ApiError(
      "session_expired",
      safeApiMessage("session_expired"),
      401,
    );
  return `${actor ?? "mock"}:${scope}`;
}

export function liveCursor(scope: string, page: number): string | null {
  const key = actorScopedCursorKey(scope);
  if (page === 1) {
    cursorPages.set(key, new Map([[1, null]]));
    return null;
  }
  const cursor = cursorPages.get(key)?.get(page);
  if (cursor === undefined) throw new Error("CURSOR_PAGE_UNAVAILABLE");
  return cursor;
}

export function rememberLiveCursor(
  scope: string,
  page: number,
  next: string | null,
): void {
  cursorPages.get(actorScopedCursorKey(scope))?.set(page + 1, next);
}

function apiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new ApiError(
      "contract_mismatch",
      safeApiMessage("contract_mismatch"),
      500,
    );
  const origin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/u, "");
  if (origin) return `${origin}${path}`;
  if (typeof window !== "undefined") return path;
  return new URL(path, "http://localhost").toString();
}

const ALLOWED_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  "validation_error",
  "forbidden",
  "not_found",
  "conflict",
  "session_expired",
  "recent_auth_required",
  "gone",
  "rate_limited",
  "provider_unavailable",
  "contract_mismatch",
  "internal_error",
]);

const SERVER_ERROR_CODES: Readonly<Record<string, ApiErrorCode>> = {
  VALIDATION_FAILED: "validation_error",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  VERSION_CONFLICT: "conflict",
  AUTH_TOKEN_INVALID: "session_expired",
  RECENT_AUTH_REQUIRED: "recent_auth_required",
  GONE: "gone",
  RATE_LIMITED: "rate_limited",
  SERVICE_UNAVAILABLE: "provider_unavailable",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  INVALID_CURSOR: "validation_error",
  ADMIN_PERMISSION_DENIED: "forbidden",
  AI_ADMIN_CONFLICT: "conflict",
  AI_PROMPT_TEST_CONFLICT: "conflict",
  AI_PROMPT_PUBLISH_CONFLICT: "conflict",
  AI_MUTATION_INVALID: "validation_error",
  AI_ROUTE_POLICY_INVALID: "validation_error",
};

export function unavailableClientOperation(): Promise<never> {
  return Promise.reject(
    new ApiError(
      "provider_unavailable",
      safeApiMessage("provider_unavailable"),
      503,
    ),
  );
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("invalid error envelope");
    const rawCode = Reflect.get(payload, "code");
    const code =
      typeof rawCode === "string" && ALLOWED_ERROR_CODES.has(rawCode)
        ? (rawCode as ApiErrorCode)
        : typeof rawCode === "string"
          ? SERVER_ERROR_CODES[rawCode]
          : undefined;
    if (!code) throw new Error("unsupported error code");
    return new ApiError(code, safeApiMessage(code), response.status);
  } catch {
    return new ApiError(
      "contract_mismatch",
      safeApiMessage("contract_mismatch"),
      response.status,
    );
  }
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions<T> = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs ?? 15_000);

  let automaticOperationKey: string | null = null;
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
      ...headerRecord(options.headers),
    };
    if (
      options.method &&
      options.method !== "GET" &&
      !headers["Idempotency-Key"]
    ) {
      automaticOperationKey = await operationKey([
        actorProvider?.() ?? "mock",
        options.method,
        path,
        options.body,
      ]);
      headers["Idempotency-Key"] = automaticOperationId(automaticOperationKey);
    }
    const token = await tokenProvider?.();
    if (token) setHeader(headers, "Authorization", `Bearer ${token}`);
    else if (!mocksEnabled())
      throw new ApiError(
        "session_expired",
        safeApiMessage("session_expired"),
        401,
      );

    const response = await fetch(apiUrl(path), {
      method: options.method,
      cache: options.cache,
      credentials: "same-origin",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (response.status === 204) {
      const value = parseKnownValue(schema, options, "emptyValue");
      if (automaticOperationKey)
        automaticOperationIds.delete(automaticOperationKey);
      return value;
    }
    if (response.status === 304) {
      const value = parseKnownValue(schema, options, "notModifiedValue");
      if (automaticOperationKey)
        automaticOperationIds.delete(automaticOperationKey);
      return value;
    }
    if (!response.ok) throw await parseError(response);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError(
        "contract_mismatch",
        safeApiMessage("contract_mismatch"),
        502,
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(
        "contract_mismatch",
        safeApiMessage("contract_mismatch"),
        502,
      );
    }
    if (automaticOperationKey)
      automaticOperationIds.delete(automaticOperationKey);
    return parsed.data;
  } catch (error) {
    const failure =
      controller.signal.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TypeError"))
        ? new ApiError(
            "provider_unavailable",
            safeApiMessage("provider_unavailable"),
            503,
          )
        : normalizeApiError(error);
    if (
      automaticOperationKey &&
      failure.code !== "provider_unavailable" &&
      failure.status !== 409 &&
      failure.status < 500
    )
      automaticOperationIds.delete(automaticOperationKey);
    safeDevelopmentLog("request-failed", {
      path,
      error: failure,
      status: failure.status,
    });
    throw failure;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

async function operationKey(parts: unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(parts)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function automaticOperationId(key: string): string {
  const now = Date.now();
  for (const [cachedKey, value] of automaticOperationIds)
    if (value.expiresAt <= now) automaticOperationIds.delete(cachedKey);
  const cached = automaticOperationIds.get(key);
  if (cached) return cached.id;
  if (automaticOperationIds.size >= MAX_AUTOMATIC_OPERATIONS) {
    const oldest = automaticOperationIds.keys().next().value;
    if (oldest) automaticOperationIds.delete(oldest);
  }
  const id = crypto.randomUUID();
  automaticOperationIds.set(key, {
    id,
    expiresAt: now + AUTOMATIC_OPERATION_TTL_MS,
  });
  return id;
}

function parseKnownValue<T>(
  schema: z.ZodType<T>,
  options: RequestOptions<T>,
  key: "emptyValue" | "notModifiedValue",
): T {
  if (!(key in options))
    throw new ApiError(
      "contract_mismatch",
      safeApiMessage("contract_mismatch"),
      502,
    );
  const parsed = schema.safeParse(options[key]);
  if (!parsed.success)
    throw new ApiError(
      "contract_mismatch",
      safeApiMessage("contract_mismatch"),
      502,
    );
  return parsed.data;
}

function setHeader(
  headers: Record<string, string>,
  name: string,
  value: string,
): void {
  for (const key of Object.keys(headers))
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  headers[name] = value;
}

function headerRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  if (value instanceof Headers) return Object.fromEntries(value.entries());
  if (Array.isArray(value)) return Object.fromEntries(value);
  return { ...value };
}

export const apiClient = {
  get<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions<T> = {},
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
