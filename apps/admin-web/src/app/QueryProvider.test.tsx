import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { setSimulatedRole } from "@/core/auth/use-simulated-role";
import { QueryProvider } from "./QueryProvider";

const protectedKey = ["phase7-security", "super-admin", "audit", "AUD-1001"] as const;

function Probe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();

  useEffect(() => {
    client.setQueryData(protectedKey, { actor: "ADM-DEMO-SUPER", target: "AUD-1001" });
    onClient(client);
  }, [client, onClient]);

  return null;
}

describe("QueryProvider role-change cache boundary", () => {
  afterEach(() => window.sessionStorage.clear());

  test("keeps active query data when the simulated role is selected again", async () => {
    const element = document.createElement("div");
    const root = createRoot(element);
    let client: QueryClient | undefined;

    await act(async () => {
      root.render(<QueryProvider><Probe onClient={(value) => { client = value; }} /></QueryProvider>);
    });

    await act(async () => {
      setSimulatedRole("super-admin");
    });

    expect(client?.getQueryData(protectedKey)).toEqual({ actor: "ADM-DEMO-SUPER", target: "AUD-1001" });

    await act(async () => {
      root.unmount();
    });
  });

  test("removes protected Phase 7 query data when the simulated role changes", async () => {
    const element = document.createElement("div");
    const root = createRoot(element);
    let client: QueryClient | undefined;

    await act(async () => {
      root.render(<QueryProvider><Probe onClient={(value) => { client = value; }} /></QueryProvider>);
    });

    expect(client?.getQueryData(protectedKey)).toEqual({ actor: "ADM-DEMO-SUPER", target: "AUD-1001" });

    await act(async () => {
      setSimulatedRole("support-agent");
    });

    expect(client?.getQueryData(protectedKey)).toBeUndefined();
    expect(window.sessionStorage.getItem("admin-simulated-role")).toBe("support-agent");

    await act(async () => {
      root.unmount();
    });
  });
});
