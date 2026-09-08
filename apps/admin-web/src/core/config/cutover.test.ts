import { describe, expect, test } from "vitest";
import { advanceCutover, createInitialCutoverPolicy } from "./cutover";

const next = {
  schemaVersion: 1 as const,
  configVersion: "admin-wave-1-shadow-v1",
  client: "admin" as const,
  mode: "live" as const,
  wave: 1,
  stage: "shadow" as const,
  cohort: "internal-employees",
  cohortSource: "server" as const,
  acceptedVersion: "24d3cac",
  rollbackVersion: "24d3cac",
  billingAvailable: false as const,
};

describe("Admin cutover policy", () => {
  test("starts from the accepted documentation version with billing unavailable", () => {
    expect(createInitialCutoverPolicy("admin", "24d3cac")).toEqual({
      schemaVersion: 1,
      configVersion: "admin-wave-0-full-24d3cac",
      client: "admin",
      mode: "live",
      wave: 0,
      stage: "full",
      cohort: "all",
      cohortSource: "server",
      acceptedVersion: "24d3cac",
      rollbackVersion: "24d3cac",
      billingAvailable: false,
    });
  });

  test("accepts only ordered stages and waves", () => {
    const wave0 = createInitialCutoverPolicy("admin", "24d3cac");
    const shadow = advanceCutover(wave0, next);
    const internal = advanceCutover(shadow, {
      ...next,
      configVersion: "admin-wave-1-internal-v1",
      stage: "internal",
    });
    const bounded = advanceCutover(internal, {
      ...next,
      configVersion: "admin-wave-1-bounded-v1",
      stage: "bounded-write",
    });
    expect(
      advanceCutover(bounded, {
        ...next,
        configVersion: "admin-wave-1-full-v1",
        stage: "full",
        acceptedVersion: "admin-wave-1-v1",
      }).stage,
    ).toBe("full");
    expect(() => advanceCutover(wave0, { ...next, stage: "internal" })).toThrow(
      "invalid cutover transition",
    );
    expect(() => advanceCutover(wave0, { ...next, wave: 2 })).toThrow(
      "invalid cutover transition",
    );
  });

  test("requires a stable server-derived cohort and versioned rollback", () => {
    const wave0 = createInitialCutoverPolicy("admin", "24d3cac");
    expect(advanceCutover(wave0, next)).toEqual(
      advanceCutover(wave0, { ...next }),
    );
    expect(() =>
      advanceCutover(wave0, {
        ...next,
        cohortSource: "client" as "server",
      }),
    ).toThrow("server-derived cohort");
    expect(() =>
      advanceCutover(wave0, { ...next, rollbackVersion: "" }),
    ).toThrow("invalid cutover version");
  });

  test("retains and reselects the accepted rollback version after full cutover", () => {
    const wave0 = createInitialCutoverPolicy("admin", "24d3cac");
    const shadow = advanceCutover(wave0, next);
    const internal = advanceCutover(shadow, { ...next, configVersion: "admin-wave-1-internal-v1", stage: "internal" });
    const bounded = advanceCutover(internal, { ...next, configVersion: "admin-wave-1-bounded-v1", stage: "bounded-write" });
    const full = advanceCutover(bounded, {
      ...next,
      configVersion: "admin-wave-1-full-v1",
      stage: "full",
      acceptedVersion: "admin-wave-1-v1",
    });

    expect(full.rollbackVersion).toBe("24d3cac");
    expect(createInitialCutoverPolicy("admin", full.rollbackVersion).acceptedVersion).toBe("24d3cac");
  });
});
