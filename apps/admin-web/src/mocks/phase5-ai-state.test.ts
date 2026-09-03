import { describe, expect, test } from "vitest";
import {
  phase5Conflict,
  phase5Snapshot,
  resetPhase5AiState,
  safeAuditReference,
  applyProviderAction,
  applyAiRecordAction,
  phase5Record,
  phase5RollbackDraftIds,
} from "./phase5-ai-state";

describe("Spec 006 Phase 5 runtime state", () => {
  test("resets to immutable snapshots and increments audit references", () => {
    resetPhase5AiState();
    const before = phase5Snapshot();
    before.auditSequence = 99;

    expect(phase5Snapshot().auditSequence).toBe(1);
    expect(safeAuditReference("admin.ai.test").eventId).toBe("AIA-0001");
    expect(safeAuditReference("admin.ai.test").eventId).toBe("AIA-0002");
  });

  test("detects stale expected state or revision conflicts", () => {
    expect(phase5Conflict("active", 2, "active", 2)).toBeNull();
    expect(phase5Conflict("active", 2, "inactive", 2)).toMatchObject({ code: "conflict" });
    expect(phase5Conflict("active", 2, "active", 1)).toMatchObject({ code: "conflict" });
  });

  test("rejects stale provider actions and invalid fallback coverage", () => {
    resetPhase5AiState();
    expect(applyProviderAction("AIP-OPENAI", {
      action: "update_fallback",
      context: {
        reason: "valid operational update",
        expectedState: "healthy",
        expectedRevision: 1,
      },
      fallbackRoutes: [],
    })).toMatchObject({ outcome: "rejected" });

    expect(applyProviderAction("AIP-OPENAI", {
      action: "activate",
      context: {
        reason: "stale",
        expectedState: "unavailable",
        expectedRevision: 99,
      },
    })).toMatchObject({ outcome: "conflict" });
  });

  test("mutates operational records deterministically and resets them", () => {
    resetPhase5AiState();
    expect(applyAiRecordAction("AIF-0001", {
      action: "acknowledge",
      context: {
        reason: "triage decision",
        expectedState: "open",
        expectedRevision: 1,
      },
    })).toMatchObject({ outcome: "success", previousState: "open", currentState: "acknowledged" });
    expect(phase5Record("AIF-0001")).toEqual({ status: "acknowledged", revision: 2 });
    expect(() => applyAiRecordAction("AIF-0001", {
      action: "resolve",
      context: {
        reason: "stale decision",
        expectedState: "open",
        expectedRevision: 1,
      },
    })).toThrowError(expect.objectContaining({ code: "conflict" }));
    resetPhase5AiState();
    expect(phase5Record("AIF-0001")).toEqual({ status: "open", revision: 1 });
  });

  test("rollback creates a new draft without changing historical prompt state", () => {
    resetPhase5AiState();
    const result = applyAiRecordAction("AIPR-RECEIPT-AR-V3", {
      action: "rollback",
      context: {
        reason: "restore historical behavior as a new draft",
        expectedState: "active",
        expectedRevision: 3,
      },
    });
    expect(result).toMatchObject({ affectedId: "AIPR-ROLLBACK-0001", currentState: "draft" });
    expect(phase5Record("AIPR-RECEIPT-AR-V3")).toEqual({ status: "active", revision: 3 });
    expect(phase5Record("AIPR-ROLLBACK-0001")).toEqual({ status: "draft", revision: 1 });
    expect(phase5RollbackDraftIds()).toEqual(["AIPR-ROLLBACK-0001"]);
  });
});
