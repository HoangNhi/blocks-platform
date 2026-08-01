import { test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("Get tradelabservice console logs from Aspire dashboard", async ({ page }) => {
  await page.goto("https://localhost:17073/login?t=75353f6a5b767b8e22e672925ba80a81", { waitUntil: "networkidle" });
  console.log("Logged in, going to console logs...");
  await page.goto("https://localhost:17073/consolelogs", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  
  // Select resource dropdown if needed, or just dump the visible log text
  const logs = await page.evaluate(() => {
    return document.body.innerText;
  });
  console.log("--- CONSOLE LOGS ---");
  console.log(logs.slice(0, 5000));
  console.log("--------------------");
});
