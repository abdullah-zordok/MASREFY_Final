import { http, HttpResponse } from "msw";
import {
  ADMIN_ROLES,
  type AdminRole,
  type PermissionKey,
} from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import {
  categoryRuleActionRequestSchema,
  duplicateActionRequestSchema,
  failedImportActionRequestSchema,
  listQuerySchema,
  lowConfidenceActionRequestSchema,
  merchantRuleActionRequestSchema,
  phase4ActionRequestSchema,
  parserRuleActionRequestSchema,
  parserVersionActionRequestSchema,
  senderActionRequestSchema,
  unsupportedFormatActionRequestSchema,
  type OperationalRecord,
  type Phase4Resource,
} from "@/features/imports/contracts";
import {
  failedImports,
  failureTrend,
  importMetrics,
  importSourceVolume,
  phase4OverviewFixtures,
  phase4Records,
  phase4SessionDetails,
  processingTimes,
  sourceSuccess,
} from "@/mocks/fixtures/imports";
import { phase4ImportState } from "@/mocks/phase4-import-state";
import { readScenario } from "@/mocks/scenarios/foundation";
import { scenarioResponse } from "./shared";

const listPermissions: Record<Phase4Resource, PermissionKey> = {
  sessions: "imports.read",
  failures: "imports.failures.manage",
  "low-confidence": "imports.confidence.manage",
  duplicates: "imports.duplicates.manage",
  unsupported: "imports.unsupported.manage",
  banks: "parsers.coverage.read",
  senders: "parsers.senders.manage",
  "parser-rules": "parsers.rules.read",
  "test-cases": "parsers.tests.run",
  versions: "parsers.versions.manage",
  "merchant-rules": "parsers.merchants.manage",
  "category-rules": "parsers.categories.manage",
};

const actionPermissions: Record<Phase4Resource, PermissionKey> = {
  ...listPermissions,
  sessions: "imports.failures.manage",
  "parser-rules": "parsers.rules.manage",
};

const listPaths: Record<Phase4Resource, string> = {
  sessions: "/api/v1/admin/imports/sessions",
  failures: "/api/v1/admin/imports/failures",
  "low-confidence": "/api/v1/admin/imports/low-confidence",
  duplicates: "/api/v1/admin/imports/duplicates",
  unsupported: "/api/v1/admin/imports/unsupported-formats",
  banks: "/api/v1/admin/parsers/banks",
  senders: "/api/v1/admin/parsers/senders",
  "parser-rules": "/api/v1/admin/parsers/rules",
  "test-cases": "/api/v1/admin/parsers/test-cases",
  versions: "/api/v1/admin/parsers/versions",
  "merchant-rules": "/api/v1/admin/parsers/merchant-rules",
  "category-rules": "/api/v1/admin/parsers/category-rules",
};

function simulatedRole(request: Request): AdminRole | null {
  const candidate = request.headers.get("x-admin-simulated-role");
  if (candidate === null) return "super-admin";
  return ADMIN_ROLES.find((role) => role === candidate) ?? null;
}

function denied(request: Request, permission: PermissionKey): Response | null {
  const role = simulatedRole(request);
  return role && hasPermission(role, permission)
    ? null
    : HttpResponse.json({ code: "forbidden" }, { status: 403 });
}

function projectedRecord(
  record: OperationalRecord,
  role: AdminRole,
): OperationalRecord {
  const current = phase4ImportState.applyRuntimeState(record);
  const fullRecord =
    current.kind === "versions"
      ? {
          ...current,
          actions:
            current.status === "draft"
              ? ["test"]
              : current.status === "testing"
                ? ["release"]
                : current.status === "active"
                  ? ["retire", "rollback"]
                  : ["rollback"],
        }
      : current;
  if (role === "super-admin" || role === "import-operator") {
    return fullRecord;
  }
  const safe = { ...fullRecord };
  delete safe.preview;
  delete safe.definition;
  delete safe.fictionalSample;
  return {
    ...safe,
    accessLevel: role === "support-agent" ? "limited" : "context",
    actions: [],
  };
}

function queryFrom(request: Request) {
  const url = new URL(request.url);
  return listQuerySchema.safeParse({
    search: url.searchParams.get("search") || undefined,
    platform: url.searchParams.get("platform") || undefined,
    source: url.searchParams.get("source") || undefined,
    status: url.searchParams.get("status") || undefined,
    bankId: url.searchParams.get("bankId") || undefined,
    parserVersionId: url.searchParams.get("parserVersionId") || undefined,
    appVersion: url.searchParams.get("appVersion") || undefined,
    dateFrom: url.searchParams.get("dateFrom") || undefined,
    dateTo: url.searchParams.get("dateTo") || undefined,
    page: url.searchParams.get("page") || undefined,
    pageSize: url.searchParams.get("pageSize") || undefined,
    sort: url.searchParams.get("sort") || undefined,
    order: url.searchParams.get("order") || undefined,
    scenario: url.searchParams.get("__scenario") || undefined,
  });
}

