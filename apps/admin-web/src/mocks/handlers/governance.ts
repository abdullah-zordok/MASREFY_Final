import { http, HttpResponse, type RequestHandler } from "msw";
import { ADMIN_ROLES, type PermissionKey } from "@/core/permissions/permissions";
import { hasPermission, SIMULATED_ACTORS } from "@/core/permissions/role-map";
import {
  assignAdminRolesRequestSchema,
  disableAdminRequestSchema,
  inviteAdminRequestSchema,
  paginationQuerySchema,
  roleCreateRequestSchema,
  roleUpdateRequestSchema,
  settingsGroupNameSchema,
  updateFeatureFlagRequestSchema,
  updateMaintenanceRequestSchema,
  updateSettingsGroupRequestSchema,
  revokeAdminSessionsRequestSchema,
} from "@/features/governance/contracts";
import {
  assignPhase9AdminRoles,
  disablePhase9Admin,
  createPhase9Role,
  getPhase9Admin,
  getPhase9PermissionMatrix,
  getPhase9Role,
  getPhase9SettingsGroup,
  getPhase9Maintenance,
  invitePhase9Admin,
  listPhase9Admins,
  listPhase9Invitations,
  listPhase9Roles,
  listPhase9FeatureFlags,
  revokePhase9AdminSessions,
  updatePhase9Role,
  updatePhase9SettingsGroup,
  updatePhase9FeatureFlag,
  updatePhase9Maintenance,
} from "@/mocks/phase9-governance-state";
import { readScenario } from "@/mocks/scenarios/foundation";
import { scenarioResponse } from "./shared";

function simulatedRole(request: Request) {
  const candidate = request.headers.get("x-admin-simulated-role");
  return candidate === null ? "super-admin" : ADMIN_ROLES.find((role) => role === candidate);
}

function denied(request: Request, permission: PermissionKey): Response | null {
  const role = simulatedRole(request);
  return role && hasPermission(role, permission)
    ? null
    : HttpResponse.json({ code: "forbidden" }, { status: 403 });
}

function safeConflict(error: unknown) {
  const message = error instanceof Error ? error.message : "conflict";
  return HttpResponse.json(
    { code: message === "stale_version" ? "conflict" : "conflict" },
    { status: 409 },
  );
}

