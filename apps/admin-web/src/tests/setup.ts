import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import {
  configureApiActorProvider,
  configureApiTokenProvider,
} from "@/core/api/client";
import { mockServer } from "@/mocks/server";
import { resetCommunicationsMockState } from "@/mocks/handlers/communications";
import { resetPhase2MockState } from "@/mocks/phase2-state";
import { resetPhase5AiState } from "@/mocks/phase5-ai-state";
import { resetState as resetPhase6CommunicationsState } from "@/mocks/phase6-communications-state";
import { resetPhase7SecurityState } from "@/mocks/phase7-security-state";
import { resetPhase8SystemHealthState } from "@/mocks/phase8-system-health-state";
import { resetPhase9GovernanceState } from "@/mocks/phase9-governance-state";

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  configureApiTokenProvider(async () => "test-clerk-session");
  configureApiActorProvider(() => "test-admin-actor");
});

afterEach(() => {
  mockServer.resetHandlers();
  resetPhase2MockState();
  resetPhase5AiState();
  resetCommunicationsMockState();
  resetPhase6CommunicationsState();
  resetPhase7SecurityState();
  resetPhase8SystemHealthState();
  resetPhase9GovernanceState();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterAll(() => {
  mockServer.close();
});
