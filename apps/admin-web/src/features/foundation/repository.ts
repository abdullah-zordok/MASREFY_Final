import { apiClient, mocksEnabled, unavailableClientOperation } from "@/core/api/client";
import type { AdminRole } from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import {
  adminSelfContextSchema,
  attentionQuerySchema,
  attentionResponseSchema,
  globalSearchQuerySchema,
  globalSearchResponseSchema,
  navigationResponseSchema,
  platformOptionsResponseSchema,
} from "./schemas";
import type {
  AdminSession,
  AttentionQuery,
  AttentionResponse,
  GlobalSearchQuery,
  GlobalSearchResponse,
  NavigationResponse,
  PlatformOptionsResponse,
} from "./contracts";
export interface FoundationRepository {
  getSession(): Promise<AdminSession>;
  getNavigation(role: AdminRole): Promise<NavigationResponse>;
  getAttention(role: AdminRole, input: AttentionQuery): Promise<AttentionResponse>;
  search(role: AdminRole, input: GlobalSearchQuery): Promise<GlobalSearchResponse>;
  getPlatformOptions(): Promise<PlatformOptionsResponse>;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function sortAttention(items: AttentionResponse["items"]): AttentionResponse["items"] {
  return [...items].sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;
    const timeDiff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (timeDiff !== 0) return timeDiff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export const foundationRepository: FoundationRepository = {
  getSession: () => apiClient.get("/api/v1/admin/access/me", adminSelfContextSchema),
  async getNavigation(role) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const roleQuery = mocksEnabled() ? queryString({ role }) : "";
    const response = await apiClient.get(`/api/v1/admin/navigation${roleQuery ? `?${roleQuery}` : ""}`, navigationResponseSchema);
    if (!mocksEnabled()) return response;
    return {
      groups: response.groups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.permission && !hasPermission(role, item.permission)
            ? { ...item, availability: "denied" as const }
            : item,
        ),
      })),
    };
  },
  async getAttention(role, input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const parsed = attentionQuerySchema.parse({ role: mocksEnabled() ? role : undefined, ...input });
    const response = await apiClient.get(
      `/api/v1/admin/attention?${queryString({
        role: mocksEnabled() ? parsed.role : undefined,
        platform: parsed.platform,
        period: parsed.period,
        page: parsed.page,
        pageSize: parsed.pageSize,
      })}`,
      attentionResponseSchema,
    );
    if (!mocksEnabled()) return response;
    const filtered = response.items.filter(
      (item) => hasPermission(role, "attention.read") && hasPermission(role, item.permission),
    );
    const ordered = sortAttention(filtered).map((item) =>
      item.destination && !hasPermission(role, item.permission)
        ? { ...item, destination: undefined }
        : item,
    );
    const totalPages = Math.max(ordered.length ? 1 : 0, Math.ceil(ordered.length / response.pageSize));
    return {
      ...response,
      items: ordered.slice(0, response.pageSize),
      totalItems: ordered.length,
      totalPages,
    };
  },
  async search(role, input) {
    if (!mocksEnabled()) return unavailableClientOperation();
    const parsed = globalSearchQuerySchema.parse(input);
    const response = await apiClient.get(
      `/api/v1/admin/search?${queryString({
        role: mocksEnabled() ? role : undefined,
        query: parsed.query,
        platform: parsed.platform,
        page: parsed.page,
        pageSize: parsed.pageSize,
      })}`,
      globalSearchResponseSchema,
    );
    if (!mocksEnabled()) return response;
    const items = response.items.filter((item) => hasPermission(role, item.permission));
    return { ...response, items, totalItems: items.length, totalPages: items.length ? 1 : 0 };
  },
  getPlatformOptions: () =>
    mocksEnabled()
      ? apiClient.get("/api/v1/admin/platform-options", platformOptionsResponseSchema)
      : unavailableClientOperation(),
};
