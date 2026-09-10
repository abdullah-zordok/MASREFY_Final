import type { RequestHandler } from "msw";
import { http, HttpResponse } from "msw";
import { z } from "zod";

import {
  ADMIN_ROLES,
  type AdminRole,
  type PermissionKey,
} from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import { engagementAdminActionSchema } from "@/features/communications/contracts";

const base = "/api/v1/admin";
const at = "2026-09-10T08:00:00.000Z";
const ids = {
  ticket: "11000000-0000-4000-8000-000000000001",
  category: "11000000-0000-4000-8000-000000000010",
  message: "11000000-0000-4000-8000-000000000011",
  note: "11000000-0000-4000-8000-000000000012",
  attachment: "11000000-0000-4000-8000-000000000013",
  feedback: "11000000-0000-4000-8000-000000000020",
  abuse: "11000000-0000-4000-8000-000000000030",
  content: "11000000-0000-4000-8000-000000000040",
  template: "11000000-0000-4000-8000-000000000050",
  campaign: "11000000-0000-4000-8000-000000000060",
  delivery: "11000000-0000-4000-8000-000000000070",
} as const;

const pageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: z.string().max(512).optional(),
    locale: z.enum(["ar", "en"]).optional(),
    type: z
      .string()
      .regex(/^[a-z][a-z0-9_.-]{1,95}$/)
      .optional(),
    query: z.string().max(120).optional(),
    status: z
      .string()
      .regex(/^[a-z][a-z_]{1,31}$/)
      .optional(),
    unread: z.enum(["true", "false"]).optional(),
  })
  .strict();
const audienceSchema = z
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
    segmentKeys: z.array(z.string().max(96)).max(10),
  })
  .strict();
const noteSchema = z
  .object({
    body: z.string().min(1).max(8192),
    expectedVersion: z.number().int().positive(),
    reason: z.string().min(10).max(500),
  })
  .strict();
const categoryCreateSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.-]{1,95}$/),
    name: z.string().min(1).max(120),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
const templateCreateSchema = z
  .object({
    key: z.string().min(1).max(96),
    locale: z.enum(["ar", "en"]),
    channel: z.enum(["in_app", "push", "email"]),
    subject: z.string().max(120).nullable().optional(),
    body: z.string().min(1).max(4096),
    variables: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/)).max(20),
  })
  .strict();
const campaignCreateSchema = z
  .object({
    name: z.string().min(1).max(180),
    templateId: z.uuid(),
    previewId: z.uuid(),
    audienceVersion: z.string().min(1).max(128),
    audience: audienceSchema,
    scheduleMode: z.enum(["send_now", "scheduled"]),
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const translationSchema = z
  .object({
    locale: z.enum(["ar", "en"]),
    title: z.string().min(1).max(180),
    body: z.string().min(1).max(65536),
  })
  .strict();
const contentCreateSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.-]{1,95}$/),
    type: z.enum(["article", "faq", "policy", "announcement"]),
    translations: z.array(translationSchema).min(1).max(2),
  })
  .strict();

type CampaignState =
  | "draft"
  | "approved"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";
type TicketState =
  "open" | "waiting_customer" | "waiting_support" | "resolved" | "closed";
type FeedbackState = "new" | "reviewing" | "planned" | "resolved" | "closed";
type AbuseState = "open" | "reviewing" | "actioned" | "dismissed";
type ContentState = "draft" | "review" | "published" | "retired";
type ContentType = "article" | "faq" | "policy" | "announcement";

let ticket: ReturnType<typeof initialTicket>;
let feedback: ReturnType<typeof initialFeedback>;
let abuse: ReturnType<typeof initialAbuse>;
let content: ReturnType<typeof initialContent>;
let category: ReturnType<typeof initialCategory>;
let template: ReturnType<typeof initialTemplate>;
let campaign: ReturnType<typeof initialCampaign>;
let requestSequence = 0;

