import { z } from "zod";
import {
  chartPointSchema,
  importRecordSchema,
  metricSchema,
} from "@/features/shared/admin-schemas";

// Existing schemas (preserved)
export const importsQuerySchema = z
  .object({
    query: z.string().trim().max(100).optional(),
    source: z.string().max(100).optional(),
    platform: z.enum(["ios", "android"]).optional(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(25),
    scenario: z.string().optional(),
  })
  .strict();

export const importsResponseSchema = z
  .object({
    metrics: z.array(metricSchema),
    items: z.array(importRecordSchema),
    failureTrend: z.array(chartPointSchema),
    sourceVolume: z.array(chartPointSchema),
    sourceSuccess: z.array(
      z.object({ label: z.string(), value: z.number().min(0).max(100) }),
    ),
    processingTimes: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        width: z.number().min(0).max(100),
      }),
    ),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const retryImportResponseSchema = z
  .object({
    id: z.string().min(1),
    status: z.literal("scheduled"),
    auditEvent: z.literal("admin.import.retry.requested"),
  })
  .strict();

function utf8Bytes(maxBytes: number) {
  return z
    .string()
    .refine((val) => new TextEncoder().encode(val).length <= maxBytes, {
      message: `exceeds ${maxBytes} UTF-8 bytes`,
    });
}

export const safeIdSchema = z
  .string()
  .max(48)
  .refine(
    (value) =>
      /^(IMP-|IFL-|DUP-|FMT-|BNK-|SND-|PRL-|PTC-|PV-|MR-|CR-)[A-Za-z0-9-]{1,44}$/.test(
        value,
      ) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
    "invalid resource identifier",
  );
export const accessLevelSchema = z.enum(["full", "limited", "context"]);
export const platformScopeSchema = z.enum(["all", "android", "ios", "unknown"]);
export const importSourceSchema = z.enum([
  "android_sms",
  "android_notification",
  "ios_shortcut",
  "ios_app_intent",
  "ios_share_extension",
  "screenshot",
  "receipt",
  "csv",
  "pdf_statement",
  "voice",
  "manual",
]);

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(25),
    totalItems: z.number().int().nonnegative().default(0),
    totalPages: z.number().int().nonnegative().default(0),
  })
  .strict();

export const searchNameValidator = utf8Bytes(120);
export const reasonNoteValidator = utf8Bytes(500);
export const patternValidator = utf8Bytes(256);
export const sanitizedSampleValidator = utf8Bytes(4096);
export const ruleDefinitionValidator = utf8Bytes(8192);
export const expectedOutputValidator = utf8Bytes(8192);
export const merchantAliasValidator = utf8Bytes(120);

export const apiErrorSchema = z
  .object({
    status: z.number(),
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    correlationId: z.string().max(48).optional(),
  })
  .strict();

export const auditReferenceSchema = z
  .object({
    eventId: z.string().max(48),
    eventName: z.string().max(120),
    timestamp: z.iso.datetime({ offset: true }),
  })
  .strict();

export const listQuerySchema = z
  .object({
    search: searchNameValidator.optional(),
    platform: platformScopeSchema.optional(),
    source: importSourceSchema.optional(),
    status: z.string().max(40).optional(),
    bankId: safeIdSchema.optional(),
    parserVersionId: safeIdSchema.optional(),
    appVersion: z.string().max(48).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(25),
    sort: z
      .enum([
        "id",
        "status",
        "updatedAt",
        "confidence",
        "priority",
        "source",
        "bank",
        "version",
        "appVersion",
      ])
      .optional(),
    order: z.enum(["asc", "desc"]).optional(),
    scenario: z
      .enum([
        "success",
        "loading",
        "slow",
        "large",
        "empty",
        "partial",
        "unauthorized",
        "forbidden",
        "not-found",
        "gone",
        "conflict",
        "rate-limited",
        "unavailable",
        "unsafe-response",
        "internal-error",
        "validation",
        "expired",
        "duplicate-pending",
      ])
      .optional(),
  })
  .strict();

export function buildListQuery<T extends z.ZodType<Record<string, unknown>>>(
  schema: T,
  input: z.input<T>,
): URLSearchParams {
  const parsed = schema.parse(input);
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key === "scenario" ? "__scenario" : key, String(value));
    }
  }

  return params;
}

