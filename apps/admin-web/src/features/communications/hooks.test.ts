import { describe, expect, test } from "vitest";
import {
  communicationMutationInvalidations,
  communicationsQueryKeys,
  isEnabledId,
  ticketActionLockKey,
} from "./hooks";

describe("communications hook helpers", () => {
  test("builds deterministic query keys from validated resource parts", () => {
    const filters = { page: 1, pageSize: "25" as const, status: "open" as const };

    expect(communicationsQueryKeys.support.tickets(filters)).toEqual(
      communicationsQueryKeys.support.tickets({ page: 1, pageSize: "25", status: "open" }),
    );
    expect(communicationsQueryKeys.support.tickets(filters)).not.toEqual(
      communicationsQueryKeys.support.tickets({ page: 2, pageSize: "25", status: "open" }),
    );
  });

  test("keeps detail queries disabled until a safe ID exists", () => {
    expect(isEnabledId("", true)).toBe(false);
    expect(isEnabledId("   ", true)).toBe(false);
    expect(isEnabledId("TKT-1001-A", false)).toBe(false);
    expect(isEnabledId("TKT-1001-A", true)).toBe(true);
  });

  test("uses resource and action in mutation lock keys", () => {
    expect(ticketActionLockKey({ ticketId: "TKT-1001-A", action: { action: "assign", expectedVersion: 1, reason: "Assign for investigation" } })).toBe(
      "support-ticket:TKT-1001-A:assign",
    );
    expect(ticketActionLockKey({ ticketId: "TKT-1001-A", action: { action: "reply", expectedVersion: 1, reason: "Reply to customer" } })).not.toBe(
      ticketActionLockKey({ ticketId: "TKT-1002-A", action: { action: "reply", expectedVersion: 1, reason: "Reply to customer" } }),
    );
  });

  test("targets only affected support queries after a ticket mutation", () => {
    expect(communicationMutationInvalidations.supportTicket("TKT-1001-A")).toEqual([
      communicationsQueryKeys.support.all,
      communicationsQueryKeys.support.ticket("TKT-1001-A"),
    ]);
  });

  test("does not mutate rejected form input while building lock metadata", () => {
    const draftReply = { text: "Keep this text for retry", expectedVersion: 9 };

    ticketActionLockKey({
      ticketId: "TKT-1001-A",
      action: { action: "reply", expectedVersion: draftReply.expectedVersion, reason: "Reply to customer", message: draftReply.text },
    });

    expect(draftReply).toEqual({ text: "Keep this text for retry", expectedVersion: 9 });
  });
});
