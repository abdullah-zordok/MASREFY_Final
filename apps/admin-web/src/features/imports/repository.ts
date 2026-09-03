import { apiClient, requestJson } from "@/core/api/client";
import { z } from "zod";
import {
  buildListQuery,
  importOverviewSchema,
  importSessionDetailSchema,
  importsQuerySchema,
  importsResponseSchema,
  listQuerySchema,
  operationalListSchema,
  operationalRecordSchema,
  phase4ActionRequestSchema,
  phase4ActionResultSchema,
  retryImportResponseSchema,
  safeIdSchema,
  type ImportOverview,
  type ImportSessionDetail,
  type ImportsQuery,
  type ImportsResponse,
  type ListQuery,
  type OperationalList,
  type OperationalRecord,
  type Phase4ActionRequest,
  type Phase4ActionResult,
  type Phase4Resource,
  type PlatformScope,
} from "./contracts";

export interface ImportsRepository {
  getImports(input: ImportsQuery): Promise<ImportsResponse>;
  retryImport(
    id: string,
    expectedRevision: number,
    scenario?: string,
  ): Promise<{
    id: string;
    status: "scheduled";
    auditEvent: "admin.import.retry.requested";
  }>;
}

const resourcePaths: Record<Phase4Resource, string> = {
  sessions: "/api/v1/admin/imports/sessions",
  failures: "/api/v1/admin/imports/failures",
  "low-confidence": "/api/v1/admin/imports/low-confidence",
  duplicates: "/api/v1/admin/imports/duplicates",
  unsupported: "/api/v1/admin/imports/unsupported-formats",
  banks: "/api/v1/admin/parsers/institutions",
  senders: "/api/v1/admin/parsers/senders",
  "parser-rules": "/api/v1/admin/parsers/rules",
  "test-cases": "/api/v1/admin/parsers/test-cases",
  versions: "/api/v1/admin/parsers/versions",
  "merchant-rules": "/api/v1/admin/parsers/merchant-rules",
  "category-rules": "/api/v1/admin/parsers/category-rules",
};

const unknownSchema = z.unknown();
const mocksEnabled = () => process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(object);
  const payload = object(value);
  const list = payload.data ?? payload.items;
  return Array.isArray(list) ? list.map(object) : [];
}

function source(value: unknown): "android_sms" | "csv" | "manual" {
  if (value === "sms") return "android_sms";
  if (value === "file") return "csv";
  return "manual";
}

function sourceType(value: ListQuery["source"]): string | undefined {
  if (!value) return undefined;
  if (value.includes("sms") || value === "android_notification") return "sms";
  if (["csv", "pdf_statement", "screenshot", "receipt"].includes(value))
    return "file";
  return "manual";
}

function liveListParams(input: ListQuery, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ limit: String(input.pageSize) });
  const filters = {
    cursor,
    search: input.search,
    status: input.status,
    sourceType: sourceType(input.source),
    institutionId: input.bankId,
    parserVersionId: input.parserVersionId,
    from: input.dateFrom,
    to: input.dateTo,
  };
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return params;
}

function recordFor(
  resource: Phase4Resource,
  value: Record<string, unknown>,
): OperationalRecord {
  const timestamp = String(
    value.updatedAt ?? value.createdAt ?? new Date(0).toISOString(),
  );
  return operationalRecordSchema.parse({
    id: String(value.id),
    kind: resource,
    title: String(value.name ?? value.displayLabel ?? value.code ?? value.id),
    secondary: String(
      value.sourceType ?? value.countryCode ?? value.status ?? resource,
    ),
    status: String(
      value.status ?? (value.active === false ? "inactive" : "active"),
    ),
    ...(value.sourceType ? { source: source(value.sourceType) } : {}),
    ...(typeof value.confidenceBasisPoints === "number"
      ? { confidence: value.confidenceBasisPoints / 10_000 }
      : {}),
    ...(typeof value.priority === "number" ? { priority: value.priority } : {}),
    updatedAt: timestamp,
    accessLevel: "full",
    revision: Number(value.version ?? 1),
    actions: [],
  });
}

function actionPayload(input: Phase4ActionRequest): Record<string, unknown> {
  return {
    action: input.action === "release" ? "publish" : input.action,
    reason: input.reason,
    expectedVersion: input.expectedRevision,
    ...(input.proposal ? { patch: input.proposal } : {}),
  };
}

