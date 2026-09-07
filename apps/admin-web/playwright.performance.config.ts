import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  ...baseConfig,
  grep: /reference shell and local interactions meet Phase 0 responsiveness gates/,
  grepInvert: undefined,
  projects: baseConfig.projects?.filter(({ name }) => name === "desktop-1440"),
  webServer: {
    command: "npx next start -p 3100",
    url: `${baseURL}/admin`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
