import { describe, expect, test, beforeEach, vi } from "vitest";
import { CommunicationsRepository } from "./repository";

describe("Communications Repository", () => {
  let repository: CommunicationsRepository;

  beforeEach(() => {
    repository = new CommunicationsRepository();
    vi.clearAllMocks();
  });

  describe("query-key structure", () => {
    test("generates deterministic query keys for support tickets", () => {
      const key1 = repository.getSupportTicketsQueryKey({
        page: 1,
        pageSize: "25",
        status: "open",
      });
      const key2 = repository.getSupportTicketsQueryKey({
        page: 1,
        pageSize: "25",
        status: "open",
      });

      expect(key1).toEqual(key2);
      expect(key1).toEqual(["phase6-communications", "support-tickets", { page: 1, pageSize: "25", status: "open" }]);
    });

    test("generates different keys for different filter values", () => {
      const key1 = repository.getSupportTicketsQueryKey({
        page: 1,
        pageSize: "25",
        status: "open",
      });
      const key2 = repository.getSupportTicketsQueryKey({
        page: 2,
        pageSize: "50",
        status: "resolved",
      });

      expect(key1).not.toEqual(key2);
    });
  });

  describe("URL encoding", () => {
    test("properly encodes special characters in search queries", () => {
      const searchQuery = "test search & special=chars";
      const encoded = repository.encodeSearchParams({ search: searchQuery });
      
      expect(encoded).toContain("search=");
      expect(encoded).toContain("special");
      expect(encoded).not.toContain("&special=");
    });

    test("handles Arabic text encoding", () => {
      const arabicText = "بحث باللغة العربية";
      const encoded = repository.encodeSearchParams({ search: arabicText });
      
      expect(encoded).toContain("search=");
      expect(encoded).toContain("%D8%A8"); // Arabic character encoding
    });
  });

  describe("strict response parsing", () => {
    test("accepts valid response structure", async () => {
      const validResponse = {
        id: "TKT-1001",
        subject: "Test ticket",
        status: "open",
        priority: "normal",
        version: 1,
        createdAt: "2026-07-29T12:00:00+03:00",
        updatedAt: "2026-07-29T12:00:00+03:00",
      };

      await expect(
        repository.validateResponse(validResponse, "supportTicket")
      ).resolves.toBeDefined();
    });
  });

  describe("safe error parsing", () => {
    test("parses API errors without exposing sensitive data", () => {
      const apiError = {
        status: 403,
        code: "FORBIDDEN",
        message: "Access denied",
        correlationId: "CORR-12345-ABCDEF",
      };

      const parsed = repository.parseApiError(apiError);
      
      expect(parsed).toEqual({
        status: "403",
        code: "FORBIDDEN",
        message: "Access denied",
        correlationId: "CORR-12345-ABCDEF",
      });
    });

    test("handles errors with field-level validation", () => {
      const validationError = {
        status: 422,
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        correlationId: "CORR-12345-ABCDEF",
        fieldErrors: {
          subject: ["Subject is required"],
          priority: ["Invalid priority value"],
        },
      };

      const parsed = repository.parseApiError(validationError);
      
      expect(parsed.fieldErrors).toBeDefined();
      expect(parsed.fieldErrors?.subject).toEqual(["Subject is required"]);
    });

    test("sanitizes error messages to prevent information leakage", () => {
      const unsafeError = {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Database connection failed: postgresql://user:pass@localhost/db",
        correlationId: "CORR-12345-ABCDEF",
      };

      const parsed = repository.parseApiError(unsafeError);
      
      expect(parsed.message).not.toContain("postgresql://");
      expect(parsed.message).not.toContain("user:pass");
    });
  });

  describe("targeted invalidation", () => {
    test("invalidates specific query keys after mutations", () => {
      const queryClient = {
        invalidateQueries: vi.fn(),
      };

      repository.invalidateSupportTicketList(queryClient);
      
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["phase6-communications", "support-tickets"],
      });
    });

    test("invalidates detail views when specific ticket is modified", () => {
      const queryClient = {
        invalidateQueries: vi.fn(),
      };

      repository.invalidateSupportTicketDetail(queryClient, "TKT-1001");
      
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["phase6-communications", "support-tickets", "TKT-1001"],
      });
    });
  });

  describe("no direct fixture access", () => {
    test("does not expose fixture data directly", () => {
      // Repository should not have direct access to fixtures
      expect(repository).not.toHaveProperty("fixtures");
      expect(repository).not.toHaveProperty("mockData");
    });

    test("fetches data through API client only", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      await repository.getSupportTickets({ page: 1, pageSize: "25" });
      
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/admin/support/tickets"),
        expect.any(Object)
      );

      fetchSpy.mockRestore();
    });
  });

  describe("API request construction", () => {
    test("constructs GET requests with correct headers", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      await repository.getSupportTickets({ page: 1, pageSize: "25" });
      
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/support/tickets?limit=25",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );

      fetchSpy.mockRestore();
    });

    test("constructs POST requests with proper body", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      await repository.actOnSupportTicket("TKT-1001", {
        action: "assign",
        expectedVersion: 1,
        reason: "Assign for investigation",
        assignTo: "AGENT-001",
      });
      
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/support/tickets/TKT-1001/actions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
          body: expect.stringContaining("assigneeId"),
        })
      );
      expect(fetchSpy.mock.calls[0]?.[1]?.body).not.toContain("assignTo");

      fetchSpy.mockRestore();
    });

    test("maps cursor pages to the existing admin view contract", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [{ id: "7dd79c4b-79a0-4a5c-9f07-eb5370eeb26f", subject: "Card issue", status: "open", priority: "normal", version: 2, lastMessageAt: "2026-09-05T08:00:00Z" }],
          nextCursor: "opaque",
          hasMore: true,
        }),
      } as Response);

      const result = await repository.getSupportTickets({ page: 1, pageSize: "25" });

      expect(result.tickets[0]).toMatchObject({ title: "Card issue", state: "open", revision: 2 });
      expect(result.pagination).toMatchObject({ pageSize: 25, totalPages: 2 });
      expect(JSON.stringify(result)).not.toContain("nextCursor");
    });

    test("uses real detail routes and bounded audience grammar", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ id: "7dd79c4b-79a0-4a5c-9f07-eb5370eeb26f", subject: "Idea", body: "Details", state: "new", version: 1, createdAt: "2026-09-05T08:00:00Z", updatedAt: "2026-09-05T08:00:00Z", eligible: 7, optedOut: 2 }),
      } as Response);

      await repository.getFeedbackDetail("7dd79c4b-79a0-4a5c-9f07-eb5370eeb26f");
      await repository.getContentItem("faqs", "1f888fbd-13fe-4d9b-91a8-38356a9a5380");
      const preview = await repository.previewAudience({ platform: "ios", locale: "ar" });

      expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/v1/admin/feedback/7dd79c4b-79a0-4a5c-9f07-eb5370eeb26f");
      expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/v1/admin/content/1f888fbd-13fe-4d9b-91a8-38356a9a5380");
      expect(fetchSpy.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ platforms: ["ios"], locales: ["ar"], activity: "all", segmentKeys: [] }));
      expect(preview).toMatchObject({ eligibleCount: 7, optedOutCount: 2, denominator: "eligible-audience" });
    });

    test("retires a support category only through the versioned replacement contract", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ resourceId: "10000000-0000-4000-8000-000000000001", outcome: "success" }),
      } as Response);

      await repository.actOnSupportCategory("10000000-0000-4000-8000-000000000001", {
        action: "retire",
        expectedVersion: 2,
        reason: "Replaced by the account category",
        replacementCategoryId: "20000000-0000-4000-8000-000000000002",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/admin/support/categories/10000000-0000-4000-8000-000000000001/actions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "retire", expectedVersion: 2, reason: "Replaced by the account category", replacementCategoryId: "20000000-0000-4000-8000-000000000002" }),
        }),
      );
    });
  });
});
