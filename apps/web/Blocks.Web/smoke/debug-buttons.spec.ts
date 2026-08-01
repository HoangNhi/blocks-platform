import { expect, test } from "@playwright/test";

const rawWebBaseUrl = process.env.WEB_BASE_URL?.trim() || "http://localhost:65252";
const rawApiBaseUrl = process.env.TRADELAB_API_BASE_URL?.trim() || "http://localhost:43100";
const username = "admin";
const password = "Abc@123";

test.use({ ignoreHTTPSErrors: true });

test("Debug strategy body text after selection", async ({ page }) => {
  console.log("Logging in via API...");
  const response = await page.request.post(`${rawApiBaseUrl}/api/system/Auth/login`, {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const session = {
    user: {
      id: payload.Data?.id || "smoke-user",
      username: username,
      fullname: username,
      roleId: "smoke-role",
      roleName: null,
      email: `${username}@example.test`,
      avatar: null,
    },
    tokens: {
      accessToken: payload.Data?.accessToken || payload.Data?.AccessToken,
      refreshToken: payload.Data?.refreshToken || payload.Data?.RefreshToken,
    },
  };
  await page.goto(rawWebBaseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate((serializedSession) => {
    window.localStorage.setItem("blocks.auth.session", serializedSession);
  }, JSON.stringify(session));
  
  await page.goto(`${rawWebBaseUrl}/plugins/tradelab`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  console.log("Selecting SMA 9/21 strategy...");
  const strategyButton = page.locator('button:has-text("TradeLab Baseline SMA 9/21")').last();
  const isStrategyVisible = await strategyButton.isVisible().catch(() => false);
  if (!isStrategyVisible) {
    const groupButton = page.locator('button:has-text("TradeLab Baseline")').first();
    await groupButton.click();
  }
  await strategyButton.click();
  
  console.log("Waiting for strategy details to load...");
  await page.waitForTimeout(5000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("--- BODY TEXT ---");
  console.log(bodyText);
  console.log("-----------------");
});
