import { apiClient, mocksEnabled, unavailableClientOperation } from "@/core/api/client";
import {
  adminUsersPageSchema,
  adminUsersQuerySchema,
  userDetailRequestSchema,
  userDevicesQuerySchema,
  userDevicesResponseSchema,
  userProfileSummarySchema,
  userSessionsQuerySchema,
  userSessionsResponseSchema,
  suspendUserRequestSchema,
  reactivateUserRequestSchema,
  updateVerificationRequestSchema,
  revokeDeviceRequestSchema,
  revokeSessionsRequestSchema,
  userActionResultSchema,
  userBulkActionRequestSchema,
  userBulkActionResultSchema,
  userIdSchema,
  deviceIdSchema,
  type AdminUsersPage,
  type AdminUsersQuery,
  type UserDetailRequest,
  type UserDevicesQuery,
  type UserDevicesResponse,
  type UserProfileSummary,
  type UserSessionsQuery,
  type UserSessionsResponse,
  type SuspendUserRequest,
  type ReactivateUserRequest,
  type UpdateVerificationRequest,
  type RevokeDeviceRequest,
  type RevokeSessionsRequest,
  type UserActionResult,
  type UserBulkActionRequest,
  type UserBulkActionResult,
} from "./contracts";
import type { AdminRole } from "@/core/permissions/permissions";

export interface UsersRepository {
  getUsers(input: Partial<AdminUsersQuery>): Promise<AdminUsersPage>;
  getUser(input: UserDetailRequest): Promise<UserProfileSummary>;
  getDevices(input: UserDevicesQuery): Promise<UserDevicesResponse>;
  getSessions(input: UserSessionsQuery): Promise<UserSessionsResponse>;
  suspendUser(userId: string, input: SuspendUserRequest, role: AdminRole): Promise<UserActionResult>;
  reactivateUser(userId: string, input: ReactivateUserRequest, role: AdminRole): Promise<UserActionResult>;
  updateVerification(userId: string, input: UpdateVerificationRequest, role: AdminRole): Promise<UserActionResult>;
  revokeDevice(userId: string, deviceId: string, input: RevokeDeviceRequest, role: AdminRole): Promise<UserActionResult>;
  revokeSessions(userId: string, input: RevokeSessionsRequest, role: AdminRole): Promise<UserActionResult>;
  runBulkAction(input: UserBulkActionRequest, role: AdminRole): Promise<UserBulkActionResult>;
}

function rolePath(path: string, role: AdminRole): string {
  return mocksEnabled() ? `${path}?role=${encodeURIComponent(role)}` : path;
}

function detailPath(path: string, input: UserDetailRequest): string {
  const params = new URLSearchParams();
  if (mocksEnabled() && input.role) params.set("role", input.role);
  if (mocksEnabled() && input.scenario) params.set("__scenario", input.scenario);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const usersRepository: UsersRepository = {
  getUsers(input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const query = adminUsersQuerySchema.parse(input);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (!mocksEnabled() && (key === "scenario" || key === "role")) continue;
      if (value !== undefined) params.set(key === "scenario" ? "__scenario" : key, String(value));
    }
    return apiClient.get(`/api/v1/admin/users?${params}`, adminUsersPageSchema);
  },
  getUser(input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const request = userDetailRequestSchema.parse(input);
    return apiClient.get(
      detailPath(`/api/v1/admin/users/${encodeURIComponent(request.userId)}`, request),
      userProfileSummarySchema,
    );
  },
  getDevices(input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const request = userDevicesQuerySchema.parse(input);
    return apiClient.get(
      detailPath(`/api/v1/admin/users/${encodeURIComponent(request.userId)}/devices`, request),
      userDevicesResponseSchema,
    );
  },
  getSessions(input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const request = userSessionsQuerySchema.parse(input);
    return apiClient.get(
      detailPath(`/api/v1/admin/users/${encodeURIComponent(request.userId)}/sessions`, request),
      userSessionsResponseSchema,
    );
  },
  suspendUser(userId, input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath(`/api/v1/admin/users/${userIdSchema.parse(userId)}/suspend`, role),
      suspendUserRequestSchema.parse(input),
      userActionResultSchema,
    );
  },
  reactivateUser(userId, input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath(`/api/v1/admin/users/${userIdSchema.parse(userId)}/reactivate`, role),
      reactivateUserRequestSchema.parse(input),
      userActionResultSchema,
    );
  },
  updateVerification(userId, input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath(`/api/v1/admin/users/${userIdSchema.parse(userId)}/verification`, role),
      updateVerificationRequestSchema.parse(input),
      userActionResultSchema,
    );
  },
  revokeDevice(userId, deviceId, input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath(`/api/v1/admin/users/${userIdSchema.parse(userId)}/devices/${deviceIdSchema.parse(deviceId)}/revoke`, role),
      revokeDeviceRequestSchema.parse(input),
      userActionResultSchema,
    );
  },
  revokeSessions(userId, input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath(`/api/v1/admin/users/${userIdSchema.parse(userId)}/sessions/revoke`, role),
      revokeSessionsRequestSchema.parse(input),
      userActionResultSchema,
    );
  },
  runBulkAction(input, role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    return apiClient.post(
      rolePath("/api/v1/admin/users/bulk-actions", role),
      userBulkActionRequestSchema.parse(input),
      userBulkActionResultSchema,
    );
  },
};
