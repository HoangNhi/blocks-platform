import { expect, test, type Locator, type Page } from "@playwright/test"

const rawWebBaseUrl = process.env.WEB_BASE_URL?.trim()
const rawApiBaseUrl = process.env.TRADELAB_API_BASE_URL?.trim()
const username = process.env.SMOKE_USERNAME?.trim() || "admin"
const password = process.env.SMOKE_PASSWORD || "Abc@123"

if (!rawWebBaseUrl) {
  throw new Error(
    "WEB_BASE_URL is required. Example: $env:WEB_BASE_URL='http://localhost:61357'; npm run smoke:tradelab",
  )
}

if (!rawApiBaseUrl) {
  throw new Error(
    "TRADELAB_API_BASE_URL is required. Example: $env:TRADELAB_API_BASE_URL='http://localhost:58481'; npm run smoke:tradelab",
  )
}

const webBaseUrl = rawWebBaseUrl.replace(/\/+$/, "")
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "")

type LocalFillFixtureReset = {
  strategySlug: string
  strategyGroupSlug: string
  datasetKey: string
  requestedStartAt: string
  requestedEndAt: string
  expectedRowsInsertedMin: number
  expectedMissingRanges: Array<{ startAt: string; endAt: string; kind: string }>
}

type PaperRuntimeFixtureReset = {
  paperSessionId: string
  botId: string
  strategyId: string
  strategyVersionId: string
  strategySlug: string
  strategyGroupId: string
  strategyGroupSlug: string
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  requestedStartAt: string
  requestedEndAt: string
  expectedOrdersMin: number
  expectedFillsMin: number
  expectedSnapshotsMin: number
  seededRows: number
  deletedFixtureSessions: number
  deletedFixtureCandles: number
  safetyStatus: string
}

type PaperArtifactRecord = Record<string, unknown>

type PaperSessionDetail = {
  safetyStatus: string
  session: { sessionId: string; status: string; datasetKey: string; symbol: string; reasonCode?: string | null }
  auditEvents: Array<{ action: string; reasonCode?: string | null }>
  artifacts: {
    orders: PaperArtifactRecord[]
    fills: PaperArtifactRecord[]
    portfolioSnapshots: PaperArtifactRecord[]
  }
}

type SmokeAuthUser = {
  id?: string
  Id?: string
  username?: string
  Username?: string
  fullname?: string
  Fullname?: string
  roleId?: string
  RoleId?: string
  roleName?: string | null
  RoleName?: string | null
  email?: string
  Email?: string
  avatar?: string | null
  Avatar?: string | null
  accessToken?: string
  AccessToken?: string
  refreshToken?: string
  RefreshToken?: string
}

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

