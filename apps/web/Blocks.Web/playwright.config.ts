import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./smoke",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  expect: {
    timeout: 15_000,
  },
  use: {
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