function expandedRecords(
  records: OperationalRecord[],
  large: boolean,
): OperationalRecord[] {
  if (!large || records.length === 0) return records;
  return Array.from({ length: 125 }, (_, index) => {
    const source = records[index % records.length];
    return {
      ...source,
      id: `${source.id}-${(index + 1).toString().padStart(3, "0")}`,
    };
  });
}

async function listResponse(
  request: Request,
  resource: Phase4Resource,
): Promise<Response> {
  const permissionError = denied(request, listPermissions[resource]);
  if (permissionError) return permissionError;
  const scenario = readScenario(request);
  const scenarioError = await scenarioResponse(scenario);
  if (scenarioError) return scenarioError;
  if (scenario === "unsafe-response") {
    return HttpResponse.json({ items: [{ rawMessage: "unsafe" }] });
  }

  const parsedQuery = queryFrom(request);
  if (!parsedQuery.success) {
    return HttpResponse.json({ code: "validation_error" }, { status: 400 });
  }

  const role = simulatedRole(request);
  if (!role) return HttpResponse.json({ code: "forbidden" }, { status: 403 });
  const query = parsedQuery.data;
  const candidates =
    scenario === "empty"
      ? []
      : expandedRecords(phase4Records[resource], scenario === "large");
  const search = query.search?.toLocaleLowerCase("ar");
  const filtered = candidates.filter(
    (record) =>
      (!search ||
        `${record.id} ${record.title} ${record.secondary}`
          .toLocaleLowerCase("ar")
          .includes(search)) &&
      (!query.platform ||
        query.platform === "all" ||
        record.platform === query.platform) &&
      (!query.source || record.source === query.source) &&
      (!query.status || record.status === query.status) &&
      (!query.bankId ||
        record.id === query.bankId ||
        record.bank === query.bankId) &&
      (!query.parserVersionId || record.version === query.parserVersionId) &&
      (!query.appVersion || record.appVersion === query.appVersion) &&
      (!query.dateFrom || record.updatedAt.slice(0, 10) >= query.dateFrom) &&
      (!query.dateTo || record.updatedAt.slice(0, 10) <= query.dateTo),
  );
  const sorted = [...filtered].sort((left, right) => {
    const order = query.order === "asc" ? 1 : -1;
    const sort = query.sort ?? "updatedAt";
    const leftValue =
      sort === "bank"
        ? (left.bank ?? "")
        : sort === "appVersion"
          ? (left.appVersion ?? "")
          : String(left[sort] ?? "");
    const rightValue =
      sort === "bank"
        ? (right.bank ?? "")
        : sort === "appVersion"
          ? (right.appVersion ?? "")
          : String(right[sort] ?? "");
    return leftValue.localeCompare(rightValue, "en") * order;
  });
  const start = (query.page - 1) * query.pageSize;
  const items = sorted
    .slice(start, start + query.pageSize)
    .map((record) => projectedRecord(record, role));

  return HttpResponse.json({
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalItems: sorted.length,
    totalPages:
      sorted.length === 0 ? 0 : Math.ceil(sorted.length / query.pageSize),
    region: {
      availability:
        scenario === "partial"
          ? "partial"
          : items.length === 0
            ? "empty"
            : "available",
      ...(scenario === "partial"
        ? { message: "بعض المؤشرات غير متاحة مؤقتاً", retryable: true }
        : {}),
    },
  });
}

const actionSchemas: Record<Phase4Resource, typeof phase4ActionRequestSchema> =
  {
    sessions: phase4ActionRequestSchema,
    failures: failedImportActionRequestSchema,
    "low-confidence": lowConfidenceActionRequestSchema,
    duplicates: duplicateActionRequestSchema,
    unsupported: unsupportedFormatActionRequestSchema,
    banks: phase4ActionRequestSchema,
    senders: senderActionRequestSchema,
    "parser-rules": parserRuleActionRequestSchema,
    "test-cases": phase4ActionRequestSchema,
    versions: parserVersionActionRequestSchema,
    "merchant-rules": merchantRuleActionRequestSchema,
    "category-rules": categoryRuleActionRequestSchema,
  };

function hasPatternOverlap(
  resource: Phase4Resource,
  id: string,
  pattern: string,
): boolean {
  if (!["senders", "merchant-rules", "category-rules"].includes(resource))
    return false;
  const normalized = pattern.trim().normalize("NFKC").toLocaleLowerCase("en");
  return phase4Records[resource].some(
    (record) =>
      record.id !== id &&
      (record.pattern ?? record.title)
        .trim()
        .normalize("NFKC")
        .toLocaleLowerCase("en") === normalized,
  );
}

