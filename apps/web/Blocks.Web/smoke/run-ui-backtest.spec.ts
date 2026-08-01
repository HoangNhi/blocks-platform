import { expect, test } from "@playwright/test";

const rawWebBaseUrl = process.env.WEB_BASE_URL?.trim() || "http://localhost:65252";
const rawApiBaseUrl = process.env.TRADELAB_API_BASE_URL?.trim() || "http://localhost:43100";
const username = process.env.SMOKE_USERNAME?.trim() || "admin";
const password = process.env.SMOKE_PASSWORD || "Abc@123";

test.use({ ignoreHTTPSErrors: true });

test("Run backtest via TradeLab Web UI", async ({ page }) => {
  // Capture console logs
  page.on("console", (msg) => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on("pageerror", (err) => {
    console.error(`[Browser PageError] ${err.message}`);
  });

  console.log("Navigating to TradeLab...");
  await page.goto(`${rawWebBaseUrl}/plugins/tradelab`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // Auth check and login
  const hasSession = await page.evaluate(() => {
    const raw = window.localStorage.getItem("blocks.auth.session");
    if (!raw) return false;
    try {
      return !!JSON.parse(raw)?.tokens?.accessToken;
    } catch {
      return false;
    }
  });

  if (!hasSession) {
    console.log("Logging in via API...");
    const response = await page.request.post(`${rawApiBaseUrl}/api/system/Auth/login`, {
      data: { username, password },
    });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    const session = {
      user: {
        id: payload.Data?.id || payload.Data?.Id || "smoke-user",
        username: payload.Data?.username || payload.Data?.Username || username,
        fullname: payload.Data?.fullname || payload.Data?.Fullname || username,
        roleId: payload.Data?.roleId || payload.Data?.RoleId || "smoke-role",
        roleName: payload.Data?.roleName || payload.Data?.RoleName || null,
        email: payload.Data?.email || payload.Data?.Email || `${username}@example.test`,
        avatar: payload.Data?.avatar || payload.Data?.Avatar || null,
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
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }

  // Show test groups if hidden
  const showTestGroups = page.getByRole("checkbox", { name: "Show test groups" });
  if (await showTestGroups.isVisible({ timeout: 5000 }).catch(() => false)) {
    await showTestGroups.check();
  }

  // Load the baseline SMA 9/21 strategy
  console.log("Checking if strategy is already loaded...");
  const checkSyntaxBtn = page.getByRole("button", { name: /Check syntax/i });
  const isLoaded = await checkSyntaxBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!isLoaded) {
    console.log("Selecting SMA 9/21 strategy...");
    const strategyButton = page.locator('button:has-text("TradeLab Baseline SMA 9/21")').first();
    const isStrategyVisible = await strategyButton.isVisible().catch(() => false);
    if (!isStrategyVisible) {
      console.log("Strategy button not visible, clicking group button first...");
      const groupButton = page.locator('button:has-text("TradeLab Baseline")').first();
      await expect(groupButton).toBeVisible({ timeout: 15000 });
      await groupButton.click();
      await page.waitForTimeout(1000);
    }
    
    await expect(strategyButton).toBeVisible({ timeout: 15000 });
    await strategyButton.click();
    await expect(checkSyntaxBtn).toBeVisible({ timeout: 15000 });
  } else {
    console.log("Strategy is already loaded!");
  }

  console.log("Strategy loaded successfully!");
  await page.waitForTimeout(2000);

  // Edit Runtime Config inputs
  console.log("Configuring runtime settings...");
  
  // Fill text fields
  await page.locator('label:has-text("Exchange") input').fill("binance");
  await page.locator('label:has-text("Symbol") input').fill("BTCUSDT");
  await page.locator('label:has-text("Timeframe") input').fill("15m");
  await page.locator('label:has-text("Start date") input').fill("2026-03-01T00:00:00Z");
  await page.locator('label:has-text("End date") input').fill("2026-04-20T00:00:00Z");
  await page.locator('label:has-text("Initial equity") input').fill("100");
  await page.locator('label:has-text("Fee bps") input').fill("10");
  await page.locator('label:has-text("Slippage bps") input').fill("1");

  // Select Market Type: USD_M_FUTURES
  await page.locator('#runtime-config-market-type').selectOption("USD_M_FUTURES");
  
  // Slide default leverage to 2
  await page.locator('#runtime-config-default-leverage').fill("2");

  await page.waitForTimeout(1000);

  // Click Save setup
  console.log("Saving setup...");
  const saveButton = page.getByRole("button", { name: "Save setup" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await page.waitForTimeout(3000);

  // Click Review & run backtest
  console.log("Reviewing & running backtest...");
  const reviewBtn = page.getByRole("button", { name: "Review & run backtest" });
  await expect(reviewBtn).toBeEnabled();
  await reviewBtn.click();

  // Wait for dialog and confirm
  console.log("Confirming preflight...");
  const confirmButton = page.locator("button").filter({ hasText: /^(Run backtest|Start fill|Start repair)$/ }).last();
  await expect(confirmButton).toBeVisible({ timeout: 15000 });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click({ force: true });

  // Wait for backtest to start and finish
  console.log("Waiting for completed run status in history list...");
  const completedRunButton = page.locator("button", { hasText: "completed" }).filter({ hasText: "BTCUSDT" }).first();
  await expect(completedRunButton).toBeVisible({ timeout: 60000 });
  
  console.log("Backtest finished via UI successfully!");
  await page.waitForTimeout(2000);
});
