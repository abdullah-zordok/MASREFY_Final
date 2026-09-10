import { z } from "zod";

import { apiClient } from "@/core/api/client";
import { ApiError, safeApiMessage } from "@/core/api/errors";
import type {
  ActionResult,
  AudiencePreview,
  CommunicationDetail,
  CommunicationOverview,
  CommunicationPage,
  Pagination,
  Platform,
  TicketPriority,
  TicketState,
} from "./contracts";
import {
  actionResultSchema,
  communicationDetailSchema,
  communicationRecordSchema,
  engagementAdminActionSchema,
} from "./contracts";

export type { ActionResult } from "./contracts";
export type QueryPrimitive = string | number | boolean | undefined | null;
export type CommunicationsQuery = Record<string, QueryPrimitive>;

const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const uuidSchema = z.uuid();
const attachmentApiSchema = z
  .object({
    id: uuidSchema,
    filename: z.string().min(1).max(255),
    contentType: z.enum([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
    ]),
    sizeBytes: z.number().int().positive(),
    status: z.enum(["pending", "clean", "rejected", "failed"]),
  })
  .strict();
const messageApiSchema = z
  .object({
    id: uuidSchema,
    senderType: z.enum(["customer", "admin", "system"]),
    body: z.string().max(8192),
    attachments: z.array(attachmentApiSchema).max(6),
    createdAt: timestampSchema,
  })
  .strict();
