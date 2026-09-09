import {
  apiClient,
  mocksAllowed,
  requestJson,
  unavailableClientOperation,
} from "@/core/api/client";
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

const nullableDateTime = z.iso.datetime({ offset: true }).nullable();
const liveRecordSchema = z
  .object({
    id: z.string().min(1),
    sourceType: z.enum(["sms", "file", "manual", "provider"]).optional(),
    sourceName: z.string().max(120).nullable().optional(),
    schemaVersion: z.literal(1).optional(),
    status: z.string().min(1).max(40).optional(),
    itemCount: z.number().int().nonnegative().optional(),
    acceptedCount: z.number().int().nonnegative().optional(),
    rejectedCount: z.number().int().nonnegative().optional(),
    attemptCount: z.number().int().nonnegative().optional(),
    nextAttemptAt: z.iso.datetime({ offset: true }).optional(),
    startedAt: z.iso.datetime({ offset: true }).optional(),
    completedAt: nullableDateTime.optional(),
    sessionId: z.string().optional(),
    importItemId: z.string().optional(),
    kind: z.string().max(40).optional(),
    leftItemId: z.string().optional(),
    rightTransactionId: z.string().optional(),
    reason: z.string().max(160).optional(),
    confidenceBasisPoints: z.number().int().min(0).max(10_000).optional(),
    scoreBasisPoints: z.number().int().min(0).max(10_000).optional(),
    resolution: z.string().nullable().optional(),
    decidedAt: nullableDateTime.optional(),
    reviewedAt: nullableDateTime.optional(),
    reviewedBy: z.string().max(128).nullable().optional(),
    operatorAction: z.string().max(40).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    name: z.string().max(120).optional(),
    code: z.string().max(40).optional(),
    active: z.boolean().optional(),
    institutionId: z.string().nullable().optional(),
    displayLabel: z.string().max(120).optional(),
    priority: z.number().int().min(0).max(10_000).optional(),
    activeVersionId: z.string().nullable().optional(),
    parserRuleId: z.string().optional(),
    ruleId: z.string().optional(),
    versionId: z.string().optional(),
    parserVersionId: z.string().nullable().optional(),
    versionNo: z.number().int().positive().optional(),
    versionNumber: z.number().int().positive().optional(),
    definitionHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    createdBy: z.string().max(128).optional(),
    publishedAt: nullableDateTime.optional(),
    corpusStatus: z
      .enum(["not_run", "queued", "running", "passed", "failed"])
      .optional(),
    corpusRequestedAt: nullableDateTime.optional(),
    corpusAttemptCount: z.number().int().min(0).max(5).optional(),
    corpusNextAttemptAt: z.iso.datetime({ offset: true }).optional(),
    corpusLastErrorCode: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    lastResult: z.string().nullable().optional(),
    lastRunAt: nullableDateTime.optional(),
    normalizedMerchant: z.string().max(160).optional(),
    categoryId: z.string().optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict();
const liveSessionSchema = liveRecordSchema.extend({
  sourceType: z.enum(["sms", "file", "manual", "provider"]),
  sourceName: z.string().max(120).nullable(),
  schemaVersion: z.literal(1),
  status: z.string().min(1).max(40),
  itemCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: nullableDateTime,
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
const liveOverviewSchema = z
  .object({
    totalSessions: z.number().int().nonnegative(),
    uniqueCustomers: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    failedSessions: z.number().int().nonnegative(),
    reviewSessions: z.number().int().nonnegative(),
    highestFailureSource: z.enum(["sms", "file", "manual", "provider"]),
  })
  .strict();
const liveMutationResourceSchema = liveRecordSchema
  .partial()
  .superRefine((value, context) => {
    if (!value.id && !value.versionId)
      context.addIssue({ code: "custom", message: "missing affected id" });
    if (!value.status)
      context.addIssue({ code: "custom", message: "missing current state" });
  });
const liveMutationEnvelopeSchema = z
  .object({
    operationId: z.string().min(1).max(128),
    replayed: z.boolean(),
    resource: liveMutationResourceSchema,
    requestId: z.string().min(1).max(128),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const liveSessionMutationEnvelopeSchema = liveMutationEnvelopeSchema.extend({
  resource: liveSessionSchema,
});
const livePageSchema = z
  .object({
    items: z.array(liveRecordSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
  })
  .strict();
const mocksEnabled = () =>
  mocksAllowed() && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

function source(value: unknown): "sms" | "file" | "manual" | "provider" {
  return z.enum(["sms", "file", "manual", "provider"]).parse(value);
}

function sourceType(value: ListQuery["source"]): string | undefined {
  if (!value) return undefined;
  if (value.includes("sms") || value === "android_notification") return "sms";
  if (["csv", "pdf_statement", "screenshot", "receipt"].includes(value))
    return "file";
  return "manual";
}

function liveListParams(input: ListQuery, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ limit: "100" });
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
  input: Record<string, unknown>,
): OperationalRecord {
  const value = liveRecordSchema.parse(input);
  const timestamp =
    value.updatedAt ??
    value.corpusRequestedAt ??
    value.publishedAt ??
    value.createdAt;
  const revision = value.version ?? value.versionNo;
  if (!revision) throw new Error("live record version is missing");
  const status =
    value.status ??
    value.corpusStatus ??
    ((value.active ?? value.enabled) === undefined
      ? undefined
      : (value.active ?? value.enabled)
        ? "active"
        : "inactive");
  if (!status) throw new Error("live record status is missing");
  return operationalRecordSchema.parse({
    id: value.id,
    kind: resource,
    title:
      value.name ??
      value.displayLabel ??
      value.code ??
      value.sourceName ??
      value.normalizedMerchant ??
      value.id,
    secondary: value.sourceType ?? value.countryCode ?? status,
    status,
    ...(value.sourceType ? { source: source(value.sourceType) } : {}),
    ...(value.sourceName ? { bank: value.sourceName } : {}),
    ...(value.sourceType === "sms" ? { platform: "android" as const } : {}),
    ...(value.attemptCount === undefined
      ? {}
      : { attempts: value.attemptCount }),
    ...(typeof value.confidenceBasisPoints === "number"
      ? { confidence: value.confidenceBasisPoints / 10_000 }
      : {}),
    ...(typeof value.priority === "number" ? { priority: value.priority } : {}),
    updatedAt: timestamp,
    accessLevel: "limited",
    revision,
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
          source: item.source,
          ...(item.bank ? { bank: item.bank } : {}),
          ...(item.platform
            ? { platform: item.platform === "ios" ? "iOS" : "Android" }
            : {}),
          failureType: item.status,
          ...(item.version ? { parserVersion: item.version } : {}),
          attempts: item.attempts,
          revision: item.revision,
          severity: item.status === "failed" ? "high" : "info",
          time: item.updatedAt,
          status: item.status,
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
    const result = await requestJson(
      `/api/v1/admin/imports/sessions/${encodedId}/retry-handoff`,
      liveSessionMutationEnvelopeSchema,
      {
        method: "POST",
        body: actionPayload(request),
        headers: {
          "Idempotency-Key": `tracking-admin:sessions:${id}:retry_handoff:${expectedRevision}`,
        },
      },
    );
    return {
      id: result.resource.id,
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
    if (parsedPlatform !== "all") return unavailableClientOperation();
    return apiClient
      .get("/api/v1/admin/imports/overview", liveOverviewSchema)
      .then((value) => {
        return importOverviewSchema.parse({
          platform: parsedPlatform,
          uniqueCustomers: value.uniqueCustomers,
          uniqueCustomerSemantics: "authoritative",
          totalSessions: value.totalSessions,
          totalItems: value.totalItems,
          failedSessions: value.failedSessions,
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
    if (resource === "failures") return unavailableClientOperation();
    let cursor: string | undefined;
    const cursors = new Set<string>();
    const records: z.infer<typeof liveRecordSchema>[] = [];
    do {
      const payload = await apiClient.get(
        `${resourcePaths[resource]}?${liveListParams(input, cursor)}`,
        livePageSchema,
      );
      records.push(...payload.items);
      cursor = payload.nextCursor ?? undefined;
      if (cursor && cursors.has(cursor)) throw new Error("CURSOR_REPEATED");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const start = (input.page - 1) * input.pageSize;
    const items = records
      .slice(start, start + input.pageSize)
      .map((entry) => recordFor(resource, entry));
    return operationalListSchema.parse({
      items,
      page: input.page,
      pageSize: input.pageSize,
      totalItems: records.length,
      totalPages: records.length
        ? Math.ceil(records.length / input.pageSize)
        : 0,
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
    const liveSchema =
      resource === "sessions" ? liveSessionSchema : liveRecordSchema;
    return apiClient
      .get(`${resourcePaths[resource]}/${encodedId}`, liveSchema, {
        headers:
          resource === "sessions"
            ? {
                "X-Access-Purpose":
                  "Investigating selected import session diagnostics",
              }
            : {},
      })
      .then((value) => {
        const item = recordFor(resource, value);
        if (resource !== "sessions") return operationalRecordSchema.parse(item);
        const session = liveSessionSchema.parse(value);
        const timeline = [
          {
            label: "started",
            timestamp: session.startedAt,
            status: "completed" as const,
          },
          ...(session.completedAt
            ? [
                {
                  label: "completed",
                  timestamp: session.completedAt,
                  status:
                    session.status === "failed"
                      ? ("failed" as const)
                      : ("completed" as const),
                },
              ]
            : []),
        ];
        return importSessionDetailSchema.parse({
          ...item,
          timeline,
          totalItems: session.itemCount,
          successfulItems: session.acceptedCount,
          failedItems: session.rejectedCount,
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
    if (resource === "parser-rules" && request.action === "test")
      return unavailableClientOperation();
    const body =
      resource === "parser-rules" && request.action === "test"
        ? { sample: request.proposal?.title ?? "test" }
        : actionPayload(request);
    return requestJson(target.path, liveMutationEnvelopeSchema, {
      method: target.method,
      body,
      headers: {
        "Idempotency-Key": `tracking-admin:${resource}:${id}:${request.action}:${request.expectedRevision}`,
      },
    }).then((envelope) => {
      const value = envelope.resource;
      return phase4ActionResultSchema.parse({
        affectedId: value.id ?? value.versionId,
        previousState: request.expectedState,
        currentState: value.status,
        outcome: "success",
        message: "Operation completed.",
        auditReference: {
          eventId: envelope.operationId,
          eventName: `tracking.admin.${request.action}`,
          timestamp: envelope.occurredAt,
        },
      });
    });
  },
};
