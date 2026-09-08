type ServerEnvironment = Record<string, string | undefined>;

const clerkSecretPattern = /^sk_live_[A-Za-z0-9_-]{10,}$/;

export function validateAdminServerRuntime(
  environment: ServerEnvironment = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;
  if (!clerkSecretPattern.test(environment.CLERK_SECRET_KEY ?? ""))
    throw new Error("production requires a valid Clerk secret");
}