const ticketFields = {
  id: uuidSchema,
  categoryId: uuidSchema,
  subject: z.string().max(180),
  status: z.enum([
    "open",
    "waiting_customer",
    "waiting_support",
    "resolved",
    "closed",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  lastMessageAt: timestampSchema,
  closedAt: nullableTimestampSchema,
  version: z.number().int().positive(),
  createdAt: timestampSchema,
};
const ticketSchema = z.object(ticketFields).strict();
const internalNoteSchema = z
  .object({
    id: uuidSchema,
    body: z.string().max(8192),
    createdAt: timestampSchema,
  })
  .strict();
const ticketDetailSchema = z
  .object({
    ...ticketFields,
    messages: z.array(messageApiSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
    internalNotes: z.array(internalNoteSchema).max(100),
  })
  .strict();
const feedbackSummarySchema = z
  .object({
    id: uuidSchema,
    type: z.enum(["bug", "idea", "experience", "other"]),
    subject: z.string().max(180).nullable(),
    body: z.string().max(8192),
    status: z.enum(["new", "reviewing", "planned", "resolved", "closed"]),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
  })
  .strict();
const feedbackDetailSchema = z
  .object({
    id: uuidSchema,
    type: z.enum(["bug", "idea", "experience", "other"]),
    subject: z.string().max(180).nullable(),
    body: z.string().max(8192),
    state: z.enum(["new", "reviewing", "planned", "resolved", "closed"]),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
const abuseSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(["open", "reviewing", "actioned", "dismissed"]),
    resourceType: z.enum([
      "content",
      "support_message",
      "assistant_response",
      "other",
    ]),
    resourceId: z.string().max(128),
    reason: z.string().max(1000),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
  })
  .strict();
const categorySchema = z
  .object({
    id: uuidSchema,
    key: z.string().max(64),
    name: z.string().max(120),
    sortOrder: z.number().int().nonnegative(),
    active: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
const contentSummarySchema = z
  .object({
    id: uuidSchema,
    state: z.enum(["draft", "review", "published", "retired"]),
    version: z.number().int().positive(),
    updatedAt: timestampSchema,
    safe: z
      .object({
        key: z.string().max(96),
        type: z.enum(["article", "faq", "policy", "announcement"]),
        publishedAt: nullableTimestampSchema,
      })
      .strict(),
  })
  .strict();
const contentDetailSchema = z
  .object({
    id: uuidSchema,
    key: z.string().max(96),
    type: z.enum(["article", "faq", "policy", "announcement"]),
    state: z.enum(["draft", "review", "published", "retired"]),
    publishedAt: nullableTimestampSchema,
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    translations: z
      .array(
        z
          .object({
            locale: z.enum(["ar", "en"]),
            title: z.string().max(180),
            body: z.string().max(65536),
          })
          .strict(),
      )
      .max(2),
  })
  .strict();
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const adminResourceSchema = z
  .object({
    id: uuidSchema,
    state: z.string().max(40),
    version: z.number().int().positive(),
    updatedAt: timestampSchema,
    safe: z.record(z.string(), scalarSchema).optional(),
  })
  .strict();
const audienceDefinitionSchema = z
  .object({
    platforms: z
      .array(z.enum(["ios", "android", "web"]))
      .min(1)
      .max(3),
    locales: z
      .array(z.enum(["ar", "en"]))
      .min(1)
      .max(2),
    activity: z.enum(["all", "active", "inactive"]),
    segmentKeys: z.array(z.string()).max(10),
  })
  .strict();
const campaignDetailSchema = z
  .object({
    id: uuidSchema,
    name: z.string().max(120),
    audience: audienceDefinitionSchema,
    templateId: uuidSchema,
    state: z.enum([
      "draft",
      "approved",
      "scheduled",
      "running",
      "paused",
      "completed",
      "cancelled",
    ]),
    scheduledAt: nullableTimestampSchema,
    createdBy: z.string().max(128),
    approvedBy: z.string().max(128).nullable(),
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
const audiencePreviewApiSchema = z
  .object({
    previewId: uuidSchema,
    audienceVersion: z.string().max(128),
    eligible: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    optedOut: z.number().int().nonnegative(),
    expiresAt: timestampSchema,
  })
  .strict();

function cursorPageSchema<T extends z.ZodType>(item: T, maxItems = 200) {
  return z
    .object({
      items: z.array(item).max(maxItems),
      nextCursor: z.string().max(512).nullable(),
      hasMore: z.boolean(),
    })
    .strict();
}

const ticketPageSchema = cursorPageSchema(ticketSchema);
const feedbackPageSchema = cursorPageSchema(feedbackSummarySchema);
const abusePageSchema = cursorPageSchema(abuseSchema);
const categoryPageSchema = cursorPageSchema(categorySchema);
const contentPageSchema = cursorPageSchema(contentSummarySchema);
const adminResourcePageSchema = cursorPageSchema(adminResourceSchema);
const responseSchemas = { supportTicket: ticketSchema } as const;

type AdminListItem =
  | z.infer<typeof ticketSchema>
  | z.infer<typeof feedbackSummarySchema>
  | z.infer<typeof abuseSchema>
  | z.infer<typeof categorySchema>
  | z.infer<typeof contentSummarySchema>
  | z.infer<typeof adminResourceSchema>;

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

type QueryInvalidator = {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => void;
};

export class CommunicationsRepository {
  private readonly baseUrl = "/api/v1/admin";

  encodeSearchParams(params: object): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== null && value !== "")
        searchParams.append(key, String(value));
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

  async validateResponse<T extends keyof typeof responseSchemas>(
    payload: unknown,
    schemaName: T,
  ): Promise<z.infer<(typeof responseSchemas)[T]>> {
    return responseSchemas[schemaName].parse(payload);
  }

  invalidateSupportTicketList(client: QueryInvalidator): void {
    client.invalidateQueries({
      queryKey: ["phase6-communications", "support-tickets"],
    });
  }
  invalidateSupportTicketDetail(client: QueryInvalidator, id: string): void {
    client.invalidateQueries({
      queryKey: ["phase6-communications", "support-tickets", id],
    });
  }
  invalidateFeedbackList(client: QueryInvalidator): void {
    client.invalidateQueries({
      queryKey: ["phase6-communications", "feedback"],
    });
  }
  invalidateContentCollection(
    client: QueryInvalidator,
    collection: string,
  ): void {
    client.invalidateQueries({
      queryKey: ["phase6-communications", "content", collection],
    });
  }
  invalidateCampaigns(client: QueryInvalidator): void {
    client.invalidateQueries({
      queryKey: ["phase6-communications", "campaigns"],
    });
  }

  async getSupportTickets(
    params: SupportTicketQuery,
  ): Promise<SupportTicketPage> {
    const items = await this.collect(
      `/support/tickets${this.query({ status: params.status })}`,
      ticketPageSchema,
    );
    const page = this.mapPage(items, params);
    return {
      tickets: page.items,
      items: page.items,
      pagination: page.pagination,
    };
  }

  async getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
    let cursor: string | null = null;
    let first: z.infer<typeof ticketDetailSchema> | null = null;
    const messages: z.infer<typeof messageApiSchema>[] = [];
    const messageIds = new Set<string>();
    const cursors = new Set<string>();
    do {
      const page = await apiClient.get(
        `${this.baseUrl}/support/tickets/${encodeURIComponent(ticketId)}${this.query({ limit: 100, cursor })}`,
        ticketDetailSchema,
      );
      first ??= page;
      if (page.id !== first.id || page.version !== first.version)
        throw contractMismatch();
      for (const message of page.messages) {
        if (messageIds.has(message.id)) throw contractMismatch();
        messageIds.add(message.id);
        messages.push(message);
      }
      cursor = this.nextCursor(page, cursors);
    } while (cursor);
    if (!first) throw contractMismatch();
    return this.ticketDetail({ ...first, messages });
  }

  async actOnSupportTicket(
    ticketId: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    const payload = this.actionBody(request);
    if (request.action === "note")
      return apiClient.post(
        `${this.baseUrl}/support/tickets/${encodeURIComponent(ticketId)}/notes`,
        {
          body: payload.message,
          expectedVersion: payload.expectedVersion,
          reason: payload.reason,
        },
        actionResultSchema,
      );
    return this.action(
      `/support/tickets/${encodeURIComponent(ticketId)}/actions`,
      payload,
    );
  }

  async getSupportOverview(
    params: CommunicationsQuery,
  ): Promise<CommunicationOverview> {
    const page = await this.getSupportTickets({
      page: 1,
      pageSize: "100",
      status: params.status as TicketState | undefined,
    });
    return {
      title: "Support overview",
      description: "Current support workload",
      metrics: [],
      items: page.tickets.slice(0, 12),
      region: { availability: page.tickets.length ? "available" : "empty" },
    };
  }

  async getFeedback(params: CommunicationsQuery): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/feedback${this.serverQuery(params)}`,
        feedbackPageSchema,
      ),
      params,
    );
  }
  async getFeedbackDetail(feedbackId: string): Promise<CommunicationDetail> {
    const item = await apiClient.get(
      `${this.baseUrl}/feedback/${encodeURIComponent(feedbackId)}`,
      feedbackDetailSchema,
    );
    return communicationDetailSchema.parse({
      ...this.mapRecord(item),
      body: item.body,
      notes: [],
      attachments: [],
      auditTrail: [],
    });
  }
  async actOnFeedback(
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/feedback/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }
  async getAbuseReports(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/abuse-reports${this.serverQuery(params)}`,
        abusePageSchema,
      ),
      params,
    );
  }
  async actOnAbuseReport(
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/abuse-reports/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }

  async getContent(
    collection: string,
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/content${this.serverQuery({ ...params, type: this.contentType(collection) })}`,
        contentPageSchema,
      ),
      params,
    );
  }
  async getContentItem(
    _collection: string,
    itemId: string,
  ): Promise<CommunicationDetail> {
    const item = await apiClient.get(
      `${this.baseUrl}/content/${encodeURIComponent(itemId)}`,
      contentDetailSchema,
    );
    const translation =
      item.translations.find((value) => value.locale === "en") ??
      item.translations[0];
    return communicationDetailSchema.parse({
      ...this.mapRecord(item),
      title: translation?.title ?? item.key,
      body: translation?.body ?? "",
      notes: [],
      attachments: [],
      auditTrail: [],
    });
  }
  async createContent(
    collection: string,
    draft: CommunicationsQuery,
  ): Promise<ActionResult> {
    return apiClient.post(
      `${this.baseUrl}/content`,
      { ...draft, type: draft.type ?? this.contentType(collection) },
      actionResultSchema,
    );
  }
  async actOnContent(
    _collection: string,
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/content/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }

  async getNotificationOverview(
    params: CommunicationsQuery,
  ): Promise<CommunicationOverview> {
    const page = await this.getCampaigns({ ...params, page: 1, pageSize: 100 });
    return {
      title: "Notifications overview",
      description: "Current campaign activity",
      metrics: [],
      items: page.items.slice(0, 12),
      region: page.region,
    };
  }
  async getCampaigns(params: CommunicationsQuery): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/notifications/campaigns${this.serverQuery(params)}`,
        adminResourcePageSchema,
      ),
      params,
    );
  }
  async getCampaign(campaignId: string): Promise<CommunicationDetail> {
    const item = await apiClient.get(
      `${this.baseUrl}/notifications/campaigns/${encodeURIComponent(campaignId)}`,
      campaignDetailSchema,
    );
    return communicationDetailSchema.parse({
      ...this.mapRecord(item),
      body: item.name,
      notes: [],
      attachments: [],
      auditTrail: [],
    });
  }
  async createCampaignDraft(draft: CommunicationsQuery): Promise<ActionResult> {
    return apiClient.post(
      `${this.baseUrl}/notifications/campaigns`,
      draft,
      actionResultSchema,
    );
  }
  async actOnCampaign(
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/notifications/campaigns/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }
  async getDeliveryLogs(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/notifications/deliveries${this.serverQuery(params)}`,
        adminResourcePageSchema,
      ),
      params,
    );
  }
  async getSupportCategories(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/support/categories${this.serverQuery(params)}`,
        categoryPageSchema,
      ),
      params,
    );
  }
  async createSupportCategory(
    input: CommunicationsQuery,
  ): Promise<ActionResult> {
    return apiClient.post(
      `${this.baseUrl}/support/categories`,
      input,
      actionResultSchema,
    );
  }
  async actOnSupportCategory(
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/support/categories/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }
  async getTemplates(params: CommunicationsQuery): Promise<CommunicationPage> {
    return this.mapPage(
      await this.collect(
        `/communications/templates${this.serverQuery(params)}`,
        adminResourcePageSchema,
      ),
      params,
    );
  }
  getTransactionalTemplates(
    params: CommunicationsQuery,
  ): Promise<CommunicationPage> {
    return this.getTemplates(params);
  }
  async createTemplate(input: CommunicationsQuery): Promise<ActionResult> {
    return apiClient.post(
      `${this.baseUrl}/communications/templates`,
      input,
      actionResultSchema,
    );
  }
  async actOnTemplate(
    id: string,
    request: TicketActionRequest,
  ): Promise<ActionResult> {
    return this.action(
      `/communications/templates/${encodeURIComponent(id)}/actions`,
      this.actionBody(request),
    );
  }

  async previewAudience(input: CommunicationsQuery): Promise<AudiencePreview> {
    const response = await apiClient.post(
      `${this.baseUrl}/notifications/audience-preview`,
      {
        platforms:
          input.platform === "ios" || input.platform === "android"
            ? [input.platform]
            : ["ios", "android", "web"],
        locales:
          input.locale === "ar" || input.locale === "en"
            ? [input.locale]
            : ["ar", "en"],
        activity: "all",
        segmentKeys: [],
      },
      audiencePreviewApiSchema,
    );
    return {
      previewId: response.previewId,
      audienceVersion: response.audienceVersion,
      eligibleCount: response.eligible,
      excludedCount: response.excluded,
      optedOutCount: response.optedOut,
      expiresAt: response.expiresAt,
    };
  }

  private async collect<T>(
    path: string,
    schema: z.ZodType<{
      items: T[];
      nextCursor: string | null;
      hasMore: boolean;
    }>,
  ): Promise<T[]> {
    const items: T[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await apiClient.get(
        `${this.baseUrl}${path}${path.includes("?") ? "&" : "?"}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        schema,
      );
      items.push(...page.items);
      cursor = this.nextCursor(page, cursors);
    } while (cursor);
    return items;
  }

  private nextCursor(
    page: { nextCursor: string | null; hasMore: boolean },
    seen: Set<string>,
  ): string | null {
    if (!page.hasMore) return null;
    if (!page.nextCursor || seen.has(page.nextCursor)) throw contractMismatch();
    seen.add(page.nextCursor);
    return page.nextCursor;
  }

  private mapPage(
    items: AdminListItem[],
    params: { page?: unknown; pageSize?: unknown },
  ): CommunicationPage {
    const pageSize = boundedPageSize(params.pageSize);
    const page = positiveInteger(params.page, 1);
    const start = (page - 1) * pageSize;
    const mapped = items.map((item) => this.mapRecord(item));
    return {
      items: mapped.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        totalItems: mapped.length,
        totalPages:
          mapped.length === 0 ? 0 : Math.ceil(mapped.length / pageSize),
      },
      region: { availability: mapped.length ? "available" : "empty" },
    };
  }

  private mapRecord(
    item:
      | AdminListItem
      | z.infer<typeof feedbackDetailSchema>
      | z.infer<typeof contentDetailSchema>
      | z.infer<typeof campaignDetailSchema>,
  ) {
    const source = item as unknown as Record<string, unknown>;
    const safe =
      source.safe && typeof source.safe === "object"
        ? (source.safe as Record<string, unknown>)
        : {};
    const id = String(source.id);
    const type = nonempty(source.type) ?? nonempty(safe.type);
    const title =
      nonempty(source.subject) ??
      nonempty(source.name) ??
      nonempty(source.key) ??
      nonempty(safe.name) ??
      nonempty(safe.key) ??
      nonempty(safe.eventId) ??
      type ??
      id;
    const state =
      nonempty(source.state) ??
      nonempty(source.status) ??
      (typeof source.active === "boolean"
        ? source.active
          ? "active"
          : "retired"
        : "unknown");
    const updatedAt =
      nonempty(source.updatedAt) ??
      nonempty(source.lastMessageAt) ??
      nonempty(source.createdAt) ??
      null;
    return communicationRecordSchema.parse({
      id,
      title,
      ...(type ? { subtitle: type } : {}),
      state,
      ...(typeof source.priority === "string"
        ? { priority: source.priority }
        : {}),
      platform: "unknown",
      locale:
        safe.locale === "ar" || safe.locale === "en" ? safe.locale : "unknown",
      updatedAt,
      revision: source.version,
      tags: [type, nonempty(safe.channel)].filter((value): value is string =>
        Boolean(value),
      ),
    });
  }

  private ticketDetail(
    item: z.infer<typeof ticketDetailSchema>,
  ): CommunicationDetail {
    const attachment = (value: z.infer<typeof attachmentApiSchema>) => ({
      id: value.id,
      filename: value.filename,
      mediaType: value.contentType,
      declaredSizeBytes: value.sizeBytes,
      status: value.status,
    });
    return communicationDetailSchema.parse({
      ...this.mapRecord(item),
      body: item.messages[0]?.body ?? item.subject,
      notes: item.internalNotes.map((note) => note.body),
      attachments: item.messages.flatMap((message) =>
        message.attachments.map(attachment),
      ),
      messages: item.messages.map((message) => ({
        ...message,
        attachments: message.attachments.map(attachment),
      })),
      internalNotes: item.internalNotes,
      auditTrail: [],
    });
  }

  private actionBody(request: TicketActionRequest) {
    return engagementAdminActionSchema.parse({
      action: request.action,
      expectedVersion: request.expectedVersion,
      reason: request.reason,
      ...(request.assigneeId || request.assignTo
        ? { assigneeId: request.assigneeId ?? request.assignTo }
        : {}),
      ...(request.priority ? { priority: request.priority } : {}),
      ...(request.message || request.body
        ? { message: request.message ?? request.body }
        : {}),
      ...(request.scheduledAt ? { scheduledAt: request.scheduledAt } : {}),
      ...(request.translations ? { translations: request.translations } : {}),
      ...(request.replacementCategoryId
        ? { replacementCategoryId: request.replacementCategoryId }
        : {}),
    });
  }

  private action(path: string, body: unknown): Promise<ActionResult> {
    return apiClient.post(`${this.baseUrl}${path}`, body, actionResultSchema);
  }
  private query(params: object): string {
    const query = this.encodeSearchParams(params);
    return query ? `?${query}` : "";
  }
  private serverQuery(params: CommunicationsQuery): string {
    return this.query({
      ...(params.search ? { query: params.search } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      ...(typeof params.unread === "boolean" ? { unread: params.unread } : {}),
    });
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

function contractMismatch(): ApiError {
  return new ApiError(
    "contract_mismatch",
    safeApiMessage("contract_mismatch"),
    502,
  );
}
function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}
function boundedPageSize(value: unknown): number {
  const parsed =
    typeof value === "string" || typeof value === "number" ? Number(value) : 50;
  return parsed === 25 || parsed === 50 || parsed === 100 ? parsed : 50;
}
function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const communicationsRepository = new CommunicationsRepository();
