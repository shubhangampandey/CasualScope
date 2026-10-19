import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5180",
    browserName: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
