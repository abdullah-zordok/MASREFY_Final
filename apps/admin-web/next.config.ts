import type { NextConfig } from "next";
import { resolveAdminRuntime } from "./src/core/config/runtime";
import { validateAdminServerRuntime } from "./src/core/config/server-runtime";

resolveAdminRuntime();
validateAdminServerRuntime();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
};

export default nextConfig;