export const phase4ResourceSchema = z.enum([
  "sessions",
  "failures",
  "low-confidence",
  "duplicates",
  "unsupported",
  "banks",
  "senders",
  "parser-rules",
  "test-cases",
  "versions",
  "merchant-rules",
  "category-rules",
]);

export const regionStateSchema = z
  .object({
    availability: z.enum([
      "available",
      "empty",
      "stale",
      "partial",
      "unavailable",
      "forbidden",
    ]),
    message: z.string().max(240).optional(),
    retryable: z.boolean().optional(),
  })
  .strict();

export const sanitizedExtractionPreviewSchema = z
  .object({
    source: importSourceSchema,
    maskedBankSender: z.string().max(120),
    direction: z.enum(["incoming", "outgoing"]),
    transactionType: z.enum([
      "purchase",
      "transfer",
      "refund",
      "fee",
      "unknown",
    ]),
    currency: z.string().length(3),
    coarseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maskedMerchant: z.string().max(120),
    maskedCategory: z.string().max(120),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().max(160)).max(10),
    omissionLabels: z.array(z.string().max(80)).max(10),
  })
  .strict();

const parserMatchSchema = z
  .object({
    field: z.enum(["sender", "body", "language", "source"]),
    operator: z.enum(["equals", "contains", "starts_with", "safe_pattern"]),
    value: patternValidator,
  })
  .strict();

const parserCaptureSchema = z
  .object({
    field: z.enum([
      "amount",
      "merchant",
      "category",
      "currency",
      "date",
      "direction",
      "type",
    ]),
    sourceGroup: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
  })
  .strict();

const parserNormalizationSchema = z
  .object({
    field: z.enum([
      "amount",
      "merchant",
      "category",
      "currency",
      "date",
      "direction",
      "type",
    ]),
    operation: z.enum([
      "minor_units",
      "localized_digits",
      "trim",
      "uppercase",
      "lowercase",
      "iso_date",
      "alias_map",
    ]),
  })
  .strict();

const parserOutputMappingSchema = z
  .object({
    sourceField: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
    targetField: z.enum([
      "amount",
      "merchant",
      "category",
      "currency",
      "date",
      "direction",
      "type",
    ]),
  })
  .strict();

export const parserRuleDefinitionSchema = z
  .object({
    matches: z.array(parserMatchSchema).min(1).max(12),
    captures: z.array(parserCaptureSchema).max(12),
    normalizations: z.array(parserNormalizationSchema).max(12),
    mappings: z.array(parserOutputMappingSchema).min(1).max(12),
  })
  .strict();

export const operationalRecordSchema = z
  .object({
    id: safeIdSchema,
    kind: phase4ResourceSchema,
    title: z.string().max(120),
    secondary: z.string().max(160),
    status: z.string().max(40),
    platform: platformScopeSchema.optional(),
    source: importSourceSchema.optional(),
    bank: z.string().max(120).optional(),
    language: z.enum(["ar", "en"]).optional(),
    version: z.string().max(40).optional(),
    confidence: z.number().min(0).max(1).optional(),
    priority: z.number().int().min(1).max(100).optional(),
    updatedAt: z.iso.datetime({ offset: true }),
    accessLevel: accessLevelSchema,
    revision: z.number().int().positive(),
    actions: z.array(z.string().max(60)).max(12),
    warnings: z.array(z.string().max(160)).max(10).optional(),
    preview: sanitizedExtractionPreviewSchema.optional(),
    definition: parserRuleDefinitionSchema.optional(),
    fictionalSample: sanitizedSampleValidator.optional(),
    requiredTestsPassed: z.boolean().optional(),
    scope: z.string().max(120).optional(),
    aliases: z.array(merchantAliasValidator).max(20).optional(),
    pattern: patternValidator.optional(),
    appVersion: z.string().max(48).optional(),
    senderId: safeIdSchema.optional(),
    categoryId: safeIdSchema.optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.accessLevel !== "full" &&
      (record.preview || record.definition || record.fictionalSample)
    ) {
      context.addIssue({
        code: "custom",
        message: "protected fields require full access",
      });
    }
    if (
      record.kind === "parser-rules" &&
      record.accessLevel === "full" &&
      !record.definition
    ) {
      context.addIssue({
        code: "custom",
        message: "full parser rules require a definition",
      });
    }
    if (
      record.fictionalSample &&
      !record.fictionalSample.startsWith("FICTIONAL:")
    ) {
      context.addIssue({
        code: "custom",
        message: "parser samples must be explicitly fictional",
      });
    }
    if (record.kind === "merchant-rules") {
      const aliases = record.aliases ?? [];
      const normalized = aliases.map((alias) =>
        alias.trim().normalize("NFKC").toLocaleLowerCase("en"),
      );
      if (normalized.length !== new Set(normalized).size) {
        context.addIssue({
          code: "custom",
          message: "merchant aliases must be unique within scope",
        });
      }
    }
    if (record.kind === "category-rules" && record.confidence === undefined) {
      context.addIssue({
        code: "custom",
        message: "category rules require confidence",
      });
    }
  });

