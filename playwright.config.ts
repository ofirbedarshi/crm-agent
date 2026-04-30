import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: {
    timeout: 20_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true
  },
  webServer: [
    {
      command: "npm run server:dev",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: "npm --prefix client run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
