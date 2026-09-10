import {
  apiClient,
  mocksEnabled,
  requestJson,
  unavailableClientOperation,
} from "@/core/api/client";
import { ApiError, safeApiMessage } from "@/core/api/errors";
import { z } from "zod";
import {
  actionResultSchema,
  adminSecurityPageSchema,
  auditEventDetailSchema,
  auditEventsPageSchema,
  authenticationEventsPageSchema,
  buildSecurityQuery,
  deletionActionSchema,
  deletionRequestDetailSchema,
  deletionRequestsPageSchema,
  exportActionSchema,
  exportDownloadRequestSchema,
  exportDownloadResultSchema,
  exportRequestDetailSchema,
  exportRequestsPageSchema,
  incidentActionSchema,
  incidentDetailSchema,
  operationsIncidentMutationResultSchema,
  operationsIncidentPageSchema,
  listQuerySchema,
  overviewQuerySchema,
  permissionChangePageSchema,
  retentionPoliciesPageSchema,
  retentionPolicyDetailSchema,
  retentionUpdateSchema,
  securityIdSchema,
  securityOverviewSchema,
  supportAccessPageSchema,
  supportAccessRevokeSchema,
  suspiciousActionSchema,
  suspiciousActivityPageSchema,
  type ListQuery,
  type OverviewQuery,
} from "./contracts";

export const SECURITY_BASE_PATH = "/api/v1/admin";

function overviewParams(input: OverviewQuery): string {
  const parsed = overviewQuerySchema.parse(input);
  const params = new URLSearchParams();
  params.set("platform", parsed.platform);
  params.set("period", parsed.period);
  return params.toString();
}

function encodeSecurityId(id: string, prefix: string): string {
  const parsed = securityIdSchema.safeParse(id);
  if (!parsed.success || !parsed.data.startsWith(prefix)) {
    throw new ApiError("validation_error", safeApiMessage("validation_error"), 400);
  }
  return encodeURIComponent(parsed.data);
}

function encodeIncidentId(id: string): string {
  if (!z.uuid().safeParse(id).success)
    throw new ApiError("validation_error", safeApiMessage("validation_error"), 400);
  return encodeURIComponent(id);
}

function query(input: ListQuery): string {
  return buildSecurityQuery(listQuerySchema.parse(input)).toString();
}

export const securityRepository = {
  getSecurityOverview(input: OverviewQuery) {
    return apiClient.get(`${SECURITY_BASE_PATH}/security/overview?${overviewParams(input)}`, securityOverviewSchema);
  },
  listAuthenticationEvents(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/authentication-events?${query(input)}`, authenticationEventsPageSchema);
  },
  listSuspiciousActivity(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/suspicious-activity?${query(input)}`, suspiciousActivityPageSchema);
  },
  actOnSuspiciousActivity(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/security/suspicious-activity/${encodeSecurityId(id, "SUS-")}/actions`, suspiciousActionSchema.parse(input), actionResultSchema);
  },
  listAdminSecurity(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/admins?${query(input)}`, adminSecurityPageSchema);
  },
  listPermissionChanges(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/permission-changes?${query(input)}`, permissionChangePageSchema);
  },
  listSupportAccess(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/support-access?${query(input)}`, supportAccessPageSchema);
  },
  revokeSupportAccess(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/security/support-access/${encodeSecurityId(id, "SAC-")}/revoke`, supportAccessRevokeSchema.parse(input), actionResultSchema);
  },
  async getSecurityIncident(id: string) {
    if (mocksEnabled())
      return apiClient.get(`${SECURITY_BASE_PATH}/security/incidents/${encodeSecurityId(id, "INC-")}`, incidentDetailSchema);
    const incidentId = encodeIncidentId(id);
    let cursor: string | null = null;
    for (let page = 0; page < 100; page += 1) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const response = await apiClient.get(`${SECURITY_BASE_PATH}/incidents?${params.toString()}`, operationsIncidentPageSchema);
      const incident = response.items.find((item) => item.id === decodeURIComponent(incidentId));
      if (incident)
        return incidentDetailSchema.parse({
          id: incident.id,
          title: incident.title,
          publicSummary: incident.publicSummary ?? null,
          startedAt: incident.startedAt,
          resolvedAt: incident.resolvedAt ?? null,
          assignedAdminId: incident.assignedAdminId ?? null,
          severity: incident.severity,
          state: incident.status,
          owner: null,
          affectedServices: [],
          affectedCustomerCount: null,
          platform: "unknown",
          revision: incident.version,
          timeline: [],
          allowedActions: incident.status === "resolved"
            ? []
            : incident.status === "open"
              ? ["contain", "resolve"]
              : incident.status === "investigating"
                ? ["monitor", "resolve"]
                : ["resolve"],
          auditReferences: [],
        });
      cursor = response.nextCursor;
      if (!cursor) break;
    }
    throw new ApiError("not_found", safeApiMessage("not_found"), 404);
  },
  actOnSecurityIncident(id: string, input: unknown) {
    const request = incidentActionSchema.parse(input);
    if (mocksEnabled())
      return apiClient.post(`${SECURITY_BASE_PATH}/security/incidents/${encodeSecurityId(id, "INC-")}/actions`, request, actionResultSchema);
    const status = ({ contain: "investigating", monitor: "monitoring", resolve: "resolved" } as const)[request.action as "contain" | "monitor" | "resolve"];
    if (!status) return unavailableClientOperation();
    return apiClient.patch(`${SECURITY_BASE_PATH}/incidents/${encodeIncidentId(id)}`, {
      status,
      expectedVersion: request.context.expectedRevision,
      reason: request.context.reason,
    }, operationsIncidentMutationResultSchema);
  },
  listAuditEvents(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/audit-events?${query(input)}`, auditEventsPageSchema);
  },
  getAuditEvent(id: string) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/audit-events/${encodeSecurityId(id, "AUD-")}`, auditEventDetailSchema);
  },
  listExportRequests(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-requests/exports?${query(input)}`, exportRequestsPageSchema);
  },
  getExportRequest(id: string) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-requests/exports/${encodeSecurityId(id, "EXP-")}`, exportRequestDetailSchema);
  },
  actOnExportRequest(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/data-requests/exports/${encodeSecurityId(id, "EXP-")}/actions`, exportActionSchema.parse(input), actionResultSchema);
  },
  simulateExportDownload(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/data-requests/exports/${encodeSecurityId(id, "EXP-")}/simulate-download`, exportDownloadRequestSchema.parse(input), exportDownloadResultSchema);
  },
  listDeletionRequests(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-requests/deletions?${query(input)}`, deletionRequestsPageSchema);
  },
  getDeletionRequest(id: string) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-requests/deletions/${encodeSecurityId(id, "DEL-")}`, deletionRequestDetailSchema);
  },
  actOnDeletionRequest(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/data-requests/deletions/${encodeSecurityId(id, "DEL-")}/actions`, deletionActionSchema.parse(input), actionResultSchema);
  },
  listRetentionPolicies(input: ListQuery) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-retention/policies?${query(input)}`, retentionPoliciesPageSchema);
  },
  getRetentionPolicy(id: string) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/data-retention/policies/${encodeSecurityId(id, "RET-")}`, retentionPolicyDetailSchema);
  },
  updateRetentionPolicy(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return requestJson(
      `${SECURITY_BASE_PATH}/data-retention/policies/${encodeSecurityId(id, "RET-")}`,
      actionResultSchema,
      { method: "PATCH", body: retentionUpdateSchema.parse(input) },
    );
  },
};
