import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  grep: /reference shell and local interactions meet Phase 0 responsiveness gates/,
  grepInvert: undefined,
  projects: baseConfig.projects?.filter(({ name }) => name === "desktop-1440"),
});
