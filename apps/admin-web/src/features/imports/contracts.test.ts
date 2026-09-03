import { describe, expect, test } from "vitest";
import {
  safeIdSchema,
  accessLevelSchema,
  platformScopeSchema,
  importSourceSchema,
  paginationSchema,
  apiErrorSchema,
  auditReferenceSchema,
  listQuerySchema,
  searchNameValidator,
  reasonNoteValidator,
  patternValidator,
  buildListQuery,
  importOverviewSchema,
  operationalListSchema,
  operationalRecordSchema,
  parserRuleDefinitionSchema,
  phase4ActionRequestSchema,
  senderActionRequestSchema,
  merchantRuleActionRequestSchema,
  categoryRuleActionRequestSchema,
  sanitizedExtractionPreviewSchema,
} from "./contracts";
import {
  phase4OverviewFixtures,
  phase4Records,
} from "@/mocks/fixtures/imports";

describe("Spec 005 foundation contracts", () => {
  describe("SafeId validation", () => {
    test.each([
      ["IMP-001", true],
      ["IFL-001", true],
      ["DUP-001", true],
      ["FMT-001", true],
      ["BNK-001", true],
      ["SND-001", true],
      ["PRL-001", true],
      ["PTC-001", true],
      ["PV-001", true],
      ["MR-001", true],
      ["CR-001", true],
      ["INVALID-001", false],
      ["random-id", false],
      ["", false],
      ["IMP-", false],
      ["IMP-TOOLONG-ID-THAT-EXCEEDS-MAXIMUM-LENGTH-OF-48X", false],
    ] as const)("validates %s as %s", (id, shouldPass) => {
      const result = safeIdSchema.safeParse(id);
      expect(result.success).toBe(shouldPass);
    });

    test("rejects unknown fields in SafeId objects", () => {
      const result = safeIdSchema.safeParse({ id: "IMP-001", extra: "field" });
      expect(result.success).toBe(false);
    });
  });

  describe("access level projection", () => {
    test.each([
      ["full", true],
      ["limited", true],
      ["context", true],
      ["invalid", false],
      ["", false],
    ] as const)("accepts %s and rejects %s", (level, shouldPass) => {
      const result = accessLevelSchema.safeParse(level);
      expect(result.success).toBe(shouldPass);
    });
  });

  describe("platform scope", () => {
    test.each([
      ["all", true],
      ["android", true],
      ["ios", true],
      ["unknown", true],
      ["invalid", false],
    ] as const)("validates %s", (platform, shouldPass) => {
      const result = platformScopeSchema.safeParse(platform);
      expect(result.success).toBe(shouldPass);
    });
  });

  describe("import source", () => {
    test.each([
      ["android_sms", true],
      ["android_notification", true],
      ["ios_shortcut", true],
      ["ios_app_intent", true],
      ["ios_share_extension", true],
      ["screenshot", true],
      ["receipt", true],
      ["csv", true],
      ["pdf_statement", true],
      ["voice", true],
      ["manual", true],
      ["invalid_source", false],
    ] as const)("validates %s", (source, shouldPass) => {
      const result = importSourceSchema.safeParse(source);
      expect(result.success).toBe(shouldPass);
    });
  });

  describe("pagination bounds", () => {
    test("uses default values for page and pageSize", () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      });
    });

    test.each([
      [25, true],
      [50, true],
      [100, true],
      [10, false],
      [75, false],
      [150, false],
      [-1, false],
    ] as const)(
      "allows page sizes %i and rejects others",
      (pageSize, shouldPass) => {
        const result = paginationSchema.safeParse({ pageSize });
        expect(result.success).toBe(shouldPass);
      },
    );

    test("requires positive page numbers", () => {
      expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(paginationSchema.safeParse({ page: -1 }).success).toBe(false);
      expect(paginationSchema.safeParse({ page: 1 }).success).toBe(true);
      expect(paginationSchema.safeParse({ page: 101 }).success).toBe(false);
    });
  });

  describe("UTF-8 byte boundaries", () => {
    test("enforces 120-byte limit on search names", () => {
      expect(searchNameValidator.safeParse("a".repeat(120)).success).toBe(true);
      expect(searchNameValidator.safeParse("a".repeat(121)).success).toBe(
        false,
      );
      // Multi-byte characters count bytes, not characters
      expect(searchNameValidator.safeParse("🎉".repeat(30)).success).toBe(true); // 120 emojis = 120 bytes
      expect(searchNameValidator.safeParse("🎉".repeat(31)).success).toBe(
        false,
      ); // 124 emojis = 124 bytes
    });

    test("enforces 500-byte limit on reason notes", () => {
      expect(reasonNoteValidator.safeParse("a".repeat(500)).success).toBe(true);
      expect(reasonNoteValidator.safeParse("a".repeat(501)).success).toBe(
        false,
      );
    });

    test("enforces 256-byte limit on patterns", () => {
      expect(patternValidator.safeParse("a".repeat(256)).success).toBe(true);
      expect(patternValidator.safeParse("a".repeat(257)).success).toBe(false);
    });
  });

  describe("safe error schema", () => {
    test("accepts well-formed error objects", () => {
      const result = apiErrorSchema.safeParse({
        status: 404,
        code: "not_found",
        message: "غير موجود",
      });
      expect(result.success).toBe(true);
    });

    test("allows optional field errors and correlation ID", () => {
      const result = apiErrorSchema.safeParse({
        status: 400,
        code: "validation_error",
        message: "طلب غير صالح",
        fieldErrors: { name: ["required"] },
        correlationId: "CORR-001",
      });
      expect(result.success).toBe(true);
    });

    test("requires status, code, and message", () => {
      expect(
        apiErrorSchema.safeParse({ code: "not_found", message: "not found" })
          .success,
      ).toBe(false);
      expect(
        apiErrorSchema.safeParse({ status: 404, message: "not found" }).success,
      ).toBe(false);
      expect(
        apiErrorSchema.safeParse({ status: 404, code: "not_found" }).success,
      ).toBe(false);
    });
  });

  describe("audit reference schema", () => {
    test("accepts valid audit references", () => {
      const result = auditReferenceSchema.safeParse({
        eventId: "AUD-001",
        eventName: "admin.import.retry",
        timestamp: "2026-07-29T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    test("requires all fields", () => {
      expect(
        auditReferenceSchema.safeParse({ eventId: "AUD-001" }).success,
      ).toBe(false);
      expect(
        auditReferenceSchema.safeParse({ eventName: "test" }).success,
      ).toBe(false);
      expect(
        auditReferenceSchema.safeParse({
          timestamp: "2026-07-29T10:00:00.000Z",
        }).success,
      ).toBe(false);
    });
  });

  describe("list query parsing", () => {
    test("applies default values", () => {
      const result = listQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        page: 1,
        pageSize: 25,
        search: undefined,
        platform: undefined,
        source: undefined,
        status: undefined,
        bankId: undefined,
        parserVersionId: undefined,
        sort: undefined,
        order: undefined,
        scenario: undefined,
      });
    });

    test.each([
      [25, true],
      [50, true],
      [100, true],
      [10, false],
      [75, false],
    ] as const)("validates page size %i", (pageSize, shouldPass) => {
      const result = listQuerySchema.safeParse({ pageSize });
      expect(result.success).toBe(shouldPass);
    });

    test("enforces 120-character limit on search", () => {
      expect(
        listQuerySchema.shape.search.safeParse("a".repeat(120)).success,
      ).toBe(true);
      expect(
        listQuerySchema.shape.search.safeParse("a".repeat(121)).success,
      ).toBe(false);
    });

    test("accepts documented session filters, sort keys, and date bounds", () => {
      const result = listQuerySchema.safeParse({
        source: "android_sms",
        bankId: "BNK-001",
        parserVersionId: "PV-3182",
        appVersion: "4.8.1",
        dateFrom: "2026-07-29",
        dateTo: "2026-07-29",
        sort: "appVersion",
        order: "asc",
      });

      expect(result.success).toBe(true);
      expect(
        listQuerySchema.safeParse({ dateFrom: "29-07-2026" }).success,
      ).toBe(false);
      expect(listQuerySchema.safeParse({ sort: "rawPayload" }).success).toBe(
        false,
      );
    });
  });

  describe("buildListQuery helper", () => {
    test("converts parsed query to URLSearchParams", () => {
      const params = buildListQuery(listQuerySchema, {
        page: 2,
        pageSize: 50,
        search: "test",
        platform: "android",
      });

      expect(params.get("page")).toBe("2");
      expect(params.get("pageSize")).toBe("50");
      expect(params.get("search")).toBe("test");
      expect(params.get("platform")).toBe("android");
    });

    test("renames scenario to __scenario", () => {
      const params = buildListQuery(listQuerySchema, { scenario: "empty" });
      expect(params.get("__scenario")).toBe("empty");
      expect(params.get("scenario")).toBeNull();
    });

    test("omits undefined and empty values", () => {
      const params = buildListQuery(listQuerySchema, {
        search: "",
        platform: undefined,
      });

      expect(params.has("search")).toBe(false);
      expect(params.has("platform")).toBe(false);
    });

    test("preserves existing values when provided", () => {
      const params = buildListQuery(listQuerySchema, {
        page: 3,
        pageSize: 25,
      });

      expect(params.get("page")).toBe("3");
      expect(params.get("pageSize")).toBe("25");
    });
  });
});

