import { apiClient, liveCursor, mocksEnabled, rememberLiveCursor } from "@/core/api/client";
import type { z } from "zod";
import {
  adminIdSchema,
  adminListQuerySchema,
  adminListResponseSchema,
  adminUserDetailSchema,
  assignAdminRolesRequestSchema,
  assignAdminRolesResultSchema,
  disableAdminRequestSchema,
  disableAdminResultSchema,
  flagIdSchema,
  featureFlagListResponseSchema,
  featureFlagResultSchema,
  invitationListResponseSchema,
  inviteAdminRequestSchema,
  inviteAdminResultSchema,
  paginationQuerySchema,
  revokeAdminSessionsRequestSchema,
  revokeAdminSessionsResultSchema,
  roleIdSchema,
  roleCreateRequestSchema,
  roleListResponseSchema,
  roleMutationResultSchema,
  roleSchema,
  roleUpdateRequestSchema,
  permissionMatrixSchema,
  settingsGroupNameSchema,
  settingsGroupSchema,
  updateSettingsGroupRequestSchema,
  updateFeatureFlagRequestSchema,
  maintenanceSchema,
  maintenanceResultSchema,
  phase13FeatureFlagPageSchema,
  phase13MaintenancePageSchema,
  phase13MutationResultSchema,
  phase13SettingSchema,
  updateMaintenanceRequestSchema,
} from "./contracts";

const operationsSettingByGroup = {
  general: "operations.history.retention_days",
  mobile: "operations.performance.series_limit",
  imports: "operations.provider.timeout_ms",
  ai: "operations.ai.allowance",
} as const;

let maintenanceWindow: { id: string; status: "scheduled" | "active" | "completed" | "canceled" } | undefined;

type AdminId = z.infer<typeof adminIdSchema>;
type RoleId = z.infer<typeof roleIdSchema>;
type FlagId = z.infer<typeof flagIdSchema>;
type GovernanceListQuery = z.input<typeof paginationQuerySchema> & { search?: string; status?: string };
type GovernanceReadModel = Record<string, unknown>;
type GovernanceMutationRequest = Record<string, unknown>;
type GovernanceMutationResult = Record<string, unknown>;

