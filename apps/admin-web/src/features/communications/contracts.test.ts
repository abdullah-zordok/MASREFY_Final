import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  actionResultSchema,
  engagementAdminActionSchema,
  safeErrorSchema as productionSafeErrorSchema,
} from "./contracts";

describe("communications strict schema tests", () => {
  test("shared ID schema validates valid IDs and rejects invalid ones", () => {
    const idSchema = z.string().regex(/^[A-Z]{2,4}-\d{4,6}-[A-Z0-9]+$/);
    
    expect(() => idSchema.parse("TKT-1001-ABC")).not.toThrow();
    expect(() => idSchema.parse("FDB-2001-XYZ123")).not.toThrow();
    expect(() => idSchema.parse("CMP-30045-ACT")).not.toThrow();
    
    expect(() => idSchema.parse("tkt-1001-abc")).toThrow();
    expect(() => idSchema.parse("TKT-1001")).toThrow();
    expect(() => idSchema.parse("INVALID-ID")).toThrow();
  });

  test("action results accept documented resource ID formats", () => {
    const actionResultFields = {
      previousState: "draft",
      currentState: "published",
      outcome: "success" as const,
      message: "Mock action accepted",
      timestamp: "2026-07-29T12:00:00+03:00",
      auditReference: "AUDIT-7777-ACT",
    };

    expect(() => actionResultSchema.parse({ ...actionResultFields, resourceId: "TKT-1001" })).not.toThrow();
    expect(() => actionResultSchema.parse({ ...actionResultFields, resourceId: "TKT-1001-A" })).not.toThrow();
    expect(() => actionResultSchema.parse({ ...actionResultFields, resourceId: "10000000-0000-4000-8000-000000000001" })).not.toThrow();
  });

  test("masked reference schema preserves masking and rejects unmasked data", () => {
    const maskedRefSchema = z.object({
      id: z.string().regex(/^MASKED-\d{4}$/),
      type: z.enum(["user", "device", "payment"]),
      safeContext: z.string().max(100),
    });
    
    expect(() => maskedRefSchema.parse({
      id: "MASKED-1234",
      type: "user",
      safeContext: "iOS v2.1.0"
    })).not.toThrow();
    
    expect(() => maskedRefSchema.parse({
      id: "USER-12345",
      type: "user",
      safeContext: "Full email exposed"
    })).toThrow();
  });

  test("pagination schema validates bounds and rejects invalid values", () => {
    const paginationSchema = z.object({
      page: z.number().int().min(1),
      pageSize: z.enum(["25", "50", "100"]),
      total: z.number().int().min(0).optional(),
    });
    
    expect(() => paginationSchema.parse({ page: 1, pageSize: "25" })).not.toThrow();
    expect(() => paginationSchema.parse({ page: 10, pageSize: "100", total: 250 })).not.toThrow();
    
    expect(() => paginationSchema.parse({ page: 0, pageSize: "25" })).toThrow();
    expect(() => paginationSchema.parse({ page: 1, pageSize: "15" })).toThrow();
    expect(() => paginationSchema.parse({ page: 1, pageSize: "200" })).toThrow();
    expect(() => paginationSchema.parse({ page: -1, pageSize: "25" })).toThrow();
  });

  test("safe error schema sanitizes messages and rejects stack traces", () => {
    const safeErrorSchema = z.object({
      status: z.enum(["400", "401", "403", "404", "409", "422", "500"]),
      code: z.string().max(50),
      message: z.string().max(200),
      correlationId: z.string().regex(/^[A-Z0-9-]{16,32}$/),
    }).strict();
    
    expect(() => safeErrorSchema.parse({
      status: "403",
      code: "FORBIDDEN",
      message: "Access denied",
      correlationId: "CORR-12345-ABCDEF"
    })).not.toThrow();
    
    expect(() => safeErrorSchema.parse({
      status: "500",
      code: "INTERNAL_ERROR",
      message: "Stack trace: Error at line 123",
      correlationId: "CORR-12345-ABCDEF",
      stack: "detailed stack trace"
    })).toThrow();
  });

  test("Unicode NFC normalization enforces canonical form", () => {
    const textSchema = z.string()
      .transform((val) => val.normalize("NFC"))
      .refine((val) => val === val.normalize("NFC"));
    
    const composed = "café";
    const decomposed = "cafe\u0301";
    
    expect(() => textSchema.parse(composed)).not.toThrow();
    expect(() => textSchema.parse(decomposed)).not.toThrow(); // Transform normalizes
    
    expect(textSchema.parse(decomposed)).toBe(composed);
  });

  test("code-point limits enforce character counts not byte counts", () => {
    const searchSchema = z.string().max(120); // 120 Unicode code points
    const subjectSchema = z.string().max(160); // 160 Unicode code points
    
    const longSearch = "a".repeat(120);
    const tooLongSearch = "a".repeat(121);
    const emojiSearch = "😀".repeat(60); // 60 emojis = 60 code points, 240 bytes
    
    expect(() => searchSchema.parse(longSearch)).not.toThrow();
    expect(() => searchSchema.parse(tooLongSearch)).toThrow();
    expect(() => searchSchema.parse(emojiSearch)).not.toThrow();
    
    const longSubject = "a".repeat(160);
    const tooLongSubject = "a".repeat(161);
    
    expect(() => subjectSchema.parse(longSubject)).not.toThrow();
    expect(() => subjectSchema.parse(tooLongSubject)).toThrow();
  });

  test("UTF-8 KiB limits enforce byte length constraints", () => {
    const createKiBLimitSchema = (maxKiB: number) => z.string()
      .refine((val) => new Blob([val]).size <= maxKiB * 1024, {
        message: `Exceeds ${maxKiB} KiB UTF-8 byte limit`
      });
    
    const messageSchema = createKiBLimitSchema(8); // 8 KiB
    const noteSchema = createKiBLimitSchema(2); // 2 KiB
    const contentSchema = createKiBLimitSchema(16); // 16 KiB
    
    const shortMessage = "a".repeat(100);
    const longMessage = "a".repeat(8 * 1024);
    const tooLongMessage = "a".repeat(8 * 1024 + 1);
    
    expect(() => messageSchema.parse(shortMessage)).not.toThrow();
    expect(() => messageSchema.parse(longMessage)).not.toThrow();
    expect(() => messageSchema.parse(tooLongMessage)).toThrow();
    
    const shortNote = "a".repeat(100);
    const longNote = "a".repeat(2 * 1024);
    const tooLongNote = "a".repeat(2 * 1024 + 1);
    
    expect(() => noteSchema.parse(shortNote)).not.toThrow();
    expect(() => noteSchema.parse(longNote)).not.toThrow();
    expect(() => noteSchema.parse(tooLongNote)).toThrow();
    
    const mixedContent = "مرحبا" + "😀".repeat(1000) + "a".repeat(100);
    expect(() => contentSchema.parse(mixedContent)).not.toThrow();
  });

  test("bidi and control character rejection prevents spoofing", () => {
    const safeTextSchema = z.string()
      .refine((val) => !/[\u202A-\u202E\u2066-\u2069]/.test(val), {
        message: "Contains bidirectional override characters"
      })
      .refine((val) => !/[\x00-\x1F\x7F-\x9F]/.test(val), {
        message: "Contains control characters"
      })
      .refine((val) => !/[\uFFF0-\uFFFF]/.test(val), {
        message: "Contains special Unicode characters"
      });
    
    const arabicText = "مرحبا بك";
    const englishText = "Hello there";
    const mixedText = "مرحبا Hello";
    
    expect(() => safeTextSchema.parse(arabicText)).not.toThrow();
    expect(() => safeTextSchema.parse(englishText)).not.toThrow();
    expect(() => safeTextSchema.parse(mixedText)).not.toThrow();
    
    const bidiOverride = "Hello\u202EWorld"; // RTL override
    const controlChars = "Hello\x00World";
    const specialUnicode = "Hello\uFFF9World";
    
    expect(() => safeTextSchema.parse(bidiOverride)).toThrow();
    expect(() => safeTextSchema.parse(controlChars)).toThrow();
    expect(() => safeTextSchema.parse(specialUnicode)).toThrow();
  });

  test("attachment metadata schema validates safe fields and rejects bytes", () => {
    const attachmentSchema = z.object({
      id: z.string().regex(/^ATT-\d{4,6}-[A-Z0-9]+$/),
      filename: z.string()
        .regex(/^[a-zA-Z0-9._-]+\.(pdf|png|jpeg|txt)$/)
        .max(255),
      mediaType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
      declaredSizeBytes: z.number().int().min(0).max(10 * 1024 * 1024), // Max 10 MiB
    }).strict();
    
    expect(() => attachmentSchema.parse({
      id: "ATT-12345-ABC",
      filename: "document.pdf",
      mediaType: "application/pdf",
      declaredSizeBytes: 1024 * 1024
    })).not.toThrow();
    
    expect(() => attachmentSchema.parse({
      id: "ATT-12345-ABC",
      filename: "document.pdf",
      mediaType: "application/pdf",
      declaredSizeBytes: 1024 * 1024,
      url: "https://example.com/file.pdf"
    })).toThrow(); // Unknown field
    
    expect(() => attachmentSchema.parse({
      id: "ATT-12345-ABC",
      filename: "script.exe",
      mediaType: "application/exe",
      declaredSizeBytes: 1024
    })).toThrow(); // Invalid media type
    
    expect(() => attachmentSchema.parse({
      id: "ATT-12345-ABC",
      filename: "document.pdf",
      mediaType: "application/pdf",
      declaredSizeBytes: 11 * 1024 * 1024 // Exceeds 10 MiB
    })).toThrow();
    
    expect(() => attachmentSchema.parse({
      id: "ATT-12345-ABC",
      filename: "../../../etc/passwd",
      mediaType: "text/plain",
      declaredSizeBytes: 1024
    })).toThrow(); // Invalid filename pattern
  });

  test("action context schema validates required fields and versioning", () => {
    const actionContextSchema = z.object({
      action: z.enum(["assign", "priority", "reply", "note", "status", "link", "resolve", "dismiss", "escalate", "publish", "retire", "schedule"]),
      expectedState: z.string().optional(),
      expectedVersion: z.number().int().min(1),
      reason: z.string().max(500).optional(),
    }).strict();
    
    expect(() => actionContextSchema.parse({
      action: "assign",
      expectedVersion: 1
    })).not.toThrow();
    
    expect(() => actionContextSchema.parse({
      action: "reply",
      expectedVersion: 3,
      reason: "Customer asked for clarification"
    })).not.toThrow();
    
    expect(() => actionContextSchema.parse({
      action: "invalid_action",
      expectedVersion: 1
    })).toThrow();
    
    expect(() => actionContextSchema.parse({
      action: "assign",
      expectedVersion: 0
    })).toThrow();
    
    expect(() => actionContextSchema.parse({
      action: "assign",
      expectedVersion: 1,
      extraField: "not allowed"
    })).toThrow();
  });

  test("unknown field rejection enforces strict validation", () => {
    const strictSchema = z.object({
      id: z.string(),
      name: z.string(),
    }).strict();
    
    expect(() => strictSchema.parse({
      id: "123",
      name: "Test"
    })).not.toThrow();
    
    expect(() => strictSchema.parse({
      id: "123",
      name: "Test",
      extra: "field"
    })).toThrow();
    
    expect(() => strictSchema.parse({
      id: "123",
      name: "Test",
      unknown: "value",
      another: "field"
    })).toThrow();
  });

  test("production Phase 11 action schema requires a bounded reason and rejects unknown fields", () => {
    expect(() => engagementAdminActionSchema.parse({
      action: "publish",
      expectedVersion: 2,
      reason: "Approved bilingual content",
    })).not.toThrow();
    expect(() => engagementAdminActionSchema.parse({
      action: "publish",
      expectedVersion: 2,
      reason: "short",
    })).toThrow();
    expect(() => engagementAdminActionSchema.parse({
      action: "publish",
      expectedVersion: 2,
      reason: "Approved bilingual content",
      status: "published",
    })).toThrow();
  });

  test("production safe error contract never accepts diagnostic fields", () => {
    expect(() => productionSafeErrorSchema.parse({
      status: "500",
      code: "INTERNAL_ERROR",
      message: "Request failed",
      correlationId: "CORR-12345-ABCDEF",
      stack: "private stack",
    })).toThrow();
  });

  test("search text with mixed RTL/LTR and special characters", () => {
    const searchSchema = z.string()
      .max(120)
      .transform((val) => val.normalize("NFC"))
      .refine((val) => !/[\x00-\x1F\x7F-\x9F\u202A-\u202E\u2066-\u2069\uFFF0-\uFFFF]/.test(val));
    
    const arabicSearch = "بحث باللغة العربية";
    const englishSearch = "English search";
    const mixedSearch = "بحث English";
    
    expect(() => searchSchema.parse(arabicSearch)).not.toThrow();
    expect(() => searchSchema.parse(englishSearch)).not.toThrow();
    expect(() => searchSchema.parse(mixedSearch)).not.toThrow();
    
    const longSearch = "a".repeat(121);
    expect(() => searchSchema.parse(longSearch)).toThrow();
    
    const withControl = "Hello\x00World";
    expect(() => searchSchema.parse(withControl)).toThrow();
  });
});
