import {
  apiClient,
  mocksEnabled,
  requestJson,
  unavailableClientOperation,
} from "@/core/api/client";
import { ApiError, safeApiMessage } from "@/core/api/errors";
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
  getSecurityIncident(id: string) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.get(`${SECURITY_BASE_PATH}/security/incidents/${encodeSecurityId(id, "INC-")}`, incidentDetailSchema);
  },
  actOnSecurityIncident(id: string, input: unknown) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(`${SECURITY_BASE_PATH}/security/incidents/${encodeSecurityId(id, "INC-")}/actions`, incidentActionSchema.parse(input), actionResultSchema);
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
