import { describe, expect, it } from "vitest";
import { compareShadow } from "./shadow-comparison";

const metadata = {
  operationId: "admin.users.list",
  contractVersion: "be004-v1",
  clientVersion: "admin-v1",
  cohort: "internal",
  durationMs: 12,
  observedAt: "2026-09-08T00:00:00.000Z",
};

describe("Admin redacted shadow comparison", () => {
  it("produces stable hashes and counts without retaining source content", async () => {
    const baseline = [
      { id: "account-private", amountMinor: 1250, label: "Secret Salary" },
    ];
    const live = [
      { label: "Secret Salary", amountMinor: 1250, id: "account-private" },
    ];

    const result = await compareShadow({
      ...metadata,
      baseline,
      live,
      financialDifferenceMinor: 0,
    });

    expect(result).toMatchObject({
      operationId: metadata.operationId,
      contractVersion: metadata.contractVersion,
      clientVersion: metadata.clientVersion,
      cohort: metadata.cohort,
      baselineCount: 1,
      liveCount: 1,
      differenceCodes: [],
      financialDifferenceMinor: 0,
      outcome: "match",
    });
    expect(result.baselineHash).toHaveLength(64);
    expect(result.liveHash).toBe(result.baselineHash);
    expect(JSON.stringify(result)).not.toMatch(
      /account-private|Secret Salary|1250/,
    );
  });

  it("blocks structural and financial differences with allowlisted codes", async () => {
    const result = await compareShadow({
      ...metadata,
      baseline: [{ amountMinor: 100 }],
      live: [{ amountMinor: 101 }, { amountMinor: 0 }],
      financialDifferenceMinor: 1,
    });

    expect(result.outcome).toBe("blocked");
    expect(result.differenceCodes).toEqual([
      "COUNT_MISMATCH",
      "HASH_MISMATCH",
      "FINANCIAL_MISMATCH",
    ]);
  });

  it("bounds comparison inputs and emitted timing", async () => {
    await expect(
      compareShadow({
        ...metadata,
        baseline: Array.from({ length: 10_001 }, () => null),
        live: [],
      }),
    ).rejects.toThrow("shadow payload exceeds record limit");
    await expect(
      compareShadow({
        ...metadata,
        durationMs: 600_001,
        baseline: [],
        live: [],
      }),
    ).rejects.toThrow("invalid shadow duration");
  });

  it("records an explicit not-comparable outcome", async () => {
    await expect(
      compareShadow({ ...metadata, comparable: false, baseline: [], live: [] }),
    ).resolves.toMatchObject({
      outcome: "not-comparable",
      differenceCodes: ["NOT_COMPARABLE"],
    });
  });
});