export const operationalListSchema = z
  .object({
    items: z.array(operationalRecordSchema),
    page: z.number().int().min(1).max(100),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    region: regionStateSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (response.items.length > response.pageSize) {
      context.addIssue({ code: "custom", message: "page exceeds pageSize" });
    }
    if (
      new Set(response.items.map((record) => record.id)).size !==
      response.items.length
    ) {
      context.addIssue({
        code: "custom",
        message: "page contains duplicate identifiers",
      });
    }
    const expectedPages =
      response.totalItems === 0
        ? 0
        : Math.ceil(response.totalItems / response.pageSize);
    if (response.totalPages !== expectedPages) {
      context.addIssue({ code: "custom", message: "invalid totalPages" });
    }
  });

export const importOverviewSchema = z
  .object({
    platform: platformScopeSchema,
    uniqueCustomers: z.number().int().nonnegative(),
    uniqueCustomerSemantics: z.literal("authoritative"),
    totalSessions: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    failedSessions: z.number().int().nonnegative(),
    highestFailureSource: importSourceSchema,
    eventDeduplication: z.literal("non_duplicated_events"),
    region: regionStateSchema,
  })
  .strict();

export const importSessionDetailSchema = operationalRecordSchema
  .and(
    z
      .object({
        kind: z.literal("sessions"),
        timeline: z
          .array(
            z
              .object({
                label: z.string().max(120),
                timestamp: z.iso.datetime({ offset: true }),
                status: z.enum(["completed", "warning", "failed"]),
              })
              .strict(),
          )
          .max(12),
        totalItems: z.number().int().nonnegative(),
        successfulItems: z.number().int().nonnegative(),
        failedItems: z.number().int().nonnegative(),
        expectedCurrentState: z.string().max(40),
        auditReferences: z.array(auditReferenceSchema).max(12),
      })
      .strict(),
  )
  .superRefine((session, context) => {
    if (session.successfulItems + session.failedItems > session.totalItems) {
      context.addIssue({
        code: "custom",
        message: "session item counts exceed total",
      });
    }
  });

