export type ClientMode = "live" | "demo" | "test";

type RuntimeEnvironment = Record<string, string | undefined>;

export interface AdminRuntime {
  apiUrl: string | null;
  billingAvailable: false;
  clerkPublishableKey: string | null;
  mode: ClientMode;
}

const clientModes = new Set<ClientMode>(["live", "demo", "test"]);
const clerkKeyPattern = /^pk_(?:live|test)_[A-Za-z0-9_-]{10,}$/;
const publicSecretPattern = /^NEXT_PUBLIC_.*(?:API_KEY|SECRET|SERVICE_ROLE)/;
const clientAuthorityNames = new Set([
  "NEXT_PUBLIC_ADMIN_ROLE",
  "NEXT_PUBLIC_MOCK_SCENARIO",
]);

export function resolveAdminMode(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): ClientMode {
  const rawMode =
    environment.NEXT_PUBLIC_CLIENT_MODE ??
    (environment.NEXT_PUBLIC_ENABLE_MOCKS === "true"
      ? "demo"
      : nodeEnvironment === "test"
        ? "test"
        : "live");
  if (!clientModes.has(rawMode as ClientMode))
    throw new Error("invalid client mode");
  if (nodeEnvironment === "production" && rawMode !== "live")
    throw new Error("production requires live client mode");
  return rawMode as ClientMode;
}

export function resolveAdminRuntime(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): AdminRuntime {
  if (
    Object.entries(environment).some(
      ([name, value]) => value && publicSecretPattern.test(name),
    )
  )
    throw new Error("forbidden public secret variable");
  if (
    Object.entries(environment).some(
      ([name, value]) => value && clientAuthorityNames.has(name),
    )
  )
    throw new Error("client authority variable is forbidden");
  if (
    nodeEnvironment === "production" &&
    environment.NEXT_PUBLIC_ENABLE_MOCKS === "true"
  )
    throw new Error("production mocks are forbidden");

  const mode = resolveAdminMode(environment, nodeEnvironment);
  if (mode !== "live")
    return {
      apiUrl: null,
      billingAvailable: false,
      clerkPublishableKey: null,
      mode,
    };

  const apiUrl = validHttpsUrl(environment.NEXT_PUBLIC_API_URL);
  if (!apiUrl) throw new Error("live mode requires a valid HTTPS API URL");
  const clerkPublishableKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkPublishableKey || !clerkKeyPattern.test(clerkPublishableKey))
    throw new Error("live mode requires a valid Clerk publishable key");
  if (
    nodeEnvironment === "production" &&
    !clerkPublishableKey.startsWith("pk_live_")
  )
    throw new Error("production Clerk publishable key must use pk_live");

  return { apiUrl, billingAvailable: false, clerkPublishableKey, mode };
}

export function mocksAllowed(nodeEnvironment = process.env.NODE_ENV): boolean {
  return nodeEnvironment !== "production";
}

export function mocksEnabled(
  environment?: RuntimeEnvironment,
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  const enableMocks = environment
    ? environment.NEXT_PUBLIC_ENABLE_MOCKS
    : process.env.NEXT_PUBLIC_ENABLE_MOCKS;
  return (
    mocksAllowed(nodeEnvironment) &&
    (nodeEnvironment === "test" || enableMocks === "true") &&
    enableMocks !== "false"
  );
}

function validHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
      return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
