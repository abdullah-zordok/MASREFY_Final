import { describe, expect, test, beforeEach } from "vitest";
import {
  phase4ImportState,
  resetPhase4State,
  checkStateConflict,
  incrementRevision,
} from "./phase4-import-state";
import { phase4Records } from "@/mocks/fixtures/imports";

describe("Spec 005 Phase 4 import state", () => {
  beforeEach(() => {
    resetPhase4State();
  });

  describe("immutable snapshots", () => {
    test("snapshot is initially empty", () => {
      const snapshot = phase4ImportState.getSnapshot();
      expect(snapshot.importSessions.size).toBe(0);
      expect(snapshot.failedImports.size).toBe(0);
      expect(snapshot.auditEvents.length).toBe(0);
    });

    test("setting session state creates new snapshot reference", () => {
      const snapshot1 = phase4ImportState.getSnapshot();

      phase4ImportState.setImportSession("IMP-001", {
        state: "received",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      const snapshot2 = phase4ImportState.getSnapshot();

      expect(snapshot1).not.toBe(snapshot2);
      expect(snapshot2.importSessions.size).toBe(1);
    });

    test("getting session returns undefined for non-existent IDs", () => {
      expect(phase4ImportState.getImportSession("IMP-999")).toBeUndefined();
    });
  });

  describe("expected-state/revision conflicts", () => {
    test("detects state mismatch", () => {
      const result = checkStateConflict("failed", "succeeded", 1, 1);
      expect(result.conflict).toBe(true);
      expect(result.reason).toBe(
        "state_mismatch: expected succeeded, got failed",
      );
    });

    test("detects revision mismatch", () => {
      const result = checkStateConflict("succeeded", "succeeded", 1, 2);
      expect(result.conflict).toBe(true);
      expect(result.reason).toBe("revision_mismatch: expected 2, got 1");
    });

    test("passes when state and revision match", () => {
      const result = checkStateConflict("succeeded", "succeeded", 1, 1);
      expect(result.conflict).toBe(false);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("pending locks", () => {
    test("acquires lock when no lock exists", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      const acquired = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "retry-handoff",
      );
      expect(acquired).toBe(true);
      expect(
        phase4ImportState.hasImportSessionPendingLock(
          "IMP-001",
          "retry-handoff",
        ),
      ).toBe(true);
    });

    test("rejects duplicate lock acquisition", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      phase4ImportState.acquireImportSessionLock("IMP-001", "retry-handoff");
      const duplicate = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "retry-handoff",
      );

      expect(duplicate).toBe(false);
    });

    test("allows different lock keys on same session", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      const lock1 = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "lock1",
      );
      const lock2 = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "lock2",
      );

      expect(lock1).toBe(true);
      expect(lock2).toBe(true);
    });

    test("releases lock and allows re-acquisition", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      phase4ImportState.acquireImportSessionLock("IMP-001", "retry-handoff");
      phase4ImportState.releaseImportSessionLock("IMP-001", "retry-handoff");

      expect(
        phase4ImportState.hasImportSessionPendingLock(
          "IMP-001",
          "retry-handoff",
        ),
      ).toBe(false);

      const reacquired = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "retry-handoff",
      );
      expect(reacquired).toBe(true);
    });

    test("handles lock operations on non-existent sessions gracefully", () => {
      expect(
        phase4ImportState.hasImportSessionPendingLock("IMP-999", "lock"),
      ).toBe(false);
      expect(
        phase4ImportState.acquireImportSessionLock("IMP-999", "lock"),
      ).toBe(false);
      expect(() =>
        phase4ImportState.releaseImportSessionLock("IMP-999", "lock"),
      ).not.toThrow();
    });
  });

  describe("duplicate submission prevention", () => {
    test("locks prevent duplicate actions", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      const first = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "retry",
      );
      const second = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "retry",
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    test("different actions can proceed in parallel", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      const lock1 = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "action1",
      );
      const lock2 = phase4ImportState.acquireImportSessionLock(
        "IMP-001",
        "action2",
      );

      expect(lock1).toBe(true);
      expect(lock2).toBe(true);
    });
  });

  describe("reset behavior", () => {
    test("reset clears all state", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "failed",
        revision: 1,
        pendingLocks: new Set(["lock"]),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      phase4ImportState.setFailedImport("IFL-001", {
        state: "failed",
        revision: 1,
        resolution: null,
        pendingLocks: new Set(),
      });

      phase4ImportState.recordAuditEvent({
        eventName: "test.event",
        actor: "test-actor",
        scope: "test-scope",
      });

      expect(
        phase4ImportState.getSnapshot().importSessions.size,
      ).toBeGreaterThan(0);
      expect(
        phase4ImportState.getSnapshot().auditEvents.length,
      ).toBeGreaterThan(0);

      resetPhase4State();

      const snapshot = phase4ImportState.getSnapshot();
      expect(snapshot.importSessions.size).toBe(0);
      expect(snapshot.failedImports.size).toBe(0);
      expect(snapshot.auditEvents.length).toBe(0);
    });

    test("reset does not affect singleton instance", () => {
      const state1 = phase4ImportState;
      resetPhase4State();
      const state2 = phase4ImportState;

      expect(state1).toBe(state2);
    });
  });

  describe("revision increment", () => {
    test("increments revision by 1", () => {
      expect(incrementRevision(0)).toBe(1);
      expect(incrementRevision(1)).toBe(2);
      expect(incrementRevision(99)).toBe(100);
    });
  });

  describe("audit event recording", () => {
    test("records audit events with deterministic IDs", () => {
      const eventId1 = phase4ImportState.recordAuditEvent({
        eventName: "test.event",
        actor: "test-actor",
        scope: "test-scope",
      });

      const eventId2 = phase4ImportState.recordAuditEvent({
        eventName: "test.event",
        actor: "test-actor",
        scope: "test-scope",
      });

      expect(eventId1).not.toBe(eventId2);
      expect(eventId1).toMatch(/^AUD-FIXED-\d{6}$/);
      expect(eventId2).toMatch(/^AUD-FIXED-\d{6}$/);
    });

    test("audit events use deterministic timestamps", () => {
      phase4ImportState.recordAuditEvent({
        eventName: "test.event",
        actor: "test-actor",
        scope: "test-scope",
      });

      const events = phase4ImportState.getAuditEvents();
      expect(events[0].timestamp).toBe("2026-07-29T10:00:00.000Z");
    });

    test("getAuditEvents returns readonly array", () => {
      phase4ImportState.recordAuditEvent({
        eventName: "test.event",
        actor: "test-actor",
        scope: "test-scope",
      });

      const events1 = phase4ImportState.getAuditEvents();
      // @ts-expect-error - Testing readonly behavior
      events1.push({
        eventId: "MANUAL-EVENT",
        eventName: "manual",
        timestamp: "2026-07-29T10:00:00.000Z",
        actor: "manual",
        scope: "manual",
      });

      const events2 = phase4ImportState.getAuditEvents();
      expect(events2.length).toBe(1);
      expect(events2[0].eventId).not.toBe("MANUAL-EVENT");
    });
  });

  describe("scenario control", () => {
    test("sets and gets scenario", () => {
      phase4ImportState.setScenario("test-scenario");
      expect(phase4ImportState.getScenario()).toBe("test-scenario");
    });

    test("default scenario is 'default'", () => {
      phase4ImportState.setScenario("test-scenario");
      resetPhase4State();
      expect(phase4ImportState.getScenario()).toBe("default");
    });
  });

  describe("all entity types", () => {
    test("supports all import-related entity types", () => {
      phase4ImportState.setImportSession("IMP-001", {
        state: "received",
        revision: 1,
        pendingLocks: new Set(),
        lastModified: "2026-07-29T10:00:00.000Z",
      });

      phase4ImportState.setFailedImport("IFL-001", {
        state: "failed",
        revision: 1,
        resolution: null,
        pendingLocks: new Set(),
      });

      phase4ImportState.setLowConfidenceItem("LCI-001", {
        state: "pending",
        revision: 1,
        pendingLocks: new Set(),
      });

      phase4ImportState.setDuplicateCandidate("DUP-001", {
        state: "pending",
        revision: 1,
        pendingLocks: new Set(),
      });

      phase4ImportState.setUnsupportedFormat("FMT-001", {
        state: "detected",
        revision: 1,
        pendingLocks: new Set(),
      });

      const snapshot = phase4ImportState.getSnapshot();
      expect(snapshot.importSessions.size).toBe(1);
      expect(snapshot.failedImports.size).toBe(1);
      expect(snapshot.lowConfidenceItems.size).toBe(1);
      expect(snapshot.duplicateCandidates.size).toBe(1);
      expect(snapshot.unsupportedFormats.size).toBe(1);
    });
  });

  describe("parser version lifecycle", () => {
    test("blocks release until required tests pass", () => {
      const draft = phase4Records.versions[0];
      expect(() =>
        phase4ImportState.transitionRecord(draft, {
          action: "release",
          expectedState: "draft",
          expectedRevision: 1,
          reason: "محاولة إصدار",
        }),
      ).toThrow("required_tests_failed");
    });

    test("moves draft through testing to active after required tests pass", () => {
      const draft = phase4Records.versions[0];
      const testing = phase4ImportState.transitionRecord(draft, {
        action: "test",
        expectedState: "draft",
        expectedRevision: 1,
        reason: "تشغيل الاختبارات المطلوبة",
      });
      expect(testing.currentState).toBe("testing");

      const active = phase4ImportState.transitionRecord(draft, {
        action: "release",
        expectedState: "testing",
        expectedRevision: 2,
        reason: "إصدار بعد نجاح الاختبارات",
      });
      expect(active.currentState).toBe("active");
    });

    test("rollback creates a new draft without changing historical version", () => {
      const activeVersion = phase4Records.versions[1];
      const rollback = phase4ImportState.transitionRecord(activeVersion, {
        action: "rollback",
        expectedState: "active",
        expectedRevision: 1,
        reason: "إنشاء مسودة من إصدار تاريخي",
      });

      expect(rollback.currentState).toBe("active");
      expect(rollback.createdDraftId).toMatch(/^PV-RB-/);
      expect(phase4ImportState.applyRuntimeState(activeVersion).status).toBe(
        "active",
      );
    });
  });
});