export interface GovernanceRepository {
  listAdminUsers(input: GovernanceListQuery): Promise<GovernanceReadModel>;
  getAdminUser(adminId: AdminId): Promise<GovernanceReadModel>;
  listAdminInvitations(input: GovernanceListQuery): Promise<GovernanceReadModel>;
  inviteAdmin(input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  disableAdmin(adminId: AdminId, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  revokeAdminSessions(adminId: AdminId, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  assignAdminRoles(adminId: AdminId, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  listRoles(input: GovernanceListQuery): Promise<GovernanceReadModel>;
  createRole(input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  getRole(roleId: RoleId): Promise<GovernanceReadModel>;
  updateRole(roleId: RoleId, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  getPermissionMatrix(input: GovernanceListQuery): Promise<GovernanceReadModel>;
  getSettingsGroup(group: string): Promise<GovernanceReadModel>;
  updateSettingsGroup(group: string, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  listFeatureFlags(input: GovernanceListQuery): Promise<GovernanceReadModel>;
  updateFeatureFlag(flagId: FlagId, input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
  getMaintenance(): Promise<GovernanceReadModel>;
  updateMaintenance(input: GovernanceMutationRequest): Promise<GovernanceMutationResult>;
}

function params(input: GovernanceListQuery): string {
  const parsed = adminListQuerySchema.parse({
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    status: input.status,
  });
  const values = new URLSearchParams({
    page: String(parsed.page),
    pageSize: String(parsed.pageSize),
    status: parsed.status,
  });
  if (parsed.search) values.set("search", parsed.search);
  return values.toString();
}

export const governanceRepository: GovernanceRepository = {
  listAdminUsers(input) {
    return apiClient.get(`/api/v1/admin/admin-users?${params(input)}`, adminListResponseSchema);
  },
  getAdminUser(adminId) {
    const parsed = adminIdSchema.parse(adminId);
    return apiClient.get(`/api/v1/admin/admin-users/${encodeURIComponent(parsed)}`, adminUserDetailSchema);
  },
  listAdminInvitations(input) {
    const parsed = paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize });
    return apiClient.get(
      `/api/v1/admin/admin-invitations?page=${parsed.page}&pageSize=${parsed.pageSize}`,
      invitationListResponseSchema,
    );
  },
  inviteAdmin(input) {
    return apiClient.post("/api/v1/admin/admin-invitations", inviteAdminRequestSchema.parse(input), inviteAdminResultSchema);
  },
  disableAdmin(adminId, input) {
    const parsed = adminIdSchema.parse(adminId);
    return apiClient.post(
      `/api/v1/admin/admin-users/${encodeURIComponent(parsed)}/disable`,
      disableAdminRequestSchema.parse({ ...input, adminId: parsed }),
      disableAdminResultSchema,
    );
  },
  revokeAdminSessions(adminId, input) {
    const parsed = adminIdSchema.parse(adminId);
    return apiClient.post(
      `/api/v1/admin/admin-users/${encodeURIComponent(parsed)}/sessions/revoke`,
      revokeAdminSessionsRequestSchema.parse({ ...input, adminId: parsed }),
      revokeAdminSessionsResultSchema,
    );
  },
  assignAdminRoles(adminId, input) {
    const parsed = adminIdSchema.parse(adminId);
    return apiClient.post(
      `/api/v1/admin/admin-users/${encodeURIComponent(parsed)}/roles`,
      assignAdminRolesRequestSchema.parse({ ...input, adminId: parsed }),
      assignAdminRolesResultSchema,
    );
  },
  listRoles(input) {
    const parsed = paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize });
    const values = new URLSearchParams({ page: String(parsed.page), pageSize: String(parsed.pageSize) });
    if (input.search) values.set("search", input.search);
    return apiClient.get(`/api/v1/admin/roles?${values.toString()}`, roleListResponseSchema);
  },
  createRole(input) {
    return apiClient.post("/api/v1/admin/roles", roleCreateRequestSchema.parse(input), roleMutationResultSchema);
  },
  getRole(roleId) {
    const parsed = roleIdSchema.parse(roleId);
    return apiClient.get(`/api/v1/admin/roles/${encodeURIComponent(parsed)}`, roleSchema);
  },
  updateRole(roleId, input) {
    const parsed = roleIdSchema.parse(roleId);
    return apiClient.post(`/api/v1/admin/roles/${encodeURIComponent(parsed)}`, roleUpdateRequestSchema.parse(input), roleMutationResultSchema);
  },
  getPermissionMatrix(input) {
    paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize });
    return apiClient.get("/api/v1/admin/permissions", permissionMatrixSchema);
  },
  getSettingsGroup(group) {
    const parsed = settingsGroupNameSchema.parse(group);
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/settings/${encodeURIComponent(parsed)}`, settingsGroupSchema);
    const key = operationsSettingByGroup[parsed as keyof typeof operationsSettingByGroup];
    if (!key) throw new Error("SETTING_NOT_AVAILABLE_IN_FREE_RELEASE");
    return apiClient.get(`/api/v1/admin/settings/${encodeURIComponent(key)}`, phase13SettingSchema).then((setting) => ({ group: parsed, operationsSetting: true, values: { settingKey: setting.key, value: setting.value ?? null, sensitivity: setting.sensitivity, redacted: setting.redacted }, version: setting.version, updatedAt: setting.updatedAt }));
  },
  async updateSettingsGroup(group, input) {
    const parsed = settingsGroupNameSchema.parse(group);
    const request = updateSettingsGroupRequestSchema.parse(input);
    if (mocksEnabled())
      return apiClient.post(`/api/v1/admin/settings/${encodeURIComponent(parsed)}`, request, settingsGroupSchema);
    const key = operationsSettingByGroup[parsed as keyof typeof operationsSettingByGroup];
    if (!key) throw new Error("SETTING_NOT_AVAILABLE_IN_FREE_RELEASE");
    const result = await apiClient.patch(`/api/v1/admin/settings/${encodeURIComponent(key)}`, { value: Object.values(request.changes)[0], expectedVersion: request.expectedVersion, reason: request.reason }, phase13MutationResultSchema);
    return { ...result, group: parsed };
  },
  async listFeatureFlags(input) {
    const parsed = paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize });
    if (mocksEnabled())
      return apiClient.get(`/api/v1/admin/feature-flags?page=${parsed.page}&pageSize=${parsed.pageSize}`, featureFlagListResponseSchema);
    const cursorScope = `feature-flags:${input.search ?? ""}:${input.status ?? ""}:${parsed.pageSize}`;
    const cursor = liveCursor(cursorScope, parsed.page);
    const values = new URLSearchParams({ limit: String(parsed.pageSize) });
    if (cursor) values.set("cursor", cursor);
    const page = await apiClient.get(`/api/v1/admin/feature-flags?${values.toString()}`, phase13FeatureFlagPageSchema);
    rememberLiveCursor(cursorScope, parsed.page, page.nextCursor);
    const items = page.items.filter((flag) =>
      (!input.search || `${flag.key} ${flag.description}`.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())) &&
      (!input.status || input.status === "all" || flag.status === input.status),
    );
    return featureFlagListResponseSchema.parse({
      items: items.map((flag) => ({ id: flag.key, key: flag.key, label: { ar: flag.description, en: flag.description }, platform: "shared", audience: "all_customers", rolloutPercent: flag.defaultEnabled ? 100 : 0, status: flag.status === "draft" ? "disabled" : flag.status === "active" ? "active" : "ended", startsAt: null, endsAt: null, version: flag.version, updatedAt: new Date().toISOString() })),
      total: (parsed.page - 1) * parsed.pageSize + items.length + (page.nextCursor ? 1 : 0),
      page: parsed.page,
      pageSize: parsed.pageSize,
    });
  },
  async updateFeatureFlag(flagId, input) {
    const parsed = flagIdSchema.parse(flagId);
    const request = updateFeatureFlagRequestSchema.parse(input);
    if (mocksEnabled())
      return apiClient.post(`/api/v1/admin/feature-flags/${encodeURIComponent(parsed)}`, request, featureFlagResultSchema);
    return apiClient.patch(`/api/v1/admin/feature-flags/${encodeURIComponent(parsed)}`, {
      ...(request.rolloutPercent === undefined ? {} : { defaultEnabled: request.rolloutPercent > 0 }),
      ...(request.status ? { status: request.status === "disabled" ? "draft" : "active" } : {}),
      expectedVersion: request.expectedVersion,
      reason: request.reason,
    }, phase13MutationResultSchema);
  },
  async getMaintenance() {
    if (mocksEnabled()) return apiClient.get("/api/v1/admin/maintenance", maintenanceSchema);
    const page = await apiClient.get("/api/v1/admin/maintenance?limit=25", phase13MaintenancePageSchema);
    const item = page.items.find(({ status }) => status === "active" || status === "scheduled") ?? page.items[0];
    maintenanceWindow = item ? { id: item.id, status: item.status } : undefined;
    return maintenanceSchema.parse(item ? { state: item.status === "active" ? "active" : item.status === "scheduled" ? "scheduled" : "off", message: item.message, startsAt: item.startsAt, endsAt: item.endsAt, version: item.version, updatedAt: item.startsAt, mockOnly: false } : { state: "off", message: { ar: "لا توجد صيانة مجدولة", en: "No maintenance scheduled" }, startsAt: null, endsAt: null, version: 1, updatedAt: new Date().toISOString(), mockOnly: false });
  },
  async updateMaintenance(input) {
    const request = updateMaintenanceRequestSchema.parse(input);
    if (mocksEnabled()) return apiClient.post("/api/v1/admin/maintenance", request, maintenanceResultSchema);
    const body = maintenanceWindow
      ? { status: request.nextState === "active" ? "active" : maintenanceWindow.status === "active" ? "completed" : "canceled", expectedVersion: request.expectedVersion, reason: request.reason }
      : { startsAt: request.startsAt, endsAt: request.endsAt, scopes: ["api"], message: request.message, reason: request.reason };
    const result = maintenanceWindow
      ? await apiClient.patch(`/api/v1/admin/maintenance/${maintenanceWindow.id}`, body, phase13MutationResultSchema)
      : await apiClient.post("/api/v1/admin/maintenance", body, phase13MutationResultSchema);
    return { ...result, maintenance: { ...request, state: request.nextState, version: result.version, updatedAt: new Date().toISOString(), mockOnly: false } };
  },
};