export const phase4ActionRequestSchema = z
  .object({
    action: z.enum([
      "retry_handoff",
      "assign_parser_issue",
      "mark_unsupported",
      "create_rule_draft_handoff",
      "accept_suggestion",
      "correct_merchant",
      "correct_category",
      "defer",
      "confirm_duplicate",
      "reject_match",
      "activate",
      "deactivate",
      "test",
      "release",
      "retire",
      "rollback",
      "save",
    ]),
    expectedState: z.string().max(40),
    expectedRevision: z.number().int().positive(),
    reason: reasonNoteValidator,
    proposal: z
      .object({
        title: searchNameValidator.optional(),
        pattern: patternValidator.optional(),
        aliases: z.array(merchantAliasValidator).max(20).optional(),
        confidence: z.number().min(0).max(1).optional(),
        status: z
          .enum(["active", "inactive", "review", "draft", "testing"])
          .optional(),
        categoryId: safeIdSchema.optional(),
        bankId: safeIdSchema.optional(),
        senderId: safeIdSchema.optional(),
        definition: parserRuleDefinitionSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const failedImportActionRequestSchema = phase4ActionRequestSchema.refine(
  (request) =>
    [
      "retry_handoff",
      "assign_parser_issue",
      "mark_unsupported",
      "create_rule_draft_handoff",
      "save",
    ].includes(request.action),
  "invalid failed-import action",
);
export const lowConfidenceActionRequestSchema =
  phase4ActionRequestSchema.refine(
    (request) =>
      [
        "accept_suggestion",
        "correct_merchant",
        "correct_category",
        "defer",
        "mark_unsupported",
      ].includes(request.action),
    "invalid low-confidence action",
  );
export const duplicateActionRequestSchema = phase4ActionRequestSchema.refine(
  (request) =>
    ["confirm_duplicate", "reject_match", "defer"].includes(request.action),
  "invalid duplicate action",
);
export const unsupportedFormatActionRequestSchema =
  phase4ActionRequestSchema.refine(
    (request) =>
      [
        "assign_parser_issue",
        "mark_unsupported",
        "create_rule_draft_handoff",
        "defer",
      ].includes(request.action),
    "invalid unsupported-format action",
  );
export const senderActionRequestSchema = phase4ActionRequestSchema.refine(
  (request) => ["save", "activate", "deactivate"].includes(request.action),
  "invalid sender action",
);
export const parserRuleActionRequestSchema = phase4ActionRequestSchema.refine(
  (request) =>
    ["save", "activate", "deactivate", "test"].includes(request.action),
  "invalid parser-rule action",
);
export const parserVersionActionRequestSchema =
  phase4ActionRequestSchema.refine(
    (request) =>
      ["test", "release", "retire", "rollback"].includes(request.action),
    "invalid parser-version action",
  );
export const merchantRuleActionRequestSchema =
  phase4ActionRequestSchema.superRefine((request, context) => {
    if (!["save", "activate", "deactivate"].includes(request.action)) {
      context.addIssue({
        code: "custom",
        message: "invalid merchant-rule action",
      });
    }
    const aliases = request.proposal?.aliases ?? [];
    const normalized = aliases.map((alias) =>
      alias.trim().normalize("NFKC").toLocaleLowerCase("en"),
    );
    if (normalized.length !== new Set(normalized).size) {
      context.addIssue({
        code: "custom",
        message: "duplicate aliases are not allowed",
      });
    }
  });
export const categoryRuleActionRequestSchema = phase4ActionRequestSchema.refine(
  (request) => ["save", "activate", "deactivate"].includes(request.action),
  "invalid category-rule action",
);

export const phase4ActionResultSchema = z
  .object({
    affectedId: safeIdSchema,
    previousState: z.string().max(40),
    currentState: z.string().max(40),
    outcome: z.literal("success"),
    message: z.string().max(240),
    auditReference: auditReferenceSchema,
    createdDraftId: safeIdSchema.optional(),
  })
  .strict();

// Type exports for existing contracts
export type ImportsQuery = z.input<typeof importsQuerySchema>;
export type ImportsResponse = z.infer<typeof importsResponseSchema>;
export type ImportRecordContract = z.infer<typeof importRecordSchema>;

// Type exports for foundation schemas
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type PlatformScope = z.infer<typeof platformScopeSchema>;
export type ImportSource = z.infer<typeof importSourceSchema>;
export type SafeId = z.infer<typeof safeIdSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type AuditReference = z.infer<typeof auditReferenceSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type Phase4Resource = z.infer<typeof phase4ResourceSchema>;
export type OperationalRecord = z.infer<typeof operationalRecordSchema>;
export type OperationalList = z.infer<typeof operationalListSchema>;
export type ImportOverview = z.infer<typeof importOverviewSchema>;
export type ImportSessionDetail = z.infer<typeof importSessionDetailSchema>;
export type SanitizedExtractionPreview = z.infer<
  typeof sanitizedExtractionPreviewSchema
>;
export type ParserRuleDefinition = z.infer<typeof parserRuleDefinitionSchema>;
export type Phase4ActionRequest = z.infer<typeof phase4ActionRequestSchema>;
export type Phase4ActionResult = z.infer<typeof phase4ActionResultSchema>;
export type ImportSessionListItem = OperationalRecord;
export type FailedImportItem = OperationalRecord;
export type LowConfidenceItem = OperationalRecord;
export type DuplicateCandidate = OperationalRecord;
export type UnsupportedFormatItem = OperationalRecord;
export type BankCoverageItem = OperationalRecord;
export type BankDetail = OperationalRecord;
export type SenderRule = OperationalRecord;
export type ParserRuleDetail = OperationalRecord;
export type ParserTestCase = OperationalRecord;
export type ParserVersion = OperationalRecord;
export type MerchantRule = OperationalRecord;
export type CategoryRule = OperationalRecord;
