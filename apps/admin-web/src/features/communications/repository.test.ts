import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  configureApiActorProvider,
  configureApiTokenProvider,
} from "@/core/api/client";
import { CommunicationsRepository } from "./repository";

const id = (suffix: number) =>
  `11000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const at = "2026-09-10T08:00:00.000Z";
const response = (value: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  }) as Response;
const ticket = (suffix: number) => ({
  id: id(suffix),
  categoryId: id(90),
  subject: `Ticket ${suffix}`,
  status: "waiting_support",
  priority: "high",
  lastMessageAt: at,
  closedAt: null,
  version: suffix,
  createdAt: at,
});

describe("CommunicationsRepository", () => {
  let repository: CommunicationsRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    configureApiTokenProvider(async () => "admin-token");
    configureApiActorProvider(() => "admin-1");
    repository = new CommunicationsRepository();
  });

  test("keeps deterministic query keys, encoding, and targeted invalidation", () => {
    const params = {
      page: 1,
      pageSize: "25" as const,
      status: "open" as const,
    };
    expect(repository.getSupportTicketsQueryKey(params)).toEqual([
      "phase6-communications",
      "support-tickets",
      params,
    ]);
    expect(repository.encodeSearchParams({ search: "بحث & value=1" })).toBe(
      "search=%D8%A8%D8%AD%D8%AB+%26+value%3D1",
    );
    const client = { invalidateQueries: vi.fn() };
    repository.invalidateSupportTicketDetail(client, id(1));
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["phase6-communications", "support-tickets", id(1)],
    });
  });

  test("uses shared auth and rejects unknown response fields", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      response({
        items: [{ ...ticket(1), leakedInternalField: "no" }],
        nextCursor: null,
        hasMore: false,
      }),
    );
    await expect(
      repository.getSupportTickets({ page: 1, pageSize: "25" }),
    ).rejects.toMatchObject({ code: "contract_mismatch", status: 502 });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/support/tickets"),
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
        }),
      }),
    );
  });

  test.each([
    [401, "AUTH_TOKEN_INVALID", "session_expired"],
    [403, "FORBIDDEN", "forbidden"],
    [409, "VERSION_CONFLICT", "conflict"],
    [429, "RATE_LIMITED", "rate_limited"],
  ])("preserves %i/%s as %s", async (status, serverCode, clientCode) => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      response(
        { code: serverCode, message: "Safe", requestId: "request-1" },
        status,
      ),
    );
    await expect(
      repository.getSupportTickets({ page: 1, pageSize: "25" }),
    ).rejects.toMatchObject({ code: clientCode, status });
  });

  test("traverses every ticket cursor and computes exact local pagination", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const second = String(input).includes("cursor=tickets-2");
        return response({
          items: [ticket(second ? 2 : 1)],
          nextCursor: second ? null : "tickets-2",
          hasMore: !second,
        });
      });
    const page = await repository.getSupportTickets({
      page: 1,
      pageSize: "25",
    });
    expect(page.tickets.map((item) => item.id)).toEqual([id(1), id(2)]);
    expect(page.pagination).toEqual({
      page: 1,
      pageSize: 25,
      totalItems: 2,
      totalPages: 1,
    });
    expect(page.tickets[0]).toMatchObject({
      title: "Ticket 1",
      state: "waiting_support",
      revision: 1,
      platform: "unknown",
      locale: "unknown",
    });
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        String(url).includes("cursor=tickets-2"),
      ),
    ).toBe(true);
  });

  test("keeps UI pagination local and sends only supported server filters", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response({ items: [], nextCursor: null, hasMore: false }),
      );
    await repository.getFeedback({
      page: 2,
      pageSize: 25,
      search: "missing receipt",
      status: "new",
    });
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain("query=missing+receipt");
    expect(url).toContain("status=new");
    expect(url).not.toContain("page=");
    expect(url).not.toContain("pageSize=");
    expect(url).not.toContain("search=");
  });

  test("traverses complete ticket history and preserves bodies, notes, and attachments", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const second = String(input).includes("cursor=messages-2");
        return response({
          ...ticket(1),
          messages: [
            {
              id: id(second ? 12 : 11),
              senderType: second ? "admin" : "customer",
              body: second ? "Support reply" : "Customer body",
              attachments: second
                ? []
                : [
                    {
                      id: id(20),
                      filename: "receipt.png",
                      contentType: "image/png",
                      sizeBytes: 2048,
                      status: "clean",
                    },
                  ],
              createdAt: at,
            },
          ],
          nextCursor: second ? null : "messages-2",
          hasMore: !second,
          internalNotes: [
            { id: id(30), body: "Internal review", createdAt: at },
          ],
        });
      });
    const detail = await repository.getSupportTicket(id(1));
    expect(detail).toMatchObject({
      body: "Customer body",
      revision: 1,
      notes: ["Internal review"],
      attachments: [{ id: id(20), filename: "receipt.png", status: "clean" }],
      messages: [
        { id: id(11), body: "Customer body" },
        { id: id(12), body: "Support reply" },
      ],
      internalNotes: [{ id: id(30), body: "Internal review" }],
    });
    expect(
      fetchSpy.mock.calls.some(([url]) =>
        String(url).includes("cursor=messages-2"),
      ),
    ).toBe(true);
  });

  test("sends exact versions and reasons and accepts only exact action results", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response({
          resourceId: id(1),
          outcome: "success",
          currentState: "waiting_support",
          version: 2,
          requestId: "request-2",
        }),
      );
    await expect(
      repository.actOnSupportTicket(id(1), {
        action: "assign",
        expectedVersion: 1,
        reason: "Assign for investigation",
        assignTo: "admin-2",
      }),
    ).resolves.toEqual({
      resourceId: id(1),
      outcome: "success",
      currentState: "waiting_support",
      version: 2,
      requestId: "request-2",
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      action: "assign",
      expectedVersion: 1,
      reason: "Assign for investigation",
      assigneeId: "admin-2",
    });
  });

  test("decodes categories, templates, and campaigns without fabricated totals", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: id(40),
              key: "card",
              name: "Card",
              sortOrder: 1,
              active: true,
              version: 3,
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: id(41),
              state: "published",
              version: 4,
              updatedAt: at,
              safe: {
                key: "transaction.created",
                locale: "en",
                channel: "push",
                templateVersion: 4,
                subject: null,
                body: "Body",
              },
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: id(42),
              state: "draft",
              version: 2,
              updatedAt: at,
              safe: {
                name: "September campaign",
                templateId: id(41),
                scheduledAt: null,
                createdBy: "admin-1",
                approvedBy: null,
              },
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      );
    const categories = await repository.getSupportCategories({});
    const templates = await repository.getTemplates({});
    const campaigns = await repository.getCampaigns({});
    expect(categories).toMatchObject({
      pagination: { totalItems: 1 },
      items: [{ title: "Card", revision: 3 }],
    });
    expect(templates).toMatchObject({
      pagination: { totalItems: 1 },
      items: [{ title: "transaction.created", locale: "en", revision: 4 }],
    });
    expect(campaigns).toMatchObject({
      pagination: { totalItems: 1 },
      items: [{ title: "September campaign", revision: 2 }],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("preserves exact audience preview identity, expiry, and counts", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response({
          previewId: id(50),
          audienceVersion: "audience-v7",
          eligible: 7,
          excluded: 3,
          optedOut: 2,
          expiresAt: "2026-09-10T08:10:00.000Z",
        }),
      );
    await expect(
      repository.previewAudience({ platform: "ios", locale: "ar" }),
    ).resolves.toEqual({
      previewId: id(50),
      audienceVersion: "audience-v7",
      eligibleCount: 7,
      excludedCount: 3,
      optedOutCount: 2,
      expiresAt: "2026-09-10T08:10:00.000Z",
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      platforms: ["ios"],
      locales: ["ar"],
      activity: "all",
      segmentKeys: [],
    });
  });
});
