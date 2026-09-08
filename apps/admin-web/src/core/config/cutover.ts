export type CutoverClient = "mobile" | "admin";
export type CutoverStage = "shadow" | "internal" | "bounded-write" | "full";

export interface CutoverPolicy {
  schemaVersion: 1;
  configVersion: string;
  client: CutoverClient;
  mode: "live";
  wave: number;
  stage: CutoverStage;
  cohort: string;
  cohortSource: "server";
  acceptedVersion: string;
  rollbackVersion: string;
  billingAvailable: false;
}

const stages: readonly CutoverStage[] = [
  "shadow",
  "internal",
  "bounded-write",
  "full",
];
const safeVersion = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const safeCohort = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function createInitialCutoverPolicy(
  client: CutoverClient,
  acceptedVersion: string,
): CutoverPolicy {
  if (!safeVersion.test(acceptedVersion))
    throw new Error("invalid cutover version");
  return {
    schemaVersion: 1,
    configVersion: `${client}-wave-0-full-${acceptedVersion}`,
    client,
    mode: "live",
    wave: 0,
    stage: "full",
    cohort: "all",
    cohortSource: "server",
    acceptedVersion,
    rollbackVersion: acceptedVersion,
    billingAvailable: false,
  };
}

export function advanceCutover(
  previous: CutoverPolicy,
  next: CutoverPolicy,
): CutoverPolicy {
  validatePolicy(next);
  if (next.client !== previous.client)
    throw new Error("invalid cutover client");

  const sameWave =
    next.wave === previous.wave &&
    stages.indexOf(next.stage) === stages.indexOf(previous.stage) + 1;
  const nextWave =
    next.wave === previous.wave + 1 &&
    previous.stage === "full" &&
    next.stage === "shadow";
  if (!sameWave && !nextWave) throw new Error("invalid cutover transition");

  const expectedRollback = nextWave
    ? previous.acceptedVersion
    : previous.rollbackVersion;
  if (
    next.rollbackVersion !== expectedRollback ||
    (next.stage !== "full" && next.acceptedVersion !== previous.acceptedVersion)
  )
    throw new Error("invalid cutover version");

  return { ...next };
}

function validatePolicy(policy: CutoverPolicy): void {
  if (
    policy.schemaVersion !== 1 ||
    policy.mode !== "live" ||
    policy.billingAvailable !== false ||
    !Number.isInteger(policy.wave) ||
    policy.wave < 0 ||
    policy.wave > 9
  )
    throw new Error("invalid cutover policy");
  if (policy.cohortSource !== "server" || !safeCohort.test(policy.cohort))
    throw new Error("cutover requires a server-derived cohort");
  if (
    !safeVersion.test(policy.configVersion) ||
    !safeVersion.test(policy.acceptedVersion) ||
    !safeVersion.test(policy.rollbackVersion)
  )
    throw new Error("invalid cutover version");
}
