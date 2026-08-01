import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { buildFuturesEvidenceSummary } from "./tradelab-futures-evidence"

const rawWebBaseUrl = process.env.WEB_BASE_URL?.trim()
const rawApiBaseUrl = process.env.TRADELAB_API_BASE_URL?.trim()
const username = process.env.SMOKE_USERNAME?.trim() || "admin"
const password = process.env.SMOKE_PASSWORD || "Abc@123"

if (!rawWebBaseUrl) {
  throw new Error(
    "WEB_BASE_URL is required. Example: $env:WEB_BASE_URL='http://localhost:61357'; npm run smoke:tradelab:futures",
  )
}

if (!rawApiBaseUrl) {
  throw new Error(
    "TRADELAB_API_BASE_URL is required. Example: $env:TRADELAB_API_BASE_URL='http://localhost:43100'; npm run smoke:tradelab:futures",
  )
}

const webBaseUrl = rawWebBaseUrl.replace(/\/+$/, "")
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "")
const artifactDir = path.resolve(
  process.cwd(),
  process.env.TRADELAB_FUTURES_ARTIFACT_DIR?.trim() || "smoke-artifacts/tradelab-futures-e2e",
)

mkdirSync(artifactDir, { recursive: true })

test.use({ ignoreHTTPSErrors: true })

type SmokeAuthSession = {
  user: {
    id: string
    username: string
    fullname: string
    roleId: string
    roleName: string | null
    email: string
    avatar: string | null
  }
  tokens: {
    accessToken: string
    refreshToken: string
  }
}

type LocalFillFixtureReset = {
  datasetKey: string
  expectedRowsInsertedMin: number
}

const fixtureName = "TradeLab Local Fill Smoke"
const expectedDefaultLeverage = 10

test.setTimeout(180_000)

