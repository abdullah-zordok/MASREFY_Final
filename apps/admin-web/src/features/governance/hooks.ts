"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminRole } from "@/core/permissions/permissions";
import { apiActorCacheKey } from "@/core/api/client";
import type {
  AssignAdminRolesRequest,
  DisableAdminRequest,
  InviteAdminRequest,
  RoleCreateRequest,
  RoleUpdateRequest,
  SettingsGroupName,
  UpdateFeatureFlagRequest,
  UpdateMaintenanceRequest,
  UpdateSettingsGroupRequest,
  RevokeAdminSessionsRequest,
} from "./contracts";
import { paginationQuerySchema } from "./contracts";
import { governanceRepository } from "./repository";

type GovernanceQueryInput = {
  role: AdminRole;
  page?: number;
  pageSize?: 25 | 50 | 100;
  search?: string;
};

export const governanceQueryKeys = {
  all: ["phase9-governance"] as const,
  actor: () => [...governanceQueryKeys.all, apiActorCacheKey()] as const,
  adminUsers: (input: GovernanceQueryInput) =>
    [...governanceQueryKeys.actor(), input.role, "admin-users", paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize }), input.search ?? ""] as const,
  adminUser: (role: AdminRole, adminId: string) =>
    [...governanceQueryKeys.actor(), role, "admin-user", adminId] as const,
  adminInvitations: (input: GovernanceQueryInput) =>
    [...governanceQueryKeys.actor(), input.role, "admin-invitations", paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize }), input.search ?? ""] as const,
  roles: (input: GovernanceQueryInput) =>
    [...governanceQueryKeys.actor(), input.role, "roles", paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize }), input.search ?? ""] as const,
  role: (role: AdminRole, roleId: string) =>
    [...governanceQueryKeys.actor(), role, "role", roleId] as const,
  permissionMatrix: (role: AdminRole) =>
    [...governanceQueryKeys.actor(), role, "permission-matrix"] as const,
  settingsGroup: (role: AdminRole, group: string) =>
    [...governanceQueryKeys.actor(), role, "settings", group] as const,
  featureFlags: (input: GovernanceQueryInput) =>
    [...governanceQueryKeys.actor(), input.role, "feature-flags", paginationQuerySchema.parse({ page: input.page, pageSize: input.pageSize }), input.search ?? ""] as const,
  maintenance: (role: AdminRole) =>
    [...governanceQueryKeys.actor(), role, "maintenance"] as const,
};

export const governanceQueryOptions = {
  placeholderData: <T>(previous: T | undefined) => previous,
  staleTime: 30_000,
} as const;

export const governanceMutationLockKeys = {
  admin: (operation: string, adminId: string) => `governance:admin:${operation}:${adminId}`,
  role: (operation: string, roleId: string) => `governance:role:${operation}:${roleId}`,
  settings: (group: string) => `governance:settings:${group}`,
  flag: (flagId: string) => `governance:flag:${flagId}`,
  maintenance: () => "governance:maintenance",
};

export function useAdminUsers(input: GovernanceQueryInput = { role: "super-admin" }) {
  return useQuery({
    queryKey: governanceQueryKeys.adminUsers(input),
    queryFn: () => governanceRepository.listAdminUsers(input),
    ...governanceQueryOptions,
  });
}

export function useAdminUser(adminId: string, role: AdminRole = "super-admin") {
  return useQuery({
    queryKey: governanceQueryKeys.adminUser(role, adminId),
    queryFn: () => governanceRepository.getAdminUser(adminId),
    ...governanceQueryOptions,
  });
}

export function useAdminInvitations(input: GovernanceQueryInput = { role: "super-admin" }) {
  return useQuery({
    queryKey: governanceQueryKeys.adminInvitations(input),
    queryFn: () => governanceRepository.listAdminInvitations(input),
    ...governanceQueryOptions,
  });
}

export function useInviteAdmin() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.admin("invite", "new")],
    mutationFn: (request: InviteAdminRequest) => governanceRepository.inviteAdmin(request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useAssignAdminRoles(adminId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.admin("assign-roles", adminId)],
    mutationFn: (request: AssignAdminRolesRequest) => governanceRepository.assignAdminRoles(adminId, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useRevokeAdminSessions(adminId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.admin("revoke-sessions", adminId)],
    mutationFn: (request: RevokeAdminSessionsRequest) => governanceRepository.revokeAdminSessions(adminId, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useDisableAdmin(adminId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.admin("disable", adminId)],
    mutationFn: (request: DisableAdminRequest) => governanceRepository.disableAdmin(adminId, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useRoles(input: GovernanceQueryInput = { role: "super-admin" }) {
  return useQuery({
    queryKey: governanceQueryKeys.roles(input),
    queryFn: () => governanceRepository.listRoles(input),
    ...governanceQueryOptions,
  });
}

export function useRole(roleId: string, role: AdminRole = "super-admin") {
  return useQuery({
    queryKey: governanceQueryKeys.role(role, roleId),
    queryFn: () => governanceRepository.getRole(roleId),
    ...governanceQueryOptions,
  });
}

export function usePermissionMatrix(role: AdminRole = "super-admin") {
  return useQuery({
    queryKey: governanceQueryKeys.permissionMatrix(role),
    queryFn: () => governanceRepository.getPermissionMatrix({ page: 1, pageSize: 25 }),
    ...governanceQueryOptions,
  });
}

export function useCreateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.role("create", "new")],
    mutationFn: (request: RoleCreateRequest) => governanceRepository.createRole(request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useUpdateRole(roleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.role("update", roleId)],
    mutationFn: (request: RoleUpdateRequest) => governanceRepository.updateRole(roleId, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useSettingsGroup(group: SettingsGroupName, role: AdminRole = "super-admin") {
  return useQuery({
    queryKey: governanceQueryKeys.settingsGroup(role, group),
    queryFn: () => governanceRepository.getSettingsGroup(group),
    ...governanceQueryOptions,
  });
}

export function useUpdateSettingsGroup(group: SettingsGroupName) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.settings(group)],
    mutationFn: (request: UpdateSettingsGroupRequest) => governanceRepository.updateSettingsGroup(group, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.settingsGroup("super-admin", group) }),
  });
}

export function useFeatureFlags(input: GovernanceQueryInput = { role: "super-admin" }) {
  return useQuery({
    queryKey: governanceQueryKeys.featureFlags(input),
    queryFn: () => governanceRepository.listFeatureFlags(input),
    ...governanceQueryOptions,
  });
}

export function useUpdateFeatureFlag(flagId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.flag(flagId)],
    mutationFn: (request: UpdateFeatureFlagRequest) => governanceRepository.updateFeatureFlag(flagId, request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}

export function useMaintenance(role: AdminRole = "super-admin") {
  return useQuery({
    queryKey: governanceQueryKeys.maintenance(role),
    queryFn: () => governanceRepository.getMaintenance(),
    ...governanceQueryOptions,
  });
}

export function useUpdateMaintenance() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: [governanceMutationLockKeys.maintenance()],
    mutationFn: (request: UpdateMaintenanceRequest) => governanceRepository.updateMaintenance(request),
    onSuccess: () => void client.invalidateQueries({ queryKey: governanceQueryKeys.actor() }),
  });
}