function actionTarget(
  resource: Phase4Resource,
  id: string,
  action: Phase4ActionRequest["action"],
): { path: string; method: "POST" | "PATCH" } {
  const encodedId = encodeURIComponent(safeIdSchema.parse(id));
  if (resource === "sessions")
    return {
      path: `${resourcePaths.sessions}/${encodedId}/retry-handoff`,
      method: "POST",
    };
  if (resource === "low-confidence")
    return {
      path: `${resourcePaths[resource]}/${encodedId}/review`,
      method: "POST",
    };
  if (resource === "duplicates")
    return {
      path: `${resourcePaths[resource]}/${encodedId}/resolve`,
      method: "POST",
    };
  if (resource === "parser-rules" && action === "test") {
    return {
      path: `${resourcePaths[resource]}/${encodedId}/test-preview`,
      method: "POST",
    };
  }
  if (resource === "versions")
    return {
      path: `${resourcePaths[resource]}/${encodedId}/${action === "release" ? "publish" : "action"}`,
      method: "POST",
    };
  if (["unsupported", "senders", "failures"].includes(resource))
    return {
      path: `${resourcePaths[resource]}/${encodedId}/action`,
      method: "POST",
    };
  return { path: `${resourcePaths[resource]}/${encodedId}`, method: "PATCH" };
}

export const importsRepository: ImportsRepository = {
  async getImports(input) {
    const query = importsQuerySchema.parse(input);
    if (!mocksEnabled()) {
      const [overview, sessions] = await Promise.all([
        phase4Repository.getOverview(query.platform ?? "all"),
        phase4Repository.list("sessions", {
          page: query.page,
          pageSize: query.pageSize,
        }),
      ]);
      return importsResponseSchema.parse({
        metrics: [
          { label: "Sessions", value: String(overview.totalSessions) },
          { label: "Items", value: String(overview.totalItems) },
          {
            label: "Failed",
            value: String(overview.failedSessions),
            tone: "attention",
          },
        ],
        items: sessions.items.map((item) => ({
          id: item.id,
          user: "USR-00***",
          source: item.source ?? "manual",
          bank: item.bank ?? "Unknown",
          platform: item.platform === "ios" ? "iOS" : "Android",
          failureType: item.status,
          parserVersion: item.version ?? "unassigned",
          attempts: 0,
          revision: item.revision,
          severity: item.status === "failed" ? "high" : "info",
          time: item.updatedAt,
          status:
            item.status === "review"
              ? "review"
              : item.status === "failed"
                ? "failed"
                : "unsupported",
          appVersion: "server",
          sanitizedResult: "Raw payload and customer identifiers are withheld.",
        })),
        failureTrend: [],
        sourceVolume: [],
        sourceSuccess: [],
        processingTimes: [],
        page: query.page,
        pageSize: query.pageSize,
        totalItems: sessions.totalItems,
        totalPages: sessions.totalPages,
      });
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "")
        params.set(key === "scenario" ? "__scenario" : key, String(value));
    }
    return apiClient.get(
      `/api/v1/admin/imports?${params}`,
      importsResponseSchema,
    );
  },
  async retryImport(id, expectedRevision, scenario) {
    const params = scenario
      ? `?__scenario=${encodeURIComponent(scenario)}`
      : "";
    const request = phase4ActionRequestSchema.parse({
      action: "retry_handoff",
      expectedState: "failed",
      expectedRevision,
      reason: "إعادة محاولة مؤكدة من واجهة الإدارة التجريبية",
    });
    const encodedId = encodeURIComponent(safeIdSchema.parse(id));
    const path = `/api/v1/admin/imports/${encodedId}/retry${params}`;
    if (mocksEnabled())
      return apiClient.post(path, request, retryImportResponseSchema);
    await requestJson(
      `/api/v1/admin/imports/sessions/${encodedId}/retry-handoff`,
      unknownSchema,
      {
        method: "POST",
        body: actionPayload(request),
        headers: {
          "Idempotency-Key": `tracking-admin:sessions:${id}:retry_handoff:${expectedRevision}`,
        },
      },
    );
    return {
      id,
      status: "scheduled" as const,
      auditEvent: "admin.import.retry.requested" as const,
    };
  },
};