export const governanceHandlers: RequestHandler[] = [
  http.get("/api/v1/admin/admin-users", async ({ request }) => {
    const permissionError = denied(request, "admin-team.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const url = new URL(request.url);
    return HttpResponse.json(listPhase9Admins({
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25) as 25,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? "all",
    }));
  }),
  http.get("/api/v1/admin/admin-invitations", async ({ request }) => {
    const permissionError = denied(request, "admin-team.read");
    if (permissionError) return permissionError;
    const url = new URL(request.url);
    const parsed = paginationQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? 1,
      pageSize: url.searchParams.get("pageSize") ?? 25,
    });
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    return HttpResponse.json(listPhase9Invitations(parsed.data));
  }),
  http.post("/api/v1/admin/admin-invitations", async ({ request }) => {
    const permissionError = denied(request, "access.invites.write");
    if (permissionError) return permissionError;
    const parsed = inviteAdminRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(invitePhase9Admin(parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.post("/api/v1/admin/admin-users/:adminId/sessions/revoke", async ({ request, params }) => {
    const permissionError = denied(request, "admin-team.sessions.revoke");
    if (permissionError) return permissionError;
    const parsed = revokeAdminSessionsRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.adminId !== params.adminId) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    try {
      return HttpResponse.json(revokePhase9AdminSessions(String(params.adminId), parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.post("/api/v1/admin/admin-users/:adminId/disable", async ({ request, params }) => {
    const permissionError = denied(request, "admin-team.disable");
    if (permissionError) return permissionError;
    const parsed = disableAdminRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.adminId !== params.adminId) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    try {
      const role = simulatedRole(request) ?? "super-admin";
      return HttpResponse.json(disablePhase9Admin(String(params.adminId), parsed.data, SIMULATED_ACTORS[role]));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.post("/api/v1/admin/admin-users/:adminId/roles", async ({ request, params }) => {
    const permissionError = denied(request, "access.assignments.write");
    if (permissionError) return permissionError;
    const parsed = assignAdminRolesRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.adminId !== params.adminId) {
      return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    }
    try {
      return HttpResponse.json(assignPhase9AdminRoles(String(params.adminId), parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.get("/api/v1/admin/admin-users/:adminId", async ({ request, params }) => {
    const permissionError = denied(request, "admin-team.read");
    if (permissionError) return permissionError;
    const response = await scenarioResponse(readScenario(request));
    if (response) return response;
    const admin = getPhase9Admin(String(params.adminId));
    return admin ? HttpResponse.json(admin) : HttpResponse.json({ code: "not_found" }, { status: 404 });
  }),
  http.get("/api/v1/admin/roles", async ({ request }) => {
    const permissionError = denied(request, "access.roles.read");
    if (permissionError) return permissionError;
    const url = new URL(request.url);
    return HttpResponse.json(listPhase9Roles({
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25) as 25,
      search: url.searchParams.get("search") ?? undefined,
    }));
  }),
  http.post("/api/v1/admin/roles", async ({ request }) => {
    const permissionError = denied(request, "access.roles.write");
    if (permissionError) return permissionError;
    const parsed = roleCreateRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(createPhase9Role(parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.get("/api/v1/admin/permissions", async ({ request }) => {
    const permissionError = denied(request, "permissions.read");
    if (permissionError) return permissionError;
    return HttpResponse.json(getPhase9PermissionMatrix());
  }),
  http.post("/api/v1/admin/roles/:roleId", async ({ request, params }) => {
    const permissionError = denied(request, "access.roles.write");
    if (permissionError) return permissionError;
    const parsed = roleUpdateRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(updatePhase9Role(String(params.roleId), parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.get("/api/v1/admin/roles/:roleId", async ({ request, params }) => {
    const permissionError = denied(request, "access.roles.read");
    if (permissionError) return permissionError;
    const role = getPhase9Role(String(params.roleId));
    return role ? HttpResponse.json(role) : HttpResponse.json({ code: "not_found" }, { status: 404 });
  }),
  http.get("/api/v1/admin/settings/:group", async ({ request, params }) => {
    const group = settingsGroupNameSchema.safeParse(params.group);
    if (!group.success) return HttpResponse.json({ code: "not_found" }, { status: 404 });
    const permissionError = denied(request, `settings.${group.data}.read` as PermissionKey);
    if (permissionError) return permissionError;
    const settings = getPhase9SettingsGroup(group.data);
    return settings ? HttpResponse.json(settings) : HttpResponse.json({ code: "not_found" }, { status: 404 });
  }),
  http.post("/api/v1/admin/settings/:group", async ({ request, params }) => {
    const group = settingsGroupNameSchema.safeParse(params.group);
    if (!group.success) return HttpResponse.json({ code: "not_found" }, { status: 404 });
    const permissionError = denied(request, `settings.${group.data}.manage` as PermissionKey);
    if (permissionError) return permissionError;
    const parsed = updateSettingsGroupRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(updatePhase9SettingsGroup(group.data, parsed.data));
    } catch (error) {
      if (error instanceof Error && error.message === "validation_error") {
        return HttpResponse.json({ code: "validation_error" }, { status: 400 });
      }
      return safeConflict(error);
    }
  }),
  http.get("/api/v1/admin/feature-flags", async ({ request }) => {
    const permissionError = denied(request, "operations.flags.read");
    if (permissionError) return permissionError;
    const url = new URL(request.url);
    return HttpResponse.json(listPhase9FeatureFlags({
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 25) as 25,
    }));
  }),
  http.post("/api/v1/admin/feature-flags/:flagId", async ({ request, params }) => {
    const permissionError = denied(request, "operations.flags.manage");
    if (permissionError) return permissionError;
    const parsed = updateFeatureFlagRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(updatePhase9FeatureFlag(String(params.flagId), parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
  http.get("/api/v1/admin/maintenance", async ({ request }) => {
    const permissionError = denied(request, "operations.maintenance.read");
    if (permissionError) return permissionError;
    return HttpResponse.json(getPhase9Maintenance());
  }),
  http.post("/api/v1/admin/maintenance", async ({ request }) => {
    const permissionError = denied(request, "operations.maintenance.manage");
    if (permissionError) return permissionError;
    const parsed = updateMaintenanceRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return HttpResponse.json({ code: "validation_error" }, { status: 400 });
    try {
      return HttpResponse.json(updatePhase9Maintenance(parsed.data));
    } catch (error) {
      return safeConflict(error);
    }
  }),
];