test("TradeLab Strategy Lab browser smoke", async ({ page }) => {
  await openTradeLab(page)
  const fixture = await resetLocalFillFixture(page)
  await page.goto(`${webBaseUrl}/plugins/tradelab?smokeFixtureReset=${Date.now()}`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await selectLocalFillSmokeStrategy(page)

  await expect(page.getByRole("tab", { name: "Strategy Lab" })).toBeVisible()
  await expect(page.getByText("TradeLab Local Fill Smoke", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Check syntax/i })).toBeVisible()

  await expect(page.getByRole("button", { name: "Open advanced tools" })).toBeVisible()
  await expect(page.getByText("Paper session", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Run pipeline", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Open advanced tools" }).click()
  await expect(page.getByRole("tab", { name: "Paper" })).toBeVisible()
  await expect(page.getByText("Paper session", { exact: true })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Assisted Testnet" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Assisted Live" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Data Ops" })).toBeVisible()

  await expect(page.getByText("Paper readiness", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Runtime safety contract is defined; paper execution remains locked.", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /Save paper draft/i })).toBeVisible()
  const credentialBoundaryControls = page.getByLabel("Credential boundary controls")
  await expect(credentialBoundaryControls.getByText("Credential boundary", { exact: true })).toBeVisible()
  await expect(credentialBoundaryControls.getByRole("checkbox", { name: "Read-only enabled" })).toBeVisible()
  await expect(page.getByLabel(/api key|key api|api secret|key bí mật|secret/i)).toHaveCount(0)

  await page.getByRole("tab", { name: "Assisted Testnet" }).click()
  await expect(page.getByRole("button", { name: "Preview testnet order" })).toBeVisible()

  await page.getByRole("tab", { name: "Assisted Live" }).click()
  await expect(page.getByRole("tabpanel").getByText("Assisted Live", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Preview live order" })).toBeVisible()

  await page.getByRole("tab", { name: "Data Ops" }).click()
  await expect(page.getByText("Run pipeline", { exact: true })).toBeVisible()
  await expect(page.getByText("Job visibility", { exact: true })).toBeVisible()
  await expect(page.getByText("Background fill jobs", { exact: true })).toBeVisible()
  await expect(page.getByText("Scheduler status", { exact: true })).toBeVisible()

  await expect(page.getByText("Dataset readiness", { exact: true })).toBeVisible()
  const datasetCatalogLink = page.getByRole("link", { name: "Open in Dataset Catalog" })
  await expect(datasetCatalogLink).toBeVisible()
  await expect(datasetCatalogLink).toHaveAttribute(
    "href",
    /\/plugins\/tradelab\/datasets\?symbol=BTCUSDT&timeframe=1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=2026-01-01T06%3A00%3A00Z$/,
  )
  const previewFillPlanButton = page.getByRole("button", { name: "Preview fill plan" })
  await expect(previewFillPlanButton).toBeEnabled()
  await previewFillPlanButton.click()
  await expect(page.getByLabel("Dataset fill preview")).toBeVisible()
  await expect(page.getByText("Preview only", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Dataset fill preview").getByText("binance:BTCUSDT:1h", { exact: true })).toBeVisible()
  const localFillControls = page.getByLabel("Local dataset fill controls")
  await expect(localFillControls).toBeVisible({ timeout: 10_000 })
  await expect(localFillControls.getByText("Local/dev only", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Dataset fill preview").getByText(fixture.datasetKey, { exact: true })).toBeVisible()
  await expect(page.getByLabel("Dataset fill preview").getByText(`Gap count${fixture.expectedMissingRanges.length}`)).toBeVisible()
  const confirmCheckbox = localFillControls.getByRole("checkbox", {
    name: /I understand this writes missing market candles in local\/dev only/i,
  })
  const confirmButton = localFillControls.getByRole("button", { name: "Confirm local fill" })
  await confirmCheckbox.check()
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()
  const result = page.getByLabel("Local dataset fill result")
  await expect(result).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Local fill result", { exact: true })).toBeVisible()
  await expect(result.getByText("completed", { exact: true })).toBeVisible()
  const rowsInserted = await numericFieldValue(result, "Rows inserted")
  expect(rowsInserted).toBeGreaterThanOrEqual(fixture.expectedRowsInsertedMin)
  await expect(page.getByText("Local fill audit", { exact: true })).toBeVisible()
  const localFillAudit = page.getByLabel("Local fill audit attempts")
  await expect(localFillAudit.getByText("completed", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  const auditRowsInserted = await numericFieldValue(localFillAudit, "rows inserted")
  expect(auditRowsInserted).toBeGreaterThanOrEqual(fixture.expectedRowsInsertedMin)
  await expect(page.getByText("Background fill jobs", { exact: true })).toBeVisible()
  await expect(page.getByText("Read-only", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh background fill jobs" })).toBeVisible()
  await expect(page.getByText("Scheduler status", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh scheduler status" })).toBeVisible()
  await expect(page.getByText("Job visibility", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh job visibility" })).toBeVisible()

  await page.getByRole("tab", { name: "Paper" }).click()
  await expect(page.getByText("Paper scheduler", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh paper scheduler status" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Start scheduler|Stop scheduler|Run scheduler tick|Enable scheduler|Disable scheduler/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /recover|requeue|repair|replace/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Run paper|Retry paper/i })).toHaveCount(0)
  await expect(page.getByText(/Cancel job|Recover job|Retry job|Requeue job|Repair candles|Replace candles/i)).toHaveCount(0)

  await expect(page.getByText(/Run uses version/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /Review & run backtest/i })).toBeEnabled()

  await page.getByRole("button", { name: /Check syntax/i }).click()
  await expect(page.getByText("Validation valid", { exact: true })).toBeVisible()
  await generateBacktestRobustnessEvidence(page)
})

test("TradeLab background fill enqueue browser smoke", async ({ page }) => {
  await openTradeLab(page)
  const fixture = await resetLocalFillFixture(page)
  await page.goto(`${webBaseUrl}/plugins/tradelab?smokeFixtureReset=${Date.now()}&enqueueSmoke=1`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await selectLocalFillSmokeStrategy(page)

  await page.getByRole("button", { name: "Open advanced tools" }).click()
  await page.getByRole("tab", { name: "Data Ops" }).click()

  const previewFillPlanButton = page.getByRole("button", { name: "Preview fill plan" })
  await expect(previewFillPlanButton).toBeEnabled()
  await previewFillPlanButton.click()
  const preview = page.getByLabel("Dataset fill preview")
  await expect(preview).toBeVisible()
  await expect(preview.getByText(fixture.datasetKey, { exact: true })).toBeVisible()

  const localFillControls = page.getByLabel("Local dataset fill controls")
  const confirmCheckbox = localFillControls.getByRole("checkbox", {
    name: /I understand this writes missing market candles in local\/dev only/i,
  })
  await confirmCheckbox.check()
  const queueButton = localFillControls.getByRole("button", { name: "Queue background fill" })
  await expect(queueButton).toBeEnabled()
  await queueButton.click()

  const enqueueResult = page.getByLabel("Background fill enqueue result")
  await expect(enqueueResult).toBeVisible({ timeout: 15_000 })
  await expect(enqueueResult.getByText("queued", { exact: true })).toBeVisible()
  const backgroundJobs = page.getByLabel("Active background fill jobs")
  await expect(backgroundJobs.getByText("queued", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  const tickResult = await runWorkerTick(page)
  expect(tickResult.datasetKey).toBe(fixture.datasetKey)
  await page.getByRole("button", { name: "Refresh background fill jobs" }).click()
  const recentJobs = page.getByLabel("Recent background fill jobs")
  await expect(recentJobs.getByText("completed", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  const rowsInserted = await numericFieldValue(recentJobs, "rows inserted")
  expect(rowsInserted).toBeGreaterThanOrEqual(fixture.expectedRowsInsertedMin)
})

test("TradeLab paper runtime fixture browser smoke", async ({ page }) => {
  await openTradeLab(page)
  const cancelFixture = await resetPaperRuntimeFixture(page)

  await page.goto(`${webBaseUrl}/plugins/tradelab?paperRuntimeSmokeCancel=${Date.now()}`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await selectPaperRuntimeSmokeStrategy(page, cancelFixture)
  await verifyQueuedLocalCancel(page, cancelFixture)
  await verifyCancelledLocalRetry(page, cancelFixture.paperSessionId)
  await expectNoHorizontalOverflow(page)
  await expectForbiddenPaperControlsAbsent(page)

  const resumeFixture = await resetPaperRuntimeFixture(page, "cancelled_resumable")
  await page.goto(`${webBaseUrl}/plugins/tradelab?paperRuntimeSmokeResume=${Date.now()}`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await selectPaperRuntimeSmokeStrategy(page, resumeFixture)
  await verifyCancelledLocalResume(page, resumeFixture.paperSessionId)
  await expectNoHorizontalOverflow(page)
  await expectForbiddenPaperControlsAbsent(page)

  const fixture = await resetPaperRuntimeFixture(page)
  await page.goto(`${webBaseUrl}/plugins/tradelab?paperRuntimeSmokeRun=${Date.now()}`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  await selectPaperRuntimeSmokeStrategy(page, fixture)
  await loadPaperSessionInUi(page, fixture.paperSessionId)
  await expect(page.getByLabel("Paper kill switch status")).toBeVisible()
  await expect(page.getByText("Paper kill switch", { exact: true })).toBeVisible()
  await expect(page.getByText("read_only_paper_kill_switch_status", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Run local paper session" })).toBeEnabled({ timeout: 15_000 })
  await expect(page.getByRole("heading", { name: "Paper Runtime Detail" })).toBeVisible()
  await expect(page.getByText("Session is queued and has not run locally yet.")).toBeVisible()
  await expect(page.getByText("Lifecycle", { exact: true })).toBeVisible()
  const closeoutSummary = page.getByLabel("Paper runtime closeout summary")
  await expect(closeoutSummary).toBeVisible()
  await expect(closeoutSummary.getByText("Awaiting local/dev run", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Session summary", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Runtime evidence", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("No runtime artifacts have been persisted yet.", { exact: true })).toBeVisible()
  await expectNoHorizontalOverflowIn(closeoutSummary)
  await expect(page.getByText("Local/dev simulated paper runtime only. No exchange, testnet, or live route is contacted.")).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole("button", { name: "Run local paper session" }).click()
  await expect(page.getByText("Latest local run", { exact: true })).toBeVisible({ timeout: 30_000 })
  const localRunResult = page.getByLabel("Local paper session run")
  await expect(localRunResult.getByText("paper_engine_completed", { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Paper Runtime Detail" })).toBeVisible()
  await expect(page.getByText("Orders created", { exact: true })).toBeVisible()
  await expect(page.getByText("Fills created", { exact: true })).toBeVisible()
  await expect(page.getByText("Snapshots created", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Local/dev run finished", { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Artifact limits", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Portfolio summary", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Latest audit", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Runtime artifacts persisted for completed session.", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText(/Orders \d+ \/ fills \d+ \/ positions \d+ \/ snapshots \d+/).first()).toBeVisible()
  await expectNoHorizontalOverflowIn(closeoutSummary)
  await expect(page.getByText("Recent paper sessions", { exact: true })).toBeVisible()
  await expect(page.getByText("paper_engine_completed", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Load detail for paper session/i }).first()).toBeVisible()
  await page.getByRole("button", { name: /Load detail for paper session/i }).first().click()
  await expect(page.getByRole("heading", { name: "Paper Runtime Detail" })).toBeVisible()
  await expect(closeoutSummary.getByText("Local/dev run finished", { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  const detail = await loadPaperSessionDetail(page, fixture.paperSessionId)
  expect(detail.safetyStatus).toBe("read_only_paper_session_detail")
  expect(detail.session.sessionId).toBe(fixture.paperSessionId)
  expect(detail.session.status).toBe("completed")
  expect(detail.session.datasetKey).toBe(fixture.datasetKey)
  expect(detail.session.symbol).toBe(fixture.symbol)
  expect(detail.artifacts.orders.length).toBeGreaterThanOrEqual(fixture.expectedOrdersMin)
  expect(detail.artifacts.fills.length).toBeGreaterThanOrEqual(fixture.expectedFillsMin)
  expect(detail.artifacts.portfolioSnapshots.length).toBeGreaterThanOrEqual(fixture.expectedSnapshotsMin)
  expect(detail.auditEvents.some((event) => event.action === "paper_strategy_runtime_prepared")).toBe(true)
  await expectPaperRuntimeTimelineEvidence(page, detail)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText("Paper session", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Paper Runtime Detail" })).toBeVisible()
  await expect(closeoutSummary.getByText("Local/dev run finished", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Session summary", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Runtime evidence", { exact: true })).toBeVisible()
  await expect(closeoutSummary.getByText("Portfolio summary", { exact: true })).toBeVisible()
  await expectNoHorizontalOverflowIn(closeoutSummary)
  await expectPaperRuntimeTimelineEvidence(page, detail)
  await expectNoHorizontalOverflow(page)

  await expectForbiddenPaperControlsAbsent(page)
})

test("TradeLab Dataset Catalog browser smoke", async ({ page }) => {
  await openTradeLab(page)
  await page.goto(
    `${webBaseUrl}/plugins/tradelab/datasets?symbol=BTCUSDT&timeframe=1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=2026-01-07T00%3A00%3A00Z`,
    {
      waitUntil: "domcontentloaded",
    },
  )
  await page.waitForLoadState("networkidle").catch(() => undefined)

  await expect(page.getByRole("heading", { name: "Dataset Catalog" })).toBeVisible()
  await expect(page.getByRole("button", { name: /Refresh dataset catalog/i })).toBeVisible()
  await expect(page.getByLabel("Dataset catalog summary")).toBeVisible()
  await expect(page.getByLabel("Dataset catalog filters")).toBeVisible()
  await expect(page.getByLabel("Dataset coverage table")).toBeVisible()
  await expect(page.getByLabel("Dataset key filter")).toBeVisible()
  await expect(page.getByLabel("Symbol filter")).toHaveValue("BTCUSDT")
  await expect(page.getByLabel("Timeframe filter")).toHaveValue("1h")

  const detailsButton = page.getByRole("button", { name: /Open details for binance:BTCUSDT:1h/i })
  if (await detailsButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await detailsButton.click()
    await expect(page.getByText("Target context", { exact: true })).toBeVisible()
    await expect(page.getByText("Requested range", { exact: true })).toBeVisible()
    await expect(page.getByText("Strategy Lab link", { exact: true })).toBeVisible()
    await expect(page.getByText("Freshness & gaps", { exact: true })).toBeVisible()
  }
})

async function openTradeLab(page: Page) {
  await page.goto(`${webBaseUrl}/plugins/tradelab`, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle").catch(() => undefined)

  if (!(await authToken(page))) {
    const session = await loginThroughApi(page)
    await saveSmokeSession(page, session)
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await page.goto(`${webBaseUrl}/plugins/tradelab`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle").catch(() => undefined)
  }
}

async function resetLocalFillFixture(page: Page): Promise<LocalFillFixtureReset> {
  const token = await authToken(page)
  const response = await page.request.post(`${apiBaseUrl}/api/tradelab/smoke/local-fill-fixture/reset`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: { confirmFixtureReset: true },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success).toBe(true)
  expect(payload.Data.safetyStatus).toBe("local_dev_smoke_fixture_only")
  expect(payload.Data.expectedRowsInsertedMin).toBeGreaterThan(0)
  return payload.Data as LocalFillFixtureReset
}

async function resetPaperRuntimeFixture(
  page: Page,
  sessionState: "queued" | "cancelled_resumable" = "queued",
): Promise<PaperRuntimeFixtureReset> {
  const token = await authToken(page)
  const response = await page.request.post(`${apiBaseUrl}/api/tradelab/smoke/paper-runtime-fixture/reset`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: { confirmFixtureReset: true, sessionState },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success).toBe(true)
  expect(payload.Data.safetyStatus).toBe("local_dev_paper_runtime_smoke_fixture")
  expect(payload.Data.symbol).toBe("TPAPERUSDT")
  expect(payload.Data.expectedOrdersMin).toBeGreaterThanOrEqual(2)
  expect(payload.Data.expectedFillsMin).toBeGreaterThanOrEqual(2)
  expect(payload.Data.expectedSnapshotsMin).toBeGreaterThanOrEqual(6)
  return payload.Data as PaperRuntimeFixtureReset
}

async function runWorkerTick(page: Page) {
  const token = await authToken(page)
  const response = await page.request.post(`${apiBaseUrl}/api/tradelab/datasets/fill-jobs/worker-tick`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: { confirmLocalWorkerTick: true, workerId: "tradelab-smoke-worker" },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success).toBe(true)
  expect(payload.Data.safetyStatus).toBe("local_dev_worker_tick")
  expect(payload.Data.processed).toBe(true)
  expect(payload.Data.status).toBe("completed")
  expect(payload.Data.rowsInserted).toBeGreaterThan(0)
  return payload.Data
}

async function loadPaperSessionDetail(page: Page, sessionId: string): Promise<PaperSessionDetail> {
  const token = await authToken(page)
  const response = await page.request.get(`${apiBaseUrl}/api/tradelab/paper/sessions/${sessionId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success).toBe(true)
  return payload.Data as PaperSessionDetail
}

async function loadPaperSessionInUi(page: Page, sessionId: string) {
  const openBtn = page.getByRole("button", { name: /Open advanced tools|Hide advanced tools/ })
  await expect(openBtn).toBeVisible({ timeout: 15_000 })
  if (await page.getByRole("button", { name: "Open advanced tools" }).isVisible()) {
    await page.getByRole("button", { name: "Open advanced tools" }).click()
  }
  await expectVisibleWithDiagnostics(page, page.getByText("Paper session", { exact: true }), "paper session panel visible")
  await page.getByLabel("Paper session ID").fill(sessionId)
  await page.getByRole("button", { name: "Load paper session detail" }).click()
  const runtimeDetail = page.getByLabel("Paper session runtime detail")
  await expectVisibleWithDiagnostics(page, runtimeDetail.getByText(sessionId, { exact: true }), "paper session detail loaded")
  return runtimeDetail
}

async function verifyQueuedLocalCancel(page: Page, fixture: PaperRuntimeFixtureReset) {
  const runtimeDetail = await loadPaperSessionInUi(page, fixture.paperSessionId)
  await expect(runtimeDetail.getByText("queued", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Run local paper session" })).toBeEnabled({ timeout: 15_000 })

  const cancelButton = page.getByRole("button", { name: "Cancel local paper session" })
  await expect(cancelButton).toBeEnabled({ timeout: 15_000 })
  await expectForbiddenPaperControlsAbsent(page)
  await cancelButton.click()

  await expect(page.getByText("Latest local cancel", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("paper_local_cancelled", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Current: cancelled", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(cancelButton).toBeDisabled({ timeout: 15_000 })
  await expect(page.getByText(/completed|failed|blocked|cancelled|cannot be cancelled locally/i).first()).toBeVisible({
    timeout: 15_000,
  })

  const cancelledDetail = await loadPaperSessionDetail(page, fixture.paperSessionId)
  expect(cancelledDetail.session.status).toBe("cancelled")
  expect(cancelledDetail.session.reasonCode).toBe("paper_local_cancelled")
  expect(cancelledDetail.auditEvents.some((event) => event.action === "paper_session_cancelled")).toBe(true)
  await expect(page.getByLabel("Local paper session resume")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Resume local paper session" })).toBeDisabled({ timeout: 15_000 })
  await expect(page.getByText("paper_local_resume_not_resumable", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Resume does not run automatically. Use Run local after the session is queued.")).toBeVisible()
}

async function verifyCancelledLocalResume(page: Page, sessionId: string) {
  await loadPaperSessionInUi(page, sessionId)
  await expect(page.getByLabel("Local paper session resume")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("paper_local_resume_readiness_ready", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("checkpoint: persisted", { exact: true })).toBeVisible({ timeout: 15_000 })

  const resumeButton = page.getByRole("button", { name: "Resume local paper session" })
  await expect(resumeButton).toBeEnabled({ timeout: 15_000 })
  await resumeButton.click()

  await expect(page.getByText("Latest local resume", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("paper_local_resume_queued", { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Resume status: queued", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: "Run local paper session" })).toBeEnabled({ timeout: 15_000 })

  const detail = await loadPaperSessionDetail(page, sessionId)
  expect(detail.session.status).toBe("queued")
  expect(detail.session.reasonCode).toBe("paper_local_resume_queued")
  expect(detail.artifacts.orders.length).toBe(0)
  expect(detail.artifacts.fills.length).toBe(0)
  expect(detail.artifacts.portfolioSnapshots.length).toBeGreaterThanOrEqual(1)
}

async function verifyCancelledLocalRetry(page: Page, sourceSessionId: string) {
  await loadPaperSessionInUi(page, sourceSessionId)
  await expect(page.getByText("Retry from terminal session", { exact: true })).toBeVisible({ timeout: 15_000 })

  const retryButton = page.getByRole("button", { name: "Retry local paper session" })
  await expect(retryButton).toBeEnabled({ timeout: 15_000 })
  await retryButton.click()

  await expect(page.getByText("Latest local retry", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("paper_local_retry_queued", { exact: true }).first()).toBeVisible({ timeout: 15_000 })

  const sourceDetail = await loadPaperSessionDetail(page, sourceSessionId)
  expect(sourceDetail.session.status).toBe("cancelled")

  const retrySessionText = await page
    .getByLabel("Local paper session retry")
    .getByText(/Retry:\s+\S+/)
    .last()
    .textContent()
  const retrySessionId = retrySessionText?.replace(/^Retry:\s*/, "").trim()
  expect(retrySessionId).toBeTruthy()

  const retryDetail = await loadPaperSessionDetail(page, retrySessionId!)
  expect(retryDetail.session.status).toBe("queued")
  expect(retryDetail.artifacts.orders.length).toBe(0)
  expect(retryDetail.artifacts.fills.length).toBe(0)
  expect(retryDetail.artifacts.portfolioSnapshots.length).toBe(0)
  await expect(page.getByRole("button", { name: "Run local paper session" })).toBeEnabled({ timeout: 15_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectNoHorizontalOverflowIn(locator: Locator) {
  const dimensions = await locator.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectForbiddenPaperControlsAbsent(page: Page) {
  await expect(page.getByRole("button", { name: /Run paper/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /engine tick|paper engine tick/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Start scheduler|Stop scheduler|Run scheduler tick|Enable scheduler|Disable scheduler/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /recover|requeue|repair|replace/i })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Retry paper/i })).toHaveCount(0)
  await expect(page.getByText(/Recover paper|Retry paper|Resume paper|Requeue paper|Repair candles|Replace candles/i)).toHaveCount(0)
  await expect(page.getByLabel(/api key|key api|api secret|key bí mật|secret/i)).toHaveCount(0)
}

async function generateBacktestRobustnessEvidence(page: Page) {
  await expect(page.getByText("Research robustness", { exact: true })).toBeVisible()
  const backtestButton = page.getByRole("button", { name: /Review & run backtest/i }).first()
  await expect(backtestButton).toBeEnabled({ timeout: 15_000 })
  await backtestButton.click()

  const confirmButton = page.locator("button").filter({ hasText: /^(Run backtest|Start fill|Start repair)$/ }).last()
  await expect(confirmButton).toBeVisible({ timeout: 10_000 })
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click({ force: true })

  const completedRunButton = page.locator("button", { hasText: "completed" }).filter({ hasText: "BTCUSDT" }).first()
  await expectVisibleWithDiagnostics(page, completedRunButton, "completed backtest run visible", 30_000)
  await completedRunButton.click()
  await expect(page.getByText("Signal handoff", { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Execution journal", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /Add journal entry/i })).toBeEnabled()
  await expect(page.getByText(/No execution journal entries recorded yet|Loading execution journal/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /Connect exchange|Submit order/i })).toHaveCount(0)
  await expect(page.getByLabel(/api key|api secret|private key|secret/i)).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Run live|Run testnet|Start live|Start testnet/i })).toHaveCount(0)
  const robustnessButton = page.getByRole("button", { name: "Generate robustness evidence" })
  await expect(robustnessButton).toBeEnabled({ timeout: 30_000 })
  await robustnessButton.click()
  await expect(page.getByText("research_robustness_gate_only", { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("not_live_ready", { exact: true })).toBeVisible()
  await expect(page.getByText(/trade_count_|drawdown_|fee_slippage_|out_of_sample_/i).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Submit order|Connect exchange/i })).toHaveCount(0)
  await expect(page.getByLabel(/api key|api secret|private key|secret/i)).toHaveCount(0)
}

function stringField(record: PaperArtifactRecord | undefined, fieldName: string) {
  const value = record?.[fieldName]
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

async function expectPaperRuntimeTimelineEvidence(page: Page, detail: PaperSessionDetail) {
  const timeline = page.getByLabel("Runtime timeline")
  await expect(timeline).toBeVisible()
  await expect(timeline.getByText("Runtime timeline", { exact: true })).toBeVisible()
  await expect(timeline.getByText(/^\d+ events$/)).toBeVisible()
  await expect(timeline.getByText("Session completed", { exact: true })).toBeVisible()
  await expect(timeline.getByText(detail.session.sessionId, { exact: true }).first()).toBeVisible()

  if (detail.session.reasonCode) {
    await expect(timeline.getByText(detail.session.reasonCode, { exact: true }).first()).toBeVisible()
  }

  const preparedAuditAction = detail.auditEvents.find((event) => event.action === "paper_strategy_runtime_prepared")?.action
  const auditAction = preparedAuditAction || detail.auditEvents[0]?.action
  if (auditAction) {
    await expect(timeline.getByText(auditAction, { exact: true }).first()).toBeVisible()
  }

  const firstOrderId = stringField(detail.artifacts.orders[0], "orderId")
  if (firstOrderId) {
    await expect(timeline.getByText(firstOrderId, { exact: true }).first()).toBeVisible()
  }

  const firstFill = detail.artifacts.fills[0]
  const firstFillId = stringField(firstFill, "fillId")
  const firstLinkedOrderId = stringField(firstFill, "paperOrderId")
  if (firstFillId) {
    await expect(timeline.getByText(firstFillId, { exact: true }).first()).toBeVisible()
  }
  if (firstLinkedOrderId) {
    await expect(timeline.getByText(firstLinkedOrderId, { exact: true }).first()).toBeVisible()
  }

  const firstSnapshotId = stringField(detail.artifacts.portfolioSnapshots[0], "snapshotId")
  await expect(timeline.getByText(/Portfolio checkpoint|Max drawdown checkpoint/).first()).toBeVisible()
  if (firstSnapshotId) {
    await expect(timeline.getByText(firstSnapshotId, { exact: true }).first()).toBeVisible()
  }

  await expectNoHorizontalOverflowIn(timeline)
}

function pickSmokeValue<T>(record: Record<string, unknown>, camelKey: string, pascalKey: string, fallback: T): T {
  if (record[camelKey] !== undefined && record[camelKey] !== null) {
    return record[camelKey] as T
  }

  if (record[pascalKey] !== undefined && record[pascalKey] !== null) {
    return record[pascalKey] as T
  }

  return fallback
}

function mapSmokeAuthSession(data: SmokeAuthUser): SmokeAuthSession {
  const record = data as Record<string, unknown>
  const accessToken = pickSmokeValue(record, "accessToken", "AccessToken", "")
  const refreshToken = pickSmokeValue(record, "refreshToken", "RefreshToken", "")

  expect(accessToken, "login response should include an access token").not.toBe("")

  return {
    user: {
      id: pickSmokeValue(record, "id", "Id", "smoke-user"),
      username: pickSmokeValue(record, "username", "Username", username),
      fullname: pickSmokeValue(record, "fullname", "Fullname", username),
      roleId: pickSmokeValue(record, "roleId", "RoleId", "smoke-role"),
      roleName: pickSmokeValue<string | null>(record, "roleName", "RoleName", null),
      email: pickSmokeValue(record, "email", "Email", `${username}@example.test`),
      avatar: pickSmokeValue<string | null>(record, "avatar", "Avatar", null),
    },
    tokens: {
      accessToken,
      refreshToken,
    },
  }
}

async function loginThroughApi(page: Page): Promise<SmokeAuthSession> {
  const response = await page.request.post(`${apiBaseUrl}/api/system/Auth/login`, {
    data: { username, password },
  })

  expect(response.ok(), `smoke API login failed with HTTP ${response.status()}`).toBeTruthy()
  const payload = await response.json()
  expect(payload.Success ?? payload.success, "smoke API login envelope should be successful").toBe(true)

  return mapSmokeAuthSession((payload.Data ?? payload.data) as SmokeAuthUser)
}

async function saveSmokeSession(page: Page, session: SmokeAuthSession) {
  await page.goto(webBaseUrl, { waitUntil: "domcontentloaded" })
  await page.evaluate((serializedSession) => {
    window.localStorage.setItem("blocks.auth.session", serializedSession)
  }, JSON.stringify(session))
}

async function authToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("blocks.auth.session")
    if (!raw) return null
    try {
      return JSON.parse(raw)?.tokens?.accessToken ?? null
    } catch {
      return null
    }
  })
}

async function smokeDiagnostics(page: Page, label: string) {
  const details = await page.evaluate((diagnosticLabel) => {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .map((element) => element.textContent?.trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 30)
    const buttons = Array.from(document.querySelectorAll("button"))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 60)
    const links = Array.from(document.querySelectorAll("a"))
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
      .filter((text): text is string => Boolean(text))
      .slice(0, 30)
    const bodyText = document.body?.innerText?.replace(/\s+/g, " ").slice(0, 2500) ?? ""
    return {
      label: diagnosticLabel,
      url: window.location.href,
      title: document.title,
      hasAuthSession: Boolean(window.localStorage.getItem("blocks.auth.session")),
      headings,
      buttons,
      links,
      bodyText,
    }
  }, label)
  console.log(`[tradelab-smoke-diagnostics] ${JSON.stringify(details, null, 2)}`)
}

async function expectVisibleWithDiagnostics(page: Page, locator: Locator, label: string, timeout = 15_000) {
  try {
    await expect(locator).toBeVisible({ timeout })
  } catch (error) {
    await smokeDiagnostics(page, label)
    throw error
  }
}

async function expectMainTextWithDiagnostics(page: Page, text: string | RegExp, label: string, timeout = 15_000) {
  try {
    await expect(page.locator("main")).toContainText(text, { timeout })
  } catch (error) {
    await smokeDiagnostics(page, label)
    throw error
  }
}

async function showSmokeFixtureGroups(page: Page) {
  const showTestGroups = page.getByRole("checkbox", { name: "Show test groups" })
  if (await showTestGroups.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await showTestGroups.check()
  }
}

async function selectLocalFillSmokeStrategy(page: Page) {
  await showSmokeFixtureGroups(page)
  const groupButton = page.getByRole("button", { name: /TradeLab Smoke Fixtures/i })
  await expectVisibleWithDiagnostics(page, groupButton, "local fill smoke group visible")
  await groupButton.click()

  const strategyButton = page.getByRole("button", { name: /TradeLab Local Fill Smoke/i }).first()
  await expectVisibleWithDiagnostics(page, strategyButton, "local fill smoke strategy button visible")
  await strategyButton.click()

  await expectMainTextWithDiagnostics(page, /TradeLab Local Fill Smoke/i, "local fill smoke strategy selected")
  await expectMainTextWithDiagnostics(page, /BTCUSDT/i, "local fill smoke symbol visible")
}

async function selectPaperRuntimeSmokeStrategy(page: Page, fixture: PaperRuntimeFixtureReset) {
  await showSmokeFixtureGroups(page)
  const groupButton = page.getByRole("button", { name: /TradeLab Paper Runtime Smoke Fixtures/i })
  await expectVisibleWithDiagnostics(page, groupButton, "paper runtime smoke group visible")
  await groupButton.click()

  const strategyButton = page.getByRole("button", { name: /TradeLab Paper Runtime Smoke(?!.*Fixtures)/i }).first()
  await expectVisibleWithDiagnostics(page, strategyButton, "paper runtime smoke strategy button visible")
  await strategyButton.click()

  await expectMainTextWithDiagnostics(page, "TradeLab Paper Runtime Smoke", "paper runtime smoke strategy selected")
  await expectMainTextWithDiagnostics(page, fixture.symbol, "paper runtime smoke symbol visible")
  await expect(page.getByRole("button", { name: /Check syntax/i })).toBeVisible({ timeout: 15_000 })
}

async function numericFieldValue(section: Locator, label: string) {
  const row = section.locator("div", { hasText: label }).filter({ hasText: /\d/ }).first()
  const text = await row.textContent()
  const match = text?.match(/\d+/)
  return match ? Number(match[0]) : 0
}