test("TradeLab futures backtest E2E smoke", async ({ page }) => {
  const session = await loginThroughApi(page)
  await saveSmokeSession(page, session)
  const token = session.tokens.accessToken

  const fixture = await resetLocalFillFixture(page, token)

  await page.goto(`${webBaseUrl}/plugins/tradelab?futuresSmoke=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  })
  await page.waitForLoadState("networkidle").catch(() => undefined)

  await selectLocalFillSmokeStrategy(page)
  await completeLocalFill(page, fixture.expectedRowsInsertedMin)

  const marketTypeSelect = page.locator("#runtime-config-market-type")
  await expect(marketTypeSelect).toBeVisible({ timeout: 15_000 })
  await marketTypeSelect.selectOption("USD_M_FUTURES")

  const leverageSlider = page.locator("#runtime-config-default-leverage")
  await expect(leverageSlider).toBeVisible({ timeout: 15_000 })
  await leverageSlider.focus()
  await page.keyboard.press("Home")
  for (let step = 1; step < expectedDefaultLeverage; step += 1) {
    await page.keyboard.press("ArrowRight")
  }
  await expect(page.getByText(`Default Leverage (${expectedDefaultLeverage}x)`, { exact: true })).toBeVisible({
    timeout: 15_000,
  })

  const configuredShot = path.join(artifactDir, "01-futures-configured.png")
  await page.screenshot({ path: configuredShot, fullPage: true })

  const startResponsePromise = page.waitForResponse((response) => {
    return /\/api\/tradelab\/bots\/[^/]+\/backtests$/.test(response.url()) && response.request().method() === "POST"
  })

  await page.getByRole("button", { name: /Run backtest/i }).first().click()
  const confirmButton = page.locator("button").filter({ hasText: /^(Run backtest|Start fill|Start repair)$/ }).last()
  await expect(confirmButton).toBeVisible({ timeout: 10_000 })
  await confirmButton.click({ force: true })

  const startResponse = await startResponsePromise
  const startHttpStatus = startResponse.status()
  const startRequestBody = startResponse.request().postDataJSON()
  const startResponseBody = await startResponse.json()
  const runId = extractRunId(startResponseBody)

  expect(runId).not.toBe("")

  await waitForCompletedRun(page, token, runId)

  const runResponse = await page.request.get(`${apiBaseUrl}/api/tradelab/bot-runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const analysisResponse = await page.request.get(`${apiBaseUrl}/api/tradelab/bot-runs/${runId}/analysis`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  expect(runResponse.ok()).toBeTruthy()
  expect(analysisResponse.ok()).toBeTruthy()

  const runPayload = await runResponse.json()
  const analysisPayload = await analysisResponse.json()

  await page.getByRole("checkbox", { name: "Hide fixtures/test runs" }).uncheck().catch(() => undefined)
  const runShortId = runId.slice(0, 8)
  const completedRunButton = page.locator("button").filter({ hasText: runShortId })
  await expect(completedRunButton).toBeVisible({ timeout: 45_000 })
  await completedRunButton.click()

  const completedShot = path.join(artifactDir, "02-futures-run-completed.png")
  await page.screenshot({ path: completedShot, fullPage: true })

  const positionsPanel = page.getByText("Ký hiệu", { exact: true })
  await expect(
    page.getByText("Futures research summary", { exact: true }).or(positionsPanel).or(page.getByText("Funding paid", { exact: true })).first(),
  ).toBeVisible({ timeout: 30_000 })
  const detailShot = path.join(artifactDir, "03-futures-run-detail.png")
  await page.screenshot({ path: detailShot, fullPage: true })

  const summary = buildFuturesEvidenceSummary({
    fixtureName,
    expectedDefaultLeverage,
    startHttpStatus,
    runHttpStatus: runResponse.status(),
    analysisHttpStatus: analysisResponse.status(),
    startRequestBody,
    startResponseBody,
    runPayload,
    analysisPayload,
    screenshotPaths: [configuredShot, completedShot, detailShot],
  })

  writeFileSync(path.join(artifactDir, "futures-evidence-summary.json"), `${JSON.stringify(summary, null, 2)}\n`)

  expect(summary.pass).toBe(true)
  expect(summary.issues).toEqual([])
})

async function loginThroughApi(page: Page): Promise<SmokeAuthSession> {
  const response = await page.request.post(`${apiBaseUrl}/api/system/Auth/login`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  const data = payload.Data ?? payload.data
  return {
    user: {
      id: data.id ?? data.Id ?? "smoke-user",
      username: data.username ?? data.Username ?? username,
      fullname: data.fullname ?? data.Fullname ?? username,
      roleId: data.roleId ?? data.RoleId ?? "smoke-role",
      roleName: data.roleName ?? data.RoleName ?? null,
      email: data.email ?? data.Email ?? `${username}@example.test`,
      avatar: data.avatar ?? data.Avatar ?? null,
    },
    tokens: {
      accessToken: data.accessToken ?? data.AccessToken,
      refreshToken: data.refreshToken ?? data.RefreshToken,
    },
  }
}

async function saveSmokeSession(page: Page, session: SmokeAuthSession) {
  await page.goto(webBaseUrl, { waitUntil: "domcontentloaded" })
  await page.evaluate((serializedSession) => {
    window.localStorage.setItem("blocks.auth.session", serializedSession)
  }, JSON.stringify(session))
}

async function resetLocalFillFixture(page: Page, token: string): Promise<LocalFillFixtureReset> {
  const response = await page.request.post(`${apiBaseUrl}/api/tradelab/smoke/local-fill-fixture/reset`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { confirmFixtureReset: true },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success).toBe(true)
  return payload.Data as LocalFillFixtureReset
}

async function selectLocalFillSmokeStrategy(page: Page) {
  const showTestGroups = page.getByRole("checkbox", { name: "Show test groups" })
  await expect(showTestGroups).toBeVisible({ timeout: 15_000 })
  await showTestGroups.check()
  const groupButton = page.getByRole("button", { name: /TradeLab Smoke Fixtures/i })
  await expect(groupButton).toBeVisible({ timeout: 15_000 })
  await groupButton.click()

  const strategyButton = page.getByRole("button", { name: new RegExp(fixtureName, "i") }).first()
  await expect(strategyButton).toBeVisible({ timeout: 15_000 })
  await strategyButton.click()

  const openBtn = page.getByRole("button", { name: /Open advanced tools|Hide advanced tools/ })
  await expect(openBtn).toBeVisible({ timeout: 15_000 })
  if (await page.getByRole("button", { name: "Open advanced tools" }).isVisible()) {
    await page.getByRole("button", { name: "Open advanced tools" }).click()
  }
  await page.getByRole("tab", { name: "Data Ops" }).click()
  await expect(page.getByRole("button", { name: "Preview fill plan" })).toBeVisible({ timeout: 15_000 })
}

async function completeLocalFill(page: Page, expectedRowsInsertedMin: number) {
  const previewButton = page.getByRole("button", { name: "Preview fill plan" })
  await expect(previewButton).toBeEnabled({ timeout: 15_000 })
  await previewButton.click()

  const controls = page.getByLabel("Local dataset fill controls")
  await expect(controls).toBeVisible({ timeout: 15_000 })
  await controls
    .getByRole("checkbox", { name: /I understand this writes missing market candles in local\/dev only/i })
    .check()
  await controls.getByRole("button", { name: "Confirm local fill" }).click()

  const result = page.getByLabel("Local dataset fill result")
  await expect(result).toBeVisible({ timeout: 30_000 })
  await expect(result.getByText("completed", { exact: true })).toBeVisible()
  const text = (await result.textContent()) ?? ""
  const digits = text.match(/\d+/g)?.map((value) => Number(value)) ?? []
  expect(Math.max(...digits, 0)).toBeGreaterThanOrEqual(expectedRowsInsertedMin)
}

function extractRunId(payload: unknown): string {
  const record = payload != null && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const data = (record.Data ?? record.data ?? record) as Record<string, unknown>
  const run = (data.run ?? {}) as Record<string, unknown>
  return typeof run.id === "string" ? run.id : ""
}

async function waitForCompletedRun(page: Page, token: string, runId: string) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const response = await page.request.get(`${apiBaseUrl}/api/tradelab/bot-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.ok()) {
      const payload = await response.json()
      const data = payload.Data ?? payload.data ?? payload
      if (data.status === "completed" && data.pipeline_status === "completed") {
        return
      }
    }
    await page.waitForTimeout(2_000)
  }
  throw new Error(`Timed out waiting for completed futures run ${runId}`)
}