function initialTicket() {
  return {
    id: ids.ticket,
    categoryId: ids.category,
    subject: "Card transfer is missing",
    status: "waiting_support" as TicketState,
    priority: "high" as "low" | "normal" | "high" | "urgent",
    lastMessageAt: at,
    closedAt: null as string | null,
    version: 1,
    createdAt: at,
  };
}
function initialFeedback() {
  return {
    id: ids.feedback,
    type: "bug" as "bug" | "idea" | "experience" | "other",
    subject: "Receipt issue" as string | null,
    body: "Receipt is not visible",
    status: "new" as FeedbackState,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}
function initialAbuse() {
  return {
    id: ids.abuse,
    status: "open" as AbuseState,
    resourceType: "content" as
      "content" | "support_message" | "assistant_response" | "other",
    resourceId: ids.content,
    reason: "Potentially unsafe content",
    version: 1,
    createdAt: at,
  };
}
function initialContent() {
  return {
    id: ids.content,
    key: "help.card-transfer",
    type: "article" as ContentType,
    state: "draft" as ContentState,
    publishedAt: null as string | null,
    version: 1,
    createdAt: at,
    updatedAt: at,
    translations: [
      {
        locale: "en" as "ar" | "en",
        title: "Card transfers",
        body: "Verified help content.",
      },
    ],
  };
}
function initialCategory() {
  return {
    id: ids.category,
    key: "card",
    name: "Card",
    sortOrder: 1,
    active: true,
    version: 1,
  };
}
function initialTemplate() {
  return {
    id: ids.template,
    state: "draft",
    version: 1,
    updatedAt: at,
    safe: {
      key: "transaction.created",
      locale: "en",
      channel: "push",
      templateVersion: 1,
      subject: null as string | null | undefined,
      body: "Transaction recorded",
      variables: [] as string[],
    },
  };
}
function initialCampaign() {
  return {
    id: ids.campaign,
    name: "Bounded engagement cohort",
    audience: {
      platforms: ["ios", "android"] as ("ios" | "android" | "web")[],
      locales: ["ar", "en"] as ("ar" | "en")[],
      activity: "active" as "all" | "active" | "inactive",
      segmentKeys: [] as string[],
    },
    templateId: ids.template as string,
    state: "draft" as CampaignState,
    scheduledAt: null as string | null,
    createdBy: "mock-admin",
    approvedBy: null as string | null,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

export function resetCommunicationsMockState(): void {
  ticket = initialTicket();
  feedback = initialFeedback();
  abuse = initialAbuse();
  content = initialContent();
  category = initialCategory();
  template = initialTemplate();
  campaign = initialCampaign();
  requestSequence = 0;
}
resetCommunicationsMockState();

function requestId(): string {
  requestSequence += 1;
  return `mock-engagement-${requestSequence}`;
}
function error(status: number, code: string, message: string): Response {
  return HttpResponse.json(
    { code, message, requestId: requestId() },
    { status },
  );
}
function simulatedRole(request: Request): AdminRole | null {
  const candidate = request.headers.get("x-admin-simulated-role");
  if (candidate === null) return "super-admin";
  return ADMIN_ROLES.find((role) => role === candidate) ?? null;
}
function denied(request: Request, permission: PermissionKey): Response | null {
  const role = simulatedRole(request);
  return role && hasPermission(role, permission)
    ? null
    : error(403, "FORBIDDEN", "Access denied");
}
function validatePage(request: Request): Response | null {
  return pageQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  ).success
    ? null
    : error(400, "VALIDATION_FAILED", "Request validation failed");
}
function page(
  request: Request,
  permission: PermissionKey,
  items: unknown[],
): Response {
  return (
    denied(request, permission) ??
    validatePage(request) ??
    HttpResponse.json({ items, nextCursor: null, hasMore: false })
  );
}
function notFound(): Response {
  return error(404, "NOT_FOUND", "Record not found");
}
function resolveId(
  value: string,
  canonical: string,
  legacy: string,
): string | null {
  return value === canonical || value === legacy ? canonical : null;
}
async function parsedBody<T>(request: Request, schema: z.ZodType<T>) {
  return schema.safeParse(await request.json().catch(() => ({})));
}

async function versionedAction(
  request: Request,
  resourceId: string,
  version: number,
  permission: PermissionKey,
  allowed: readonly string[],
  apply: (action: string) => string,
): Promise<Response> {
  const permissionError = denied(request, permission);
  if (permissionError) return permissionError;
  const parsed = await parsedBody(request, engagementAdminActionSchema);
  if (!parsed.success || !allowed.includes(String(parsed.data.action)))
    return error(400, "VALIDATION_FAILED", "Request validation failed");
  if (parsed.data.expectedVersion !== version)
    return error(
      409,
      "VERSION_CONFLICT",
      "The record changed; refresh and retry",
    );
  const currentState = apply(String(parsed.data.action));
  return HttpResponse.json({
    resourceId,
    outcome: "success",
    currentState,
    version: version + 1,
    requestId: requestId(),
  });
}

export const communicationsHandlers: RequestHandler[] = [
  http.get(`${base}/support/tickets`, ({ request }) =>
    page(request, "support.tickets.read", [ticket]),
  ),
  http.get(`${base}/support/tickets/:ticketId`, ({ request, params }) => {
    const permissionError = denied(request, "support.tickets.detail.read");
    if (permissionError) return permissionError;
    if (!resolveId(String(params.ticketId), ids.ticket, "TKT-1001"))
      return notFound();
    return HttpResponse.json({
      ...ticket,
      messages: [
        {
          id: ids.message,
          senderType: "customer",
          body: "The transfer is not visible in my card account.",
          attachments: [
            {
              id: ids.attachment,
              filename: "receipt.png",
              contentType: "image/png",
              sizeBytes: 2048,
              status: "clean",
            },
          ],
          createdAt: at,
        },
      ],
      nextCursor: null,
      hasMore: false,
      internalNotes: [
        { id: ids.note, body: "Owner-safe internal note", createdAt: at },
      ],
    });
  }),
  http.post(
    `${base}/support/tickets/:ticketId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.ticketId), ids.ticket, "TKT-1001"))
        return notFound();
      return versionedAction(
        request,
        ticket.id,
        ticket.version,
        "support.tickets.manage",
        ["assign", "priority", "reply", "resolve", "close", "reopen"],
        (action) => {
          if (action === "reply") ticket.status = "waiting_customer";
          if (action === "resolve") ticket.status = "resolved";
          if (action === "close") {
            ticket.status = "closed";
            ticket.closedAt = at;
          }
          if (action === "reopen") {
            ticket.status = "open";
            ticket.closedAt = null;
          }
          ticket.version += 1;
          return ticket.status;
        },
      );
    },
  ),
  http.post(
    `${base}/support/tickets/:ticketId/notes`,
    async ({ request, params }) => {
      if (!resolveId(String(params.ticketId), ids.ticket, "TKT-1001"))
        return notFound();
      const permissionError = denied(request, "support.tickets.notes");
      if (permissionError) return permissionError;
      const parsed = await parsedBody(request, noteSchema);
      if (!parsed.success)
        return error(400, "VALIDATION_FAILED", "Request validation failed");
      if (parsed.data.expectedVersion !== ticket.version)
        return error(
          409,
          "VERSION_CONFLICT",
          "The record changed; refresh and retry",
        );
      ticket.version += 1;
      return HttpResponse.json(
        {
          resourceId: ticket.id,
          outcome: "success",
          currentState: ticket.status,
          version: ticket.version,
          requestId: requestId(),
        },
        { status: 201 },
      );
    },
  ),
  http.get(`${base}/support/categories`, ({ request }) =>
    page(request, "support.categories.read", [category]),
  ),
  http.post(`${base}/support/categories`, async ({ request }) => {
    const permissionError = denied(request, "support.categories.manage");
    if (permissionError) return permissionError;
    const parsed = await parsedBody(request, categoryCreateSchema);
    if (!parsed.success)
      return error(400, "VALIDATION_FAILED", "Request validation failed");
    category = { id: ids.category, ...parsed.data, active: true, version: 1 };
    return HttpResponse.json(
      {
        resourceId: category.id,
        outcome: "success",
        currentState: "active",
        version: 1,
        requestId: requestId(),
      },
      { status: 201 },
    );
  }),
  http.post(
    `${base}/support/categories/:categoryId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.categoryId), ids.category, "CAT-1001"))
        return notFound();
      return versionedAction(
        request,
        category.id,
        category.version,
        "support.categories.manage",
        ["activate", "retire"],
        (action) => {
          category.active = action === "activate";
          category.version += 1;
          return category.active ? "active" : "retired";
        },
      );
    },
  ),

  http.get(`${base}/feedback`, ({ request }) =>
    page(request, "feedback.read", [
      {
        id: feedback.id,
        type: feedback.type,
        subject: feedback.subject,
        body: feedback.body,
        status: feedback.status,
        version: feedback.version,
        createdAt: feedback.createdAt,
      },
    ]),
  ),
  http.get(
    `${base}/feedback/:feedbackId`,
    ({ request, params }) =>
      denied(request, "feedback.read") ??
      (resolveId(String(params.feedbackId), ids.feedback, "FDB-1001")
        ? HttpResponse.json({
            id: feedback.id,
            type: feedback.type,
            subject: feedback.subject,
            body: feedback.body,
            state: feedback.status,
            version: feedback.version,
            createdAt: feedback.createdAt,
            updatedAt: feedback.updatedAt,
          })
        : notFound()),
  ),
  http.post(
    `${base}/feedback/:feedbackId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.feedbackId), ids.feedback, "FDB-1001"))
        return notFound();
      return versionedAction(
        request,
        feedback.id,
        feedback.version,
        "feedback.manage",
        ["assign", "review", "plan", "resolve", "close"],
        (action) => {
          if (action === "review") feedback.status = "reviewing";
          else if (action !== "assign")
            feedback.status =
              action === "plan" ? "planned" : (action as FeedbackState);
          feedback.version += 1;
          return feedback.status;
        },
      );
    },
  ),
  http.get(`${base}/abuse-reports`, ({ request }) =>
    page(request, "feedback.abuse.manage", [abuse]),
  ),
  http.post(
    `${base}/abuse-reports/:reportId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.reportId), ids.abuse, "ABU-1001"))
        return notFound();
      return versionedAction(
        request,
        abuse.id,
        abuse.version,
        "feedback.abuse.manage",
        ["review", "action", "dismiss"],
        (action) => {
          abuse.status =
            action === "review"
              ? "reviewing"
              : action === "action"
                ? "actioned"
                : "dismissed";
          abuse.version += 1;
          return abuse.status;
        },
      );
    },
  ),

  http.get(`${base}/content`, ({ request }) =>
    page(request, "content.manage", [
      {
        id: content.id,
        state: content.state,
        version: content.version,
        updatedAt: content.updatedAt,
        safe: {
          key: content.key,
          type: content.type,
          publishedAt: content.publishedAt,
        },
      },
    ]),
  ),
  http.get(
    `${base}/content/:contentId`,
    ({ request, params }) =>
      denied(request, "content.manage") ??
      (resolveId(String(params.contentId), ids.content, "CAT-1001")
        ? HttpResponse.json(content)
        : notFound()),
  ),
  http.post(`${base}/content`, async ({ request }) => {
    const permissionError = denied(request, "content.manage");
    if (permissionError) return permissionError;
    const parsed = await parsedBody(request, contentCreateSchema);
    if (!parsed.success)
      return error(400, "VALIDATION_FAILED", "Request validation failed");
    content = {
      id: ids.content,
      ...parsed.data,
      state: "draft",
      publishedAt: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    return HttpResponse.json(
      {
        resourceId: content.id,
        outcome: "success",
        currentState: content.state,
        version: 1,
        requestId: requestId(),
      },
      { status: 201 },
    );
  }),
  http.post(
    `${base}/content/:contentId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.contentId), ids.content, "CAT-1001"))
        return notFound();
      return versionedAction(
        request,
        content.id,
        content.version,
        "content.manage",
        ["review", "publish", "retire"],
        (action) => {
          content.state = action as ContentState;
          content.publishedAt = action === "publish" ? at : content.publishedAt;
          content.version += 1;
          return content.state;
        },
      );
    },
  ),

  http.get(`${base}/communications/templates`, ({ request }) =>
    page(request, "communications.templates.manage", [
      {
        id: template.id,
        state: template.state,
        version: template.version,
        updatedAt: template.updatedAt,
        safe: {
          key: template.safe.key,
          locale: template.safe.locale,
          channel: template.safe.channel,
          templateVersion: template.safe.templateVersion,
          subject: template.safe.subject,
          body: template.safe.body,
        },
      },
    ]),
  ),
  http.post(`${base}/communications/templates`, async ({ request }) => {
    const permissionError = denied(request, "communications.templates.manage");
    if (permissionError) return permissionError;
    const parsed = await parsedBody(request, templateCreateSchema);
    if (!parsed.success)
      return error(400, "VALIDATION_FAILED", "Request validation failed");
    template = {
      id: ids.template,
      state: "draft",
      version: 1,
      updatedAt: at,
      safe: {
        ...parsed.data,
        subject: parsed.data.subject ?? null,
        templateVersion: 1,
      },
    };
    return HttpResponse.json(
      {
        resourceId: template.id,
        outcome: "success",
        currentState: template.state,
        version: 1,
        requestId: requestId(),
      },
      { status: 201 },
    );
  }),
  http.post(
    `${base}/communications/templates/:templateId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.templateId), ids.template, "TPL-1001"))
        return notFound();
      return versionedAction(
        request,
        template.id,
        template.version,
        "communications.templates.manage",
        ["test", "publish", "retire"],
        (action) => {
          if (action !== "test")
            template.state = action === "publish" ? "published" : "retired";
          template.version += 1;
          return template.state;
        },
      );
    },
  ),

  http.post(`${base}/notifications/audience-preview`, async ({ request }) => {
    const permissionError = denied(request, "notifications.audience.preview");
    if (permissionError) return permissionError;
    const parsed = await parsedBody(request, audienceSchema);
    if (!parsed.success)
      return error(400, "VALIDATION_FAILED", "Request validation failed");
    return HttpResponse.json({
      previewId: "11000000-0000-4000-8000-000000000080",
      audienceVersion: "mock-audience-v1",
      eligible: 1280,
      excluded: 120,
      optedOut: 84,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
  }),
  http.get(`${base}/notifications/campaigns`, ({ request }) =>
    page(request, "notifications.campaigns.read", [
      {
        id: campaign.id,
        state: campaign.state,
        version: campaign.version,
        updatedAt: campaign.updatedAt,
        safe: {
          name: campaign.name,
          templateId: campaign.templateId,
          scheduledAt: campaign.scheduledAt,
          createdBy: campaign.createdBy,
          approvedBy: campaign.approvedBy,
        },
      },
    ]),
  ),
  http.post(`${base}/notifications/campaigns`, async ({ request }) => {
    const permissionError = denied(request, "notifications.campaigns.manage");
    if (permissionError) return permissionError;
    const parsed = await parsedBody(request, campaignCreateSchema);
    if (
      !parsed.success ||
      (parsed.data.scheduleMode === "scheduled") !==
        Boolean(parsed.data.scheduledAt)
    )
      return error(400, "VALIDATION_FAILED", "Request validation failed");
    campaign = {
      id: ids.campaign,
      name: parsed.data.name,
      audience: parsed.data.audience,
      templateId: parsed.data.templateId,
      state: parsed.data.scheduleMode === "send_now" ? "running" : "scheduled",
      scheduledAt: parsed.data.scheduledAt ?? null,
      createdBy: "mock-admin",
      approvedBy: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    return HttpResponse.json(
      {
        resourceId: campaign.id,
        outcome: "success",
        currentState: campaign.state,
        version: 1,
        requestId: requestId(),
      },
      { status: 201 },
    );
  }),
  http.get(
    `${base}/notifications/campaigns/:campaignId`,
    ({ request, params }) =>
      denied(request, "notifications.campaigns.detail.read") ??
      (resolveId(String(params.campaignId), ids.campaign, "CMP-1001")
        ? HttpResponse.json(campaign)
        : notFound()),
  ),
  http.post(
    `${base}/notifications/campaigns/:campaignId/actions`,
    async ({ request, params }) => {
      if (!resolveId(String(params.campaignId), ids.campaign, "CMP-1001"))
        return notFound();
      return versionedAction(
        request,
        campaign.id,
        campaign.version,
        "notifications.campaigns.manage",
        ["approve", "schedule", "send_now", "pause", "resume", "cancel"],
        (action) => {
          const states: Record<string, CampaignState> = {
            approve: "approved",
            schedule: "scheduled",
            send_now: "running",
            pause: "paused",
            resume: "running",
            cancel: "cancelled",
          };
          campaign.state = states[action];
          if (action === "approve") campaign.approvedBy = "mock-admin";
          campaign.version += 1;
          return campaign.state;
        },
      );
    },
  ),
  http.get(`${base}/notifications/deliveries`, ({ request }) =>
    page(request, "notifications.delivery.read", [
      {
        id: ids.delivery,
        state: "delivered",
        version: 1,
        updatedAt: at,
        safe: {
          campaignId: ids.campaign,
          channel: "push",
          provider: "mock",
          attempts: 1,
        },
      },
    ]),
  ),
];
