import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  forbidOnly: true,
  fullyParallel: false,
  reporter: "list",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "vite tests/fixtures --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/form-simple.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
