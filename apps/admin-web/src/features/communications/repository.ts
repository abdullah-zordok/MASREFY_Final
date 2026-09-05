import { z } from "zod";
import type {
  Pagination,
  SafeError,
  ActionResult,
  Platform,
  TicketPriority,
  TicketState,
  ApiError as CommunicationsApiError,
  CommunicationPage,
  CommunicationDetail,
  CommunicationOverview,
  AudiencePreview,
} from "./contracts";
import { engagementAdminActionSchema } from "./contracts";

export type { ActionResult } from "./contracts";

export type QueryPrimitive = string | number | boolean | undefined | null;
export type CommunicationsQuery = Record<string, QueryPrimitive>;
type RawApiError = {
  status?: number | string;
  code?: string;
  message?: string;
  correlationId?: string;
  fieldErrors?: Record<string, string[]>;
};

const supportTicketResponseSchema = z
  .object({
    id: z.string().min(1),
    subject: z.string().min(1),
    status: z.enum([
      "open",
      "waiting_customer",
      "waiting_support",
      "resolved",
      "closed",
    ]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    version: z.number().int().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .passthrough();

const responseSchemas = {
  supportTicket: supportTicketResponseSchema,
} as const;

type RawRecord = Record<string, unknown>;
type RawPage = { items?: unknown[]; nextCursor?: string | null; hasMore?: boolean };

function record(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toCommunicationRecord(value: unknown): CommunicationPage["items"][number] {
  const item = record(value);
  const safe = record(item.safe);
  const id = text(item.id) ?? "unknown";
  const title = text(item.subject) ?? text(item.name) ?? text(item.title) ?? text(safe.name) ?? text(safe.key) ?? text(item.key) ?? id;
  const type = text(item.type) ?? text(safe.type);
  const channel = text(safe.channel);
  return {
    id,
    title,
    ...(type ? { subtitle: type } : {}),
    state: text(item.state) ?? text(item.status) ?? "unknown",
    ...(text(item.priority) ? { priority: text(item.priority) } : {}),
    platform: "all",
    locale: text(safe.locale) === "ar" || text(safe.locale) === "en" ? (text(safe.locale) as "ar" | "en") : "both",
    updatedAt: text(item.updatedAt) ?? text(item.lastMessageAt) ?? text(item.createdAt) ?? new Date(0).toISOString(),
    revision: number(item.version) ?? 1,
    tags: [type, channel].filter((tag): tag is string => Boolean(tag)),
  };
}

function toCommunicationPage(value: unknown, pageSize = 50): CommunicationPage {
  const source = record(value) as RawPage;
  const items = Array.isArray(source.items) ? source.items.map(toCommunicationRecord) : [];
  return {
    items,
    pagination: {
      page: 1,
      pageSize,
      totalItems: items.length + (source.hasMore ? 1 : 0),
      totalPages: source.hasMore ? 2 : items.length > 0 ? 1 : 0,
    },
    region: { availability: items.length > 0 ? "available" : "empty" },
  };
}

function toCommunicationDetail(value: unknown): CommunicationDetail {
  const source = record(value);
  const messages = Array.isArray(source.messages) ? source.messages.map(record) : [];
  const translations = Array.isArray(source.translations) ? source.translations.map(record) : [];
  const internalNotes = Array.isArray(source.internalNotes) ? source.internalNotes.map(record) : [];
  const body = text(source.body) ?? text(translations.find((item) => item.locale === "en")?.body) ?? text(translations[0]?.body) ?? text(messages[0]?.body) ?? "No detail text supplied.";
  const base = toCommunicationRecord({
    ...source,
    title: text(source.title) ?? text(translations.find((item) => item.locale === "en")?.title) ?? text(translations[0]?.title),
  });
  return {
    ...base,
    body: body.slice(0, 4000),
    notes: internalNotes.map((item) => text(item.body)).filter((note): note is string => Boolean(note)).slice(0, 12),
    attachments: messages.flatMap((message) => Array.isArray(message.attachments) ? message.attachments.map(record) : []).map((attachment) => ({
      id: text(attachment.id) ?? "unknown",
      filename: text(attachment.filename) ?? "attachment.txt",
      mediaType: (text(attachment.contentType) ?? "text/plain") as "application/pdf" | "image/png" | "image/jpeg" | "text/plain",
      declaredSizeBytes: number(attachment.sizeBytes) ?? 0,
    })).slice(0, 6),
    auditTrail: [],
  };
}

function toActionBody(action: TicketActionRequest): RawRecord {
  return engagementAdminActionSchema.parse({
    action: action.action,
    expectedVersion: action.expectedVersion,
    reason: action.reason,
    ...(action.assigneeId || action.assignTo ? { assigneeId: action.assigneeId ?? action.assignTo } : {}),
    ...(action.priority ? { priority: action.priority } : {}),
    ...(action.message || action.body ? { message: action.message ?? action.body } : {}),
    ...(action.scheduledAt ? { scheduledAt: action.scheduledAt } : {}),
    ...(action.translations ? { translations: action.translations } : {}),
    ...(action.replacementCategoryId ? { replacementCategoryId: action.replacementCategoryId } : {}),
  });
}

export interface SupportTicketQuery extends Pagination {
  search?: string;
  platform?: Platform;
  status?: TicketState;
  priority?: TicketPriority;
  assignedAgent?: string;
  type?: string;
  categoryId?: string;
  appVersion?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sortOrder?: "asc" | "desc";
}

export interface SupportTicketPage {
  tickets: CommunicationPage["items"];
  items?: CommunicationPage["items"];
  pagination: CommunicationPage["pagination"];
}

export type SupportTicketDetail = CommunicationDetail;

export interface TicketActionRequest {
  action:
    | "test"
    | "assign"
    | "priority"
    | "reply"
    | "note"
    | "resolve"
    | "close"
    | "reopen"
    | "review"
    | "plan"
    | "action"
    | "dismiss"
    | "publish"
    | "retire"
    | "activate"
    | "approve"
    | "schedule"
    | "send_now"
    | "pause"
    | "resume"
    | "cancel";
  expectedVersion: number;
  reason: string;
  assignTo?: string;
  assigneeId?: string;
  priority?: TicketPriority;
  message?: string;
  body?: string;
  scheduledAt?: string;
  translations?: unknown[];
  replacementCategoryId?: string;
}

export class CommunicationsRepository {
  private readonly baseUrl = "/api/v1/admin";

  encodeSearchParams(params: object): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    }

    return searchParams.toString();
  }

  getSupportTicketsQueryKey(params: SupportTicketQuery) {
    return ["phase6-communications", "support-tickets", params];
  }

  getSupportTicketDetailKey(ticketId: string) {
    return ["phase6-communications", "support-tickets", ticketId];
  }

  getFeedbackQueryKey(params: CommunicationsQuery) {
    return ["phase6-communications", "feedback", params];
  }

  getFeedbackDetailKey(feedbackId: string) {
    return ["phase6-communications", "feedback", feedbackId];
  }

  getContentQueryKey(collection: string, params: CommunicationsQuery) {
    return ["phase6-communications", "content", collection, params];
  }

  getContentDetailKey(collection: string, itemId: string) {
    return ["phase6-communications", "content", collection, itemId];
  }

  getCampaignsQueryKey(params: CommunicationsQuery) {
    return ["phase6-communications", "campaigns", params];
  }

  getCampaignDetailKey(campaignId: string) {
    return ["phase6-communications", "campaigns", campaignId];
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET"
        ? { "Idempotency-Key": crypto.randomUUID() }
        : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          status: response.status.toString(),
          code: "UNKNOWN_ERROR",
          message: "Request failed",
          correlationId: "",
        }));
        throw this.parseApiError(errorData);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        throw error;
      }
      throw {
        status: "500",
        code: "NETWORK_ERROR",
        message: "Network request failed",
        correlationId: "",
      } as SafeError;
    }
  }

  parseApiError(errorData: RawApiError): CommunicationsApiError {
    // Sanitize error message to prevent information leakage
    let sanitizedMessage = errorData.message || "An error occurred";

    // Remove sensitive information from error messages
    sanitizedMessage = sanitizedMessage
      .replace(/postgresql:\/\/[^@]+@[^\/]+/g, "***DATABASE***")
      .replace(/mongodb:\/\/[^@]+@[^\/]+/g, "***DATABASE***")
      .replace(/password[:=][\s]*[^\s,}]+/gi, "password=***")
      .replace(/secret[:=][\s]*[^\s,}]+/gi, "secret=***")
      .replace(/token[:=][\s]*[^\s,}]+/gi, "token=***")
      .replace(/api[_-]?key[:=][\s]*[^\s,}]+/gi, "api_key=***");

    return {
      status: String(
        errorData.status || "500",
      ) as CommunicationsApiError["status"],
      code: errorData.code || "UNKNOWN_ERROR",
      message: sanitizedMessage,
      correlationId: errorData.correlationId || "",
      fieldErrors: errorData.fieldErrors,
    };
  }

  async validateResponse<TSchemaName extends keyof typeof responseSchemas>(
    payload: unknown,
    schemaName: TSchemaName,
  ): Promise<z.infer<(typeof responseSchemas)[TSchemaName]>> {
    return responseSchemas[schemaName].parse(payload);
  }

  invalidateSupportTicketList(queryClient: {
    invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
  }): void {
    queryClient.invalidateQueries({
      queryKey: ["phase6-communications", "support-tickets"],
    });
  }

  invalidateSupportTicketDetail(
    queryClient: {
      invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
    },
    ticketId: string,
  ): void {
    queryClient.invalidateQueries({
      queryKey: ["phase6-communications", "support-tickets", ticketId],
    });
  }

  invalidateFeedbackList(queryClient: {
    invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
  }): void {
    queryClient.invalidateQueries({
      queryKey: ["phase6-communications", "feedback"],
    });
  }

  invalidateContentCollection(
    queryClient: {
      invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
    },
    collection: string,
  ): void {
    queryClient.invalidateQueries({
      queryKey: ["phase6-communications", "content", collection],
    });
  }

  invalidateCampaigns(queryClient: {
    invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
  }): void {
    queryClient.invalidateQueries({
      queryKey: ["phase6-communications", "campaigns"],
    });
  }

  async getSupportTickets(
    params: SupportTicketQuery,
  ): Promise<SupportTicketPage> {
    const pageSize = Number(params.pageSize ?? 50);
    const queryString = this.encodeSearchParams({
      limit: pageSize,
      status: params.status,
    });
    const endpoint = `/support/tickets${queryString ? `?${queryString}` : ""}`;
    const page = toCommunicationPage(await this.request(endpoint), pageSize);
    return { tickets: page.items, items: page.items, pagination: page.pagination };
  }

  async getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
    return toCommunicationDetail(await this.request(`/support/tickets/${ticketId}`));
  }

  async actOnSupportTicket(
    ticketId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    const payload = toActionBody(actionRequest);
    return this.request(
      `/support/tickets/${ticketId}/${actionRequest.action === "note" ? "notes" : "actions"}`,
      {
        method: "POST",
        body: JSON.stringify(
          actionRequest.action === "note"
            ? {
                body: payload.message,
                expectedVersion: payload.expectedVersion,
                reason: payload.reason,
              }
            : payload,
        ),
      },
    );
  }

  async getSupportOverview(
    params: CommunicationsQuery,
  ): Promise<CommunicationOverview> {
    const page = toCommunicationPage(await this.request(`/support/tickets?${this.encodeSearchParams({ limit: params.limit ?? 12, status: params.status })}`), 12);
    return { title: "Support overview", description: "Current support workload", metrics: [{ key: "tickets", label: "Tickets", value: page.pagination.totalItems, unit: "tickets", platform: "all" }], items: page.items.slice(0, 12), region: page.region };
  }

  async getFeedback(params: CommunicationsQuery): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    const endpoint = `/feedback${queryString ? `?${queryString}` : ""}`;

    return toCommunicationPage(await this.request(endpoint));
  }

  async getFeedbackDetail(feedbackId: string): Promise<CommunicationDetail> {
    return toCommunicationDetail(await this.request(`/feedback/${encodeURIComponent(feedbackId)}`));
  }

  async actOnFeedback(
    feedbackId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.request(`/feedback/${feedbackId}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async getAbuseReports(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    const endpoint = `/abuse-reports${queryString ? `?${queryString}` : ""}`;

    return toCommunicationPage(await this.request(endpoint));
  }

  async actOnAbuseReport(
    reportId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.request(`/abuse-reports/${reportId}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async getContent(
    collection: string,
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    const separator = queryString ? "&" : "?";
    const endpoint = `/content${queryString ? `?${queryString}` : ""}${separator}type=${this.contentType(collection)}`;

    return toCommunicationPage(await this.request(endpoint));
  }

  async getContentItem(
    collection: string,
    itemId: string,
  ): Promise<CommunicationDetail> {
    void collection;
    return toCommunicationDetail(await this.request(`/content/${encodeURIComponent(itemId)}`));
  }

  async createContent(
    collection: string,
    contentDraft: CommunicationsQuery,
  ): Promise<ActionResult> {
    return this.request(`/content`, {
      method: "POST",
      body: JSON.stringify({
        ...contentDraft,
        type: contentDraft.type ?? this.contentType(collection),
      }),
    });
  }

  async actOnContent(
    collection: string,
    itemId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    void collection;
    return this.request(`/content/${itemId}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async getNotificationOverview(
    params: CommunicationsQuery,
  ): Promise<CommunicationOverview> {
    const page = toCommunicationPage(await this.request(`/notifications/campaigns?${this.encodeSearchParams({ limit: params.limit ?? 12 })}`), 12);
    return { title: "Notifications overview", description: "Current campaign activity", metrics: [{ key: "campaigns", label: "Campaigns", value: page.pagination.totalItems, unit: "campaigns", platform: "all" }], items: page.items.slice(0, 12), region: page.region };
  }

  async getCampaigns(params: CommunicationsQuery): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    const endpoint = `/notifications/campaigns${queryString ? `?${queryString}` : ""}`;

    return toCommunicationPage(await this.request(endpoint));
  }

  async getCampaign(campaignId: string): Promise<CommunicationDetail> {
    return toCommunicationDetail(await this.request(`/notifications/campaigns/${campaignId}`));
  }

  async createCampaignDraft(
    campaignDraft: CommunicationsQuery,
  ): Promise<ActionResult> {
    return this.request(`/notifications/campaigns`, {
      method: "POST",
      body: JSON.stringify(campaignDraft),
    });
  }

  async actOnCampaign(
    campaignId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.request(`/notifications/campaigns/${campaignId}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async getDeliveryLogs(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    const endpoint = `/notifications/deliveries${queryString ? `?${queryString}` : ""}`;

    return toCommunicationPage(await this.request(endpoint));
  }

  async getSupportCategories(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    return toCommunicationPage(await this.request(
      `/support/categories${queryString ? `?${queryString}` : ""}`,
    ));
  }

  async createSupportCategory(
    input: CommunicationsQuery,
  ): Promise<ActionResult> {
    return this.request("/support/categories", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async actOnSupportCategory(
    categoryId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.request(`/support/categories/${encodeURIComponent(categoryId)}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async getTemplates(params: CommunicationsQuery): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    return toCommunicationPage(await this.request(
      `/communications/templates${queryString ? `?${queryString}` : ""}`,
    ));
  }

  async getTransactionalTemplates(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    const queryString = this.encodeSearchParams(params);
    return toCommunicationPage(await this.request(
      `/communications/templates${queryString ? `?${queryString}` : ""}`,
    ));
  }

  async createTemplate(input: CommunicationsQuery): Promise<ActionResult> {
    return this.request("/communications/templates", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async actOnTemplate(
    templateId: string,
    actionRequest: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.request(`/communications/templates/${templateId}/actions`, {
      method: "POST",
      body: JSON.stringify(toActionBody(actionRequest)),
    });
  }

  async previewAudience(input: CommunicationsQuery): Promise<AudiencePreview> {
    const response = record(await this.request("/notifications/audience-preview", {
      method: "POST",
      body: JSON.stringify({
        platforms: input.platform === "ios" || input.platform === "android" ? [input.platform] : ["ios", "android", "web"],
        locales: input.locale === "ar" || input.locale === "en" ? [input.locale] : ["ar", "en"],
        activity: "all",
        segmentKeys: [],
      }),
    }));
    return {
      eligibleCount: number(response.eligible) ?? 0,
      optedOutCount: number(response.optedOut) ?? 0,
      denominator: "eligible-audience",
      generatedAt: new Date().toISOString(),
    };
  }

  private contentType(
    collection: string,
  ): "article" | "faq" | "policy" | "announcement" {
    if (collection === "faqs") return "faq";
    if (collection === "announcements") return "announcement";
    if (collection === "policies") return "policy";
    return "article";
  }
}

export const communicationsRepository = new CommunicationsRepository();
