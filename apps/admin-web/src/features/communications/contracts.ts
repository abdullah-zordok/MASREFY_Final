import { z } from "zod";

export const sharedIdSchema = z.string().regex(/^[A-Z]{2,4}-\d{4,6}-[A-Z0-9]+$/);
export const routeRecordIdSchema = z.string().regex(/^[A-Z]{3}-\d{4}$/);

export type SharedId = z.infer<typeof sharedIdSchema>;
export type RouteRecordId = z.infer<typeof routeRecordIdSchema>;

export const maskedReferenceSchema = z.object({
  id: z.string().regex(/^MASKED-\d{4}$/),
  type: z.enum(["user", "device", "payment", "subscription", "import", "ai"]),
  safeContext: z.string().max(100),
});

export type MaskedReference = z.infer<typeof maskedReferenceSchema>;

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.enum(["25", "50", "100"]),
  total: z.number().int().min(0).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const safeErrorSchema = z.object({
  status: z.enum(["400", "401", "403", "404", "409", "422", "500"]),
  code: z.string().max(50),
  message: z.string().max(200),
  correlationId: z.string().regex(/^[A-Z0-9-]{16,32}$/),
}).strict();

export type SafeError = z.infer<typeof safeErrorSchema>;

export const safeTextSchema = z.string()
  .transform((val) => val.normalize("NFC"))
  .refine((val) => !/[\u202A-\u202E\u2066-\u2069]/.test(val), {
    message: "Contains bidirectional override characters"
  })
  .refine((val) => !/[\x00-\x1F\x7F-\x9F]/.test(val), {
    message: "Contains control characters"
  })
  .refine((val) => !/[\uFFF0-\uFFFF]/.test(val), {
    message: "Contains special Unicode characters"
  });

export type SafeText = z.infer<typeof safeTextSchema>;

export const searchSchema = z.string()
  .transform((val) => val.normalize("NFC"))
  .refine((val) => !/[\u202A-\u202E\u2066-\u2069]/.test(val), {
    message: "Contains bidirectional override characters"
  })
  .refine((val) => !/[\x00-\x1F\x7F-\x9F]/.test(val), {
    message: "Contains control characters"
  })
  .refine((val) => !/[\uFFF0-\uFFFF]/.test(val), {
    message: "Contains special Unicode characters"
  })
  .refine((val) => val.length <= 120, {
    message: "Exceeds 120 character limit"
  });
export type SearchText = z.infer<typeof searchSchema>;

export const subjectSchema = z.string()
  .transform((val) => val.normalize("NFC"))
  .refine((val) => !/[\u202A-\u202E\u2066-\u2069]/.test(val), {
    message: "Contains bidirectional override characters"
  })
  .refine((val) => !/[\x00-\x1F\x7F-\x9F]/.test(val), {
    message: "Contains control characters"
  })
  .refine((val) => !/[\uFFF0-\uFFFF]/.test(val), {
    message: "Contains special Unicode characters"
  })
  .refine((val) => val.length <= 160, {
    message: "Exceeds 160 character limit"
  });
export type SubjectText = z.infer<typeof subjectSchema>;

export const createKiBLimitSchema = (maxKiB: number) => z.string()
  .refine((val) => new Blob([val]).size <= maxKiB * 1024, {
    message: `Exceeds ${maxKiB} KiB UTF-8 byte limit`
  });

export const messageSchema = createKiBLimitSchema(8);
export type MessageText = z.infer<typeof messageSchema>;

export const noteSchema = createKiBLimitSchema(2);
export type NoteText = z.infer<typeof noteSchema>;

export const contentSchema = createKiBLimitSchema(16);
export type ContentText = z.infer<typeof contentSchema>;

export const attachmentSchema = z.object({
  id: z.string().regex(/^ATT-\d{4,6}-[A-Z0-9]+$/),
  filename: z.string()
    .regex(/^[a-zA-Z0-9._-]+\.(pdf|png|jpeg|txt)$/)
    .max(255),
  mediaType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
  declaredSizeBytes: z.number().int().min(0).max(10 * 1024 * 1024),
}).strict();

export type Attachment = z.infer<typeof attachmentSchema>;

export const actionContextSchema = z.object({
  action: z.enum(["assign", "priority", "reply", "note", "status", "link", "resolve", "dismiss", "escalate", "publish", "retire", "schedule"]),
  expectedState: z.string().optional(),
  expectedVersion: z.number().int().min(1),
  reason: z.string().max(500).optional(),
}).strict();

export type ActionContext = z.infer<typeof actionContextSchema>;

