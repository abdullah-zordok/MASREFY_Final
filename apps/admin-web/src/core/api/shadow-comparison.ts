export type ShadowDifferenceCode =
  "COUNT_MISMATCH" | "HASH_MISMATCH" | "FINANCIAL_MISMATCH" | "NOT_COMPARABLE";

export interface ShadowComparisonInput {
  operationId: string;
  contractVersion: string;
  clientVersion: string;
  cohort: string;
  baseline: readonly unknown[];
  live: readonly unknown[];
  financialDifferenceMinor?: number;
  comparable?: boolean;
  durationMs: number;
  observedAt: string;
}

export interface ShadowComparisonResult {
  operationId: string;
  contractVersion: string;
  clientVersion: string;
  cohort: string;
  baselineCount: number;
  liveCount: number;
  baselineHash: string;
  liveHash: string;
  differenceCodes: ShadowDifferenceCode[];
  financialDifferenceMinor?: number;
  durationMs: number;
  observedAt: string;
  outcome: "match" | "blocked" | "not-comparable";
}

const maxRecords = 10_000;
const maxCanonicalCharacters = 262_144;
const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validate(input: ShadowComparisonInput): void {
  for (const value of [
    input.operationId,
    input.contractVersion,
    input.clientVersion,
    input.cohort,
  ]) {
    if (!safeIdentifier.test(value))
      throw new Error("invalid shadow identifier");
  }
  if (input.baseline.length > maxRecords || input.live.length > maxRecords)
    throw new Error("shadow payload exceeds record limit");
  if (
    !Number.isInteger(input.durationMs) ||
    input.durationMs < 0 ||
    input.durationMs > 600_000
  )
    throw new Error("invalid shadow duration");
  if (Number.isNaN(Date.parse(input.observedAt)))
    throw new Error("invalid shadow timestamp");
  if (
    input.financialDifferenceMinor !== undefined &&
    !Number.isSafeInteger(input.financialDifferenceMinor)
  )
    throw new Error("invalid financial difference");
}

function canonical(value: unknown): string {
  const serialized = JSON.stringify(normalize(value));
  if (serialized.length > maxCanonicalCharacters)
    throw new Error("shadow payload exceeds size limit");
  return serialized;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("shadow payload must be JSON-safe");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  throw new Error("shadow payload must be JSON-safe");
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function compareShadow(
  input: ShadowComparisonInput,
): Promise<ShadowComparisonResult> {
  validate(input);
  const baseline = canonical(input.baseline);
  const live = canonical(input.live);
  const [baselineHash, liveHash] = await Promise.all([
    sha256(baseline),
    sha256(live),
  ]);
  const differenceCodes: ShadowDifferenceCode[] = [];
  if (input.comparable === false) differenceCodes.push("NOT_COMPARABLE");
  else {
    if (input.baseline.length !== input.live.length)
      differenceCodes.push("COUNT_MISMATCH");
    if (baselineHash !== liveHash) differenceCodes.push("HASH_MISMATCH");
    if (
      input.financialDifferenceMinor !== undefined &&
      input.financialDifferenceMinor !== 0
    )
      differenceCodes.push("FINANCIAL_MISMATCH");
  }

  return {
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    clientVersion: input.clientVersion,
    cohort: input.cohort,
    baselineCount: input.baseline.length,
    liveCount: input.live.length,
    baselineHash,
    liveHash,
    differenceCodes,
    ...(input.financialDifferenceMinor === undefined
      ? {}
      : { financialDifferenceMinor: input.financialDifferenceMinor }),
    durationMs: input.durationMs,
    observedAt: input.observedAt,
    outcome:
      input.comparable === false
        ? "not-comparable"
        : differenceCodes.length === 0
          ? "match"
          : "blocked",
  };
}