export const phase4Repository = {
  getOverview(platform: PlatformScope): Promise<ImportOverview> {
    const parsedPlatform = platform === "unknown" ? "all" : platform;
    if (mocksEnabled())
      return apiClient.get(
        `/api/v1/admin/imports/overview?platform=${encodeURIComponent(parsedPlatform)}`,
        importOverviewSchema,
      );
    return apiClient
      .get("/api/v1/admin/imports/overview", unknownSchema)
      .then((payload) => {
        const value = object(payload);
        return importOverviewSchema.parse({
          platform: parsedPlatform,
          uniqueCustomers: Number(value.uniqueCustomers ?? 0),
          uniqueCustomerSemantics: "authoritative",
          totalSessions: Number(value.totalSessions ?? value.sessions ?? 0),
          totalItems: Number(value.totalItems ?? 0),
          failedSessions: Number(value.failedSessions ?? value.failed ?? 0),
          highestFailureSource: source(value.highestFailureSource),
          eventDeduplication: "non_duplicated_events",
          region: { availability: "available" },
        });
      });
  },

  async list(
    resource: Phase4Resource,
    input: ListQuery,
  ): Promise<OperationalList> {
    const params = buildListQuery(listQuerySchema, input);
    if (mocksEnabled())
      return apiClient.get(
        `${resourcePaths[resource]}?${params}`,
        operationalListSchema,
      );
    let cursor: string | undefined;
    let payload: unknown = {};
    for (let page = 1; page <= input.page; page += 1) {
      payload = await apiClient.get(
        `${resourcePaths[resource]}?${liveListParams(input, cursor)}`,
        unknownSchema,
      );
      const next = object(payload).nextCursor;
      if (page < input.page && typeof next !== "string")
        return operationalListSchema.parse({
          items: [],
          page: input.page,
          pageSize: input.pageSize,
          totalItems: 0,
          totalPages: page,
          region: { availability: "empty" },
        });
      cursor = typeof next === "string" ? next : undefined;
    }
    const items = rows(payload).map((entry) => recordFor(resource, entry));
    return operationalListSchema.parse({
      items,
      page: input.page,
      pageSize: input.pageSize,
      totalItems:
        (input.page - 1) * input.pageSize + items.length + (cursor ? 1 : 0),
      totalPages: input.page + (cursor ? 1 : 0),
      region: { availability: items.length ? "available" : "empty" },
    });
  },

  getDetail(
    resource: Extract<Phase4Resource, "sessions" | "banks" | "parser-rules">,
    id: string,
  ): Promise<ImportSessionDetail | OperationalRecord> {
    const encodedId = encodeURIComponent(safeIdSchema.parse(id));
    const schema =
      resource === "sessions"
        ? importSessionDetailSchema
        : operationalRecordSchema;
    if (mocksEnabled())
      return apiClient.get(`${resourcePaths[resource]}/${encodedId}`, schema);
    return apiClient
      .get(`${resourcePaths[resource]}/${encodedId}`, unknownSchema, {
        headers:
          resource === "sessions"
            ? {
                "X-Access-Purpose":
                  "Investigating selected import session diagnostics",
              }
            : {},
      })
      .then((payload) => {
        const value =
          rows(payload)[0] ?? object(object(payload).data ?? payload);
        const item = recordFor(resource, value);
        if (resource !== "sessions") return operationalRecordSchema.parse(item);
        return importSessionDetailSchema.parse({
          ...item,
          timeline: [],
          totalItems: Number(value.itemCount ?? 0),
          successfulItems: Number(value.acceptedCount ?? 0),
          failedItems: Number(value.rejectedCount ?? 0),
          expectedCurrentState: item.status,
          auditReferences: [],
        });
      });
  },

  act(
    resource: Phase4Resource,
    id: string,
    input: Phase4ActionRequest,
  ): Promise<Phase4ActionResult> {
    const request = phase4ActionRequestSchema.parse(input);
    const target = actionTarget(resource, id, request.action);
    const execute =
      target.method === "PATCH" ? apiClient.patch : apiClient.post;
    if (mocksEnabled())
      return execute(target.path, request, phase4ActionResultSchema);
    const body =
      resource === "parser-rules" && request.action === "test"
        ? { sample: request.proposal?.title ?? "test" }
        : actionPayload(request);
    return requestJson(target.path, unknownSchema, {
      method: target.method,
      body,
      headers: {
        "Idempotency-Key": `tracking-admin:${resource}:${id}:${request.action}:${request.expectedRevision}`,
      },
    }).then((payload) => {
      const envelope = object(payload);
      const value = object(envelope.resource ?? envelope.data ?? payload);
      return phase4ActionResultSchema.parse({
        affectedId: String(value.id ?? id),
        previousState: request.expectedState,
        currentState: String(value.status ?? request.expectedState),
        outcome: "success",
        message: "Operation completed.",
        auditReference: {
          eventId: String(envelope.operationId ?? crypto.randomUUID()),
          eventName: `tracking.admin.${request.action}`,
          timestamp: new Date().toISOString(),
        },
      });
    });
  },
};