describe("Spec 005 story contracts", () => {
  test("accepts authoritative platform overviews without deriving combined customers", () => {
    const combined = importOverviewSchema.parse(phase4OverviewFixtures.all);
    const android = importOverviewSchema.parse(phase4OverviewFixtures.android);
    const ios = importOverviewSchema.parse(phase4OverviewFixtures.ios);

    expect(combined.uniqueCustomerSemantics).toBe("authoritative");
    expect(combined.uniqueCustomers).not.toBe(
      android.uniqueCustomers + ios.uniqueCustomers,
    );
    expect(combined.eventDeduplication).toBe("non_duplicated_events");
  });

  test("rejects value-bearing and unknown fields from sanitized previews", () => {
    const preview = phase4Records.sessions[0].preview;
    expect(sanitizedExtractionPreviewSchema.safeParse(preview).success).toBe(
      true,
    );
    expect(
      sanitizedExtractionPreviewSchema.safeParse({
        ...preview,
        amount: 990,
      }).success,
    ).toBe(false);
  });

  test("rejects executable and recursive parser definitions", () => {
    const definition = phase4Records["parser-rules"][0].definition;
    expect(parserRuleDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(
      parserRuleDefinitionSchema.safeParse({
        ...definition,
        execute: "fetch('https://example.test')",
      }).success,
    ).toBe(false);
    expect(
      parserRuleDefinitionSchema.safeParse({
        matches: [{ field: "body", operator: "eval", value: "payload" }],
        captures: [],
        normalizations: [],
        mappings: [{ sourceField: "merchant", targetField: "merchant" }],
      }).success,
    ).toBe(false);
  });

  test("requires protected fields to be structurally absent outside full access", () => {
    const full = phase4Records.sessions[0];
    expect(operationalRecordSchema.safeParse(full).success).toBe(true);
    expect(
      operationalRecordSchema.safeParse({ ...full, accessLevel: "limited" })
        .success,
    ).toBe(false);
    const limited = { ...full };
    delete limited.preview;
    expect(
      operationalRecordSchema.safeParse({
        ...limited,
        accessLevel: "limited",
        actions: [],
      }).success,
    ).toBe(true);
  });

  test("enforces unique identifiers, page size, and total page arithmetic", () => {
    const base = {
      items: phase4Records.sessions,
      page: 1,
      pageSize: 25 as const,
      totalItems: 2,
      totalPages: 1,
      region: { availability: "available" as const },
    };
    expect(operationalListSchema.safeParse(base).success).toBe(true);
    expect(
      operationalListSchema.safeParse({
        ...base,
        items: [phase4Records.sessions[0], phase4Records.sessions[0]],
      }).success,
    ).toBe(false);
    expect(
      operationalListSchema.safeParse({ ...base, totalPages: 2 }).success,
    ).toBe(false);
  });

  test("validates confirmed bounded action requests", () => {
    const request = {
      action: "retry_handoff",
      expectedState: "failed",
      expectedRevision: 1,
      reason: "مراجعة تشغيلية",
    };
    expect(phase4ActionRequestSchema.safeParse(request).success).toBe(true);
    expect(
      phase4ActionRequestSchema.safeParse({
        ...request,
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      phase4ActionRequestSchema.safeParse({
        ...request,
        confirmationToken: "fixture-only",
      }).success,
    ).toBe(false);
  });

  test("validates sender, merchant, and category action boundaries", () => {
    const base = {
      action: "save",
      expectedState: "active",
      expectedRevision: 1,
      reason: "مراجعة تشغيلية",
    } as const;

    expect(
      senderActionRequestSchema.safeParse({
        ...base,
        proposal: { pattern: "^BANK-DEMO$" },
      }).success,
    ).toBe(true);
    expect(
      senderActionRequestSchema.safeParse({ ...base, action: "rollback" })
        .success,
    ).toBe(false);
    expect(
      merchantRuleActionRequestSchema.safeParse({
        ...base,
        proposal: { aliases: ["DEMO", " demo "] },
      }).success,
    ).toBe(false);
    expect(
      categoryRuleActionRequestSchema.safeParse({
        ...base,
        proposal: { confidence: 0.82, categoryId: "CR-FOOD" },
      }).success,
    ).toBe(true);
    expect(
      categoryRuleActionRequestSchema.safeParse({
        ...base,
        proposal: { confidence: 1.2 },
      }).success,
    ).toBe(false);
  });
});