export const engagementAdminActionSchema = z.object({
  action: z.enum(["test", "assign", "priority", "reply", "note", "resolve", "close", "reopen", "review", "plan", "action", "dismiss", "publish", "retire", "activate", "approve", "schedule", "send_now", "pause", "resume", "cancel"]),
  expectedVersion: z.number().int().min(1),
  reason: safeTextSchema.pipe(z.string().min(10).max(500)),
  assigneeId: z.string().max(128).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  message: safeTextSchema.pipe(z.string().max(8192)).optional(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  replacementCategoryId: z.string().uuid().optional(),
  translations: z.array(z.object({
    locale: z.enum(["ar", "en"]),
    title: safeTextSchema.pipe(z.string().min(1).max(180)),
    body: safeTextSchema.pipe(z.string().min(1).max(65536)),
  }).strict()).max(2).optional(),
}).strict();

export type EngagementAdminAction = z.infer<typeof engagementAdminActionSchema>;

export const platformSchema = z.enum(["all", "ios", "android", "unknown"]);
export type Platform = z.infer<typeof platformSchema>;

export const ticketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const ticketStateSchema = z.enum(["open", "waiting_customer", "waiting_support", "resolved", "closed"]);
export type TicketState = z.infer<typeof ticketStateSchema>;

export const feedbackStateSchema = z.enum(["new", "reviewing", "planned", "resolved", "closed"]);
export type FeedbackState = z.infer<typeof feedbackStateSchema>;

export const abuseSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type AbuseSeverity = z.infer<typeof abuseSeveritySchema>;

export const contentStatusSchema = z.enum(["draft", "review", "published", "retired"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const campaignStateSchema = z.enum(["draft", "approved", "scheduled", "running", "paused", "completed", "cancelled"]);
export type CampaignState = z.infer<typeof campaignStateSchema>;

export const channelSchema = z.enum(["email", "push", "in_app"]);
export type Channel = z.infer<typeof channelSchema>;

export const deliveryStatusSchema = z.enum(["queued", "sending", "delivered", "failed", "suppressed"]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const actionResultSchema = z.object({
  resourceId: z.union([sharedIdSchema, routeRecordIdSchema, z.uuid()]),
  previousState: z.string().optional(),
  currentState: z.string().optional(),
  outcome: z.enum(["success", "conflict", "forbidden", "not_found", "validation_error"]),
  message: z.string().max(200),
  timestamp: z.string(),
  conflictMetadata: z.record(z.string(), z.unknown()).optional(),
  auditReference: z.string().regex(/^AUDIT-\d{4,6}-[A-Z0-9]+$/).optional(),
}).strict();

export type ActionResult = z.infer<typeof actionResultSchema>;

export const apiErrorSchema = safeErrorSchema.extend({
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
}).strict();

export type ApiError = z.infer<typeof apiErrorSchema>;

export const communicationRegionSchema = z.object({
  availability: z.enum(["available", "empty", "stale", "partial", "unavailable", "forbidden"]),
  message: z.string().max(240).optional(),
  retryable: z.boolean().optional(),
}).strict();

export const communicationMetricSchema = z.object({
  key: z.string().max(60),
  label: safeTextSchema.pipe(z.string().max(120)),
  value: z.number().nonnegative(),
  unit: z.enum(["tickets", "items", "reports", "campaigns", "messages", "percent", "minutes"]),
  denominator: z.enum(["unique-customers", "tickets", "feedback", "eligible-audience", "deliveries"]).optional(),
  platform: platformSchema,
}).strict();

export const communicationRecordSchema = z.object({
  id: z.string().max(64),
  title: safeTextSchema.pipe(z.string().max(180)),
  subtitle: safeTextSchema.pipe(z.string().max(240)).optional(),
  state: z.string().max(40),
  priority: z.string().max(40).optional(),
  platform: platformSchema.default("all"),
  locale: z.enum(["ar", "en", "both"]).default("both"),
  maskedReference: maskedReferenceSchema.optional(),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
  tags: z.array(z.string().max(40)).max(8).default([]),
}).strict();

export type CommunicationRecord = z.infer<typeof communicationRecordSchema>;

export const communicationPageSchema = z.object({
  items: z.array(communicationRecordSchema).max(100),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }).strict(),
  region: communicationRegionSchema,
}).strict();

export type CommunicationPage = z.infer<typeof communicationPageSchema>;

export const communicationOverviewSchema = z.object({
  title: safeTextSchema.pipe(z.string().max(120)),
  description: safeTextSchema.pipe(z.string().max(240)),
  metrics: z.array(communicationMetricSchema).max(12),
  items: z.array(communicationRecordSchema).max(12),
  region: communicationRegionSchema,
}).strict();

export type CommunicationOverview = z.infer<typeof communicationOverviewSchema>;

export const communicationDetailSchema = communicationRecordSchema.extend({
  body: safeTextSchema.pipe(z.string().max(4000)),
  notes: z.array(safeTextSchema.pipe(z.string().max(500))).max(12).default([]),
  attachments: z.array(attachmentSchema).max(6).default([]),
  auditTrail: z.array(z.object({
    reference: z.string().regex(/^AUDIT-\d{4,6}-[A-Z0-9]+$/),
    action: z.string().max(60),
    at: z.iso.datetime({ offset: true }),
  }).strict()).max(20).default([]),
}).strict();

export type CommunicationDetail = z.infer<typeof communicationDetailSchema>;

export const audiencePreviewRequestSchema = z.object({
  channel: channelSchema,
  platform: platformSchema.default("all"),
  locale: z.enum(["ar", "en", "both"]).default("both"),
  templateRevision: z.number().int().positive().optional(),
}).strict();

export const audiencePreviewSchema = z.object({
  eligibleCount: z.number().int().nonnegative(),
  optedOutCount: z.number().int().nonnegative(),
  denominator: z.literal("eligible-audience"),
  generatedAt: z.iso.datetime({ offset: true }),
}).strict();

export type AudiencePreview = z.infer<typeof audiencePreviewSchema>;