async function detailResponse(
  request: Request,
  resource: Extract<Phase4Resource, "sessions" | "banks" | "parser-rules">,
  id: string,
): Promise<Response> {
  const permission =
    resource === "sessions" ? "imports.detail.read" : listPermissions[resource];
  const permissionError = denied(request, permission);
  if (permissionError) return permissionError;
  const scenario = readScenario(request);
  const scenarioError = await scenarioResponse(scenario);
  if (scenarioError) return scenarioError;
  if (scenario === "unsafe-response")
    return HttpResponse.json({ rawPayload: "unsafe" });

  const role = simulatedRole(request);
  if (!role) return HttpResponse.json({ code: "forbidden" }, { status: 403 });
  if (resource === "sessions") {
    const detail = phase4SessionDetails[id];
    if (!detail)
      return HttpResponse.json({ code: "not_found" }, { status: 404 });
    return HttpResponse.json(projectedRecord(detail, role));
  }
  const record = phase4Records[resource].find(
    (candidate) => candidate.id === id,
  );
  return record
    ? HttpResponse.json(projectedRecord(record, role))
    : HttpResponse.json({ code: "not_found" }, { status: 404 });
}

async function actionResponse(
  request: Request,
  resource: Phase4Resource,
  id: string,
): Promise<Response> {
  const permissionError = denied(request, actionPermissions[resource]);
  if (permissionError) return permissionError;
  const scenario = readScenario(request);
  const scenarioError = await scenarioResponse(scenario);
  if (scenarioError) return scenarioError;

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    throw error;
  }
  const parsed = actionSchemas[resource].safeParse(body);
  if (!parsed.success) {
    return HttpResponse.json({ code: "validation_error" }, { status: 400 });
  }
  const record = phase4Records[resource].find(
    (candidate) => candidate.id === id,
  );
  if (!record) return HttpResponse.json({ code: "not_found" }, { status: 404 });
  if (!phase4ImportState.acquireRecordLock(id, parsed.data.action)) {
    return HttpResponse.json({ code: "conflict" }, { status: 409 });
  }

  try {
    const proposedPattern = parsed.data.proposal?.pattern;
    if (proposedPattern && hasPatternOverlap(resource, id, proposedPattern)) {
      return HttpResponse.json(
        {
          code: "conflict",
          message: "overlapping_pattern",
        },
        { status: 409 },
      );
    }
    if (resource === "versions" && parsed.data.action === "release") {
      const current = phase4ImportState.applyRuntimeState(record);
      const activeInScope = phase4Records.versions
        .map((version) => phase4ImportState.applyRuntimeState(version))
        .some(
          (version) =>
            version.id !== id &&
            version.scope === current.scope &&
            version.status === "active",
        );
      if (activeInScope)
        return HttpResponse.json({ code: "conflict" }, { status: 409 });
    }
    const transition = phase4ImportState.transitionRecord(record, parsed.data);
    const auditId = phase4ImportState.recordAuditEvent({
      eventName: `admin.${resource}.${parsed.data.action}`,
      actor: simulatedRole(request) ?? "denied",
      scope: id,
    });
    return HttpResponse.json({
      affectedId: id,
      previousState: transition.previousState,
      currentState: transition.currentState,
      outcome: "success",
      message: "اكتملت المحاكاة بنجاح دون تنفيذ عملية خلفية حقيقية.",
      auditReference: {
        eventId: auditId,
        eventName: `admin.${resource}.${parsed.data.action}`,
        timestamp: "2026-07-29T10:00:00+03:00",
      },
      ...(transition.createdDraftId
        ? { createdDraftId: transition.createdDraftId }
        : {}),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["conflict", "required_tests_failed"].includes(error.message)
    ) {
      return HttpResponse.json({ code: "conflict" }, { status: 409 });
    }
    throw error;
  } finally {
    phase4ImportState.releaseRecordLock(id, parsed.data.action);
  }
}

const listHandlers = (
  Object.entries(listPaths) as Array<[Phase4Resource, string]>
).map(([resource, path]) =>
  http.get(path, ({ request }) => listResponse(request, resource)),
);

const actionHandlers = (
  Object.entries(listPaths) as Array<[Phase4Resource, string]>
)
  .filter(([resource]) => !["banks", "test-cases"].includes(resource))
  .flatMap(([resource, path]) => {
    const suffix =
      resource === "sessions"
        ? "retry-handoff"
        : resource === "low-confidence"
          ? "review"
          : resource === "duplicates"
            ? "resolve"
            : "action";
    const handlers = [
      http.post(`${path}/:id/${suffix}`, ({ request, params }) =>
        actionResponse(request, resource, String(params.id)),
      ),
      http.patch(`${path}/:id`, ({ request, params }) =>
        actionResponse(request, resource, String(params.id)),
      ),
    ];
    if (resource === "parser-rules") {
      handlers.push(
        http.post(`${path}/:id/test-preview`, ({ request, params }) =>
          actionResponse(request, resource, String(params.id)),
        ),
      );
    }
    if (resource === "versions") {
      handlers.push(
        http.post(`${path}/:id/publish`, ({ request, params }) =>
          actionResponse(request, resource, String(params.id)),
        ),
      );
    }
    return handlers;
  });

export const importsHandlers = [
  http.get("/api/v1/admin/imports", async ({ request }) => {
    const permissionError = denied(request, "imports.read");
    if (permissionError) return permissionError;
    const scenario = readScenario(request);
    const response = await scenarioResponse(scenario);
    if (response) return response;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
    const query = (url.searchParams.get("query") ?? "").toLocaleLowerCase("ar");
    const source = url.searchParams.get("source");
    const platform = url.searchParams.get("platform");
    const severity = url.searchParams.get("severity");
    const filtered =
      scenario === "empty"
        ? []
        : failedImports.filter(
            (record) =>
              (!query ||
                `${record.id} ${record.user} ${record.bank}`
                  .toLocaleLowerCase("ar")
                  .includes(query)) &&
              (!source || record.source === source) &&
              (!platform || record.platform?.toLowerCase() === platform) &&
              (!severity || record.severity === severity),
          );
    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      metrics: importMetrics,
      items: filtered.slice(start, start + pageSize),
      failureTrend,
      sourceVolume: importSourceVolume,
      sourceSuccess,
      processingTimes,
      page,
      pageSize,
      totalItems: filtered.length,
      totalPages:
        filtered.length === 0 ? 0 : Math.ceil(filtered.length / pageSize),
    });
  }),
  http.post("/api/v1/admin/imports/:id/retry", async ({ params, request }) => {
    const permissionError = denied(request, "imports.failures.manage");
    if (permissionError) return permissionError;
    const scenario = readScenario(request);
    const response = await scenarioResponse(scenario);
    if (response) return response;
    const id = String(params.id);
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return HttpResponse.json({ code: "validation_error" }, { status: 400 });
      }
      throw error;
    }
    const parsed = phase4ActionRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.action !== "retry_handoff") {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    const record = failedImports.find((candidate) => candidate.id === id);
    if (!record)
      return HttpResponse.json({ code: "not_found" }, { status: 404 });
    if (
      parsed.data.expectedState !== record.status ||
      parsed.data.expectedRevision !== 1
    ) {
      return HttpResponse.json({ code: "conflict" }, { status: 409 });
    }
    return HttpResponse.json({
      id,
      status: "scheduled",
      auditEvent: "admin.import.retry.requested",
    });
  }),
  http.get("/api/v1/admin/imports/overview", async ({ request }) => {
    const permissionError = denied(request, "imports.read");
    if (permissionError) return permissionError;
    const scenario = readScenario(request);
    const scenarioError = await scenarioResponse(scenario);
    if (scenarioError) return scenarioError;
    if (scenario === "unsafe-response")
      return HttpResponse.json({ uniqueCustomers: "raw" });
    const platform = new URL(request.url).searchParams.get("platform");
    const key = platform === "android" || platform === "ios" ? platform : "all";
    return HttpResponse.json({
      ...phase4OverviewFixtures[key],
      region: {
        availability: scenario === "partial" ? "partial" : "available",
        ...(scenario === "partial"
          ? { message: "بعض المؤشرات غير متاحة مؤقتاً" }
          : {}),
      },
    });
  }),
  ...listHandlers,
  http.get("/api/v1/admin/parsers/institutions", ({ request }) =>
    listResponse(request, "banks"),
  ),
  http.get("/api/v1/admin/imports/sessions/:id", ({ request, params }) =>
    detailResponse(request, "sessions", String(params.id)),
  ),
  http.get("/api/v1/admin/parsers/institutions/:id", ({ request, params }) =>
    detailResponse(request, "banks", String(params.id)),
  ),
  http.get("/api/v1/admin/parsers/banks/:id", ({ request, params }) =>
    detailResponse(request, "banks", String(params.id)),
  ),
  http.get("/api/v1/admin/parsers/rules/:id", ({ request, params }) =>
    detailResponse(request, "parser-rules", String(params.id)),
  ),
  ...actionHandlers,
];
