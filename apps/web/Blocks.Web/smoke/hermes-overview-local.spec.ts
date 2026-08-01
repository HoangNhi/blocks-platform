import { mkdir } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const baseURL = process.env.WEB_BASE_URL?.trim() || "http://127.0.0.1:4173"
const artifactDir = path.resolve(
  process.env.HERMES_OVERVIEW_ARTIFACT_DIR?.trim() || "test-results/hermes-overview",
)

const session = {
  user: {
    id: "local-smoke",
    username: "admin",
    fullname: "Local Smoke",
    roleId: "admin",
    roleName: "Admin",
    email: "local@example.test",
    avatar: null,
  },
  tokens: { accessToken: "local-smoke-token", refreshToken: "local-smoke-refresh" },
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true })
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    window.localStorage.setItem("blocks.auth.session", JSON.stringify(value))
  }, session)

  await page.route("**/api/system/SystemGroup/get-all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        statusCode: 200,
        data: [
          {
            id: "system",
            name: "System",
            sort: 20,
            parentId: null,
          },
          {
            id: "system-core",
            name: "System Core",
            sort: 10,
            parentId: "system",
          },
        ]
      }),
    })
  })

  await page.route("**/api/system/Menu/get-list-by-user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        statusCode: 200,
        data: [
          {
            id: "hermes-overview",
            controller: "Hermes",
            name: "Hermes Overview",
            systemGroupId: "system-core",
            sort: 10,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
        ]
      }),
    })
  })

  await page.route("**/api/system/User/get-current-user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        statusCode: 200,
        data: {
          id: "local-smoke",
          username: "admin",
          fullname: "Local Smoke",
          roleId: "admin",
          roleName: "Admin",
          email: "local@example.test",
          avatar: null,
        }
      }),
    })
  })
})

test("desktop interactions and accessibility", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text()
      if (text.includes("Failed to load resource") || text.includes("404")) return
      errors.push(text)
    }
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${baseURL}/system/hermes/overview`)

  // default heading, map, Core, Surfaces, Tools, Provider, Cron, Memory, Sessions visible
  await expect(page.getByRole("heading", { name: "Hermes Overview" })).toBeVisible()
  const systemMap = page.getByTestId("system-map")
  await expect(systemMap).toBeVisible()

  const blocks = {
    core: page.getByTestId("block-core"),
    surfaces: page.getByTestId("block-surfaces"),
    tools: page.getByTestId("block-tools"),
    provider: page.getByTestId("block-provider"),
    cron: page.getByTestId("block-cron"),
    memory: page.getByTestId("block-memory"),
    sessions: page.getByTestId("block-sessions"),
  }

  for (const [, locator] of Object.entries(blocks)) {
    await expect(locator).toBeVisible()
  }

  // Assert Memory / Obsidian label is not CSS-truncated
  const memoryLabel = page.getByTestId("block-memory").locator("strong")
  const isTruncated = await memoryLabel.evaluate((el) => {
    const style = window.getComputedStyle(el)
    return style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap" || el.scrollWidth > el.clientWidth
  })
  expect(isTruncated).toBe(false)

  // Wait for layout to settle and connection layer to render paths
  await page.waitForTimeout(500)

  // 5 SVG connector paths and endpoint ports visible after layout settles
  const connectionLayer = page.locator('[data-connection-layer="true"]')
  await expect(connectionLayer).toBeVisible()
  const paths = connectionLayer.locator("path")
  const pathCount = await paths.count()
  expect(pathCount).toBeGreaterThanOrEqual(5)

  // Verify at least one circle exists in connection layer
  const circles = connectionLayer.locator("circle")
  const circleCount = await circles.count()
  expect(circleCount).toBeGreaterThanOrEqual(10) // 2 circles per path

  // Print all bounding boxes for settled layout
  const mapBox = await systemMap.boundingBox()
  console.log("BOX: system-map =", mapBox)
  for (const [name, locator] of Object.entries(blocks)) {
    const box = await locator.boundingBox()
    console.log(`BOX: block-${name} =`, box)
  }

  const summary = page.locator('section[aria-label="Hermes capability summary"]')
  const summaryBox = await summary.boundingBox()
  console.log("BOX: summary =", summaryBox)

  const activity = page.getByTestId("routing-flow-strip")
  const activityBox = await activity.boundingBox()
  console.log("BOX: activity =", activityBox)

  console.log("BOX: viewport =", page.viewportSize())

  // Assert empty state and its visibility
  const emptyState = page.getByTestId("activity-empty-state")
  await expect(emptyState).toBeVisible()
  await expect(emptyState.getByText("Recent activity:")).toBeVisible()
  await expect(emptyState.getByText("No recent data")).toBeVisible()

  // Ensure lower strip remains fully within the 800px viewport
  if (activityBox) {
    expect(activityBox.y + activityBox.height).toBeLessThanOrEqual(800)
  }

  // Assert desktop document bottom visible within 800px only if full page can fit without shrinking text
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const clientHeight = await page.evaluate(() => document.documentElement.clientHeight)

  console.log(`DESKTOP HEIGHTS: scrollHeight=${scrollHeight}, clientHeight=${clientHeight}`)

  if (scrollHeight <= 800) {
    const isAtBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2)
    expect(isAtBottom).toBe(true)
  } else {
    // Assert summary/activity strips are reachable in DOM
    const routingFlowStrip = page.getByTestId("routing-flow-strip")
    await expect(routingFlowStrip).toBeAttached()
    await routingFlowStrip.scrollIntoViewIfNeeded()
    await expect(routingFlowStrip).toBeVisible()

    const railCore = page.getByTestId("rail-core")
    await expect(railCore).toBeAttached()
    await railCore.scrollIntoViewIfNeeded()
    await expect(railCore).toBeVisible()

    // Capture fullPage evidence image separately
    await page.screenshot({ path: path.join(artifactDir, "hermes-overview-final-desktop-fullpage.png"), fullPage: true })

    // Scroll back to top before capturing default screen screenshot
    await page.evaluate(() => window.scrollTo(0, 0))
  }

  // capture DEFAULT before interaction
  await page.screenshot({ path: path.join(artifactDir, "hermes-overview-final-desktop.png") })

  const tools = page.getByTestId("block-tools")

  // Enter opens inspection
  await tools.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("inspection-title")).toHaveText("Tools")
  await expect(tools).toHaveAttribute("aria-pressed", "true")

  // Escape closes inspection
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("inspection-panel")).toBeHidden()

  // Space opens inspection
  await tools.focus()
  await page.keyboard.press("Space")
  await expect(page.getByTestId("inspection-title")).toHaveText("Tools")
  await expect(tools).toHaveAttribute("aria-pressed", "true")

  // Wait until panel transitions settle: desktop panel exact right edge <= 1280 and x approximately 920 with width <= 360 before capture
  const panel = page.getByTestId("inspection-panel")
  await expect(panel).toBeVisible()

  await expect.poll(async () => {
    const box = await panel.boundingBox()
    if (!box) return false
    console.log("POLLING DESKTOP PANEL BOX:", box)
    return box.x + box.width <= 1280 && box.x >= 910 && box.x <= 930 && box.width <= 360
  }).toBe(true)

  // capture selected state
  await page.screenshot({ path: path.join(artifactDir, "hermes-overview-final-desktop-inspection.png") })

  // same-block click closes
  await tools.click({ force: true })
  await expect(panel).toBeHidden()

  // click overlay closes
  await tools.click()
  await expect(panel).toBeVisible()
  await page.locator('[data-slot="sheet-overlay"]').click()
  await expect(panel).toBeHidden()

  // visible close closes
  await tools.click()
  await expect(panel).toBeVisible()
  const closeBtn = page.locator('[data-slot="sheet-close"]')
  await expect(closeBtn).toBeVisible()
  await closeBtn.click()
  await expect(panel).toBeHidden()

  // check horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  expect(errors).toEqual([])
})

test("mobile list and bottom sheet", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text()
      if (text.includes("Failed to load resource") || text.includes("404")) return
      errors.push(text)
    }
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseURL}/system/hermes/overview`)

  // desktop map computed hidden; mobile vertical list visible
  await expect(page.getByTestId("system-map-mobile")).toBeVisible()
  await expect(page.getByTestId("system-map")).toBeHidden()

  // all blocks readable, no x-overflow
  const overflowBefore = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflowBefore).toBe(false)

  // capture DEFAULT before interaction
  await page.screenshot({ path: path.join(artifactDir, "hermes-overview-final-mobile.png") })

  // Memory opens bottom sheet
  const memoryMobile = page.getByTestId("block-memory-mobile")
  await memoryMobile.click()
  await expect(page.getByTestId("inspection-title")).toHaveText("Memory / Obsidian")

  const panel = page.getByTestId("inspection-panel")
  await expect(panel).toBeVisible()

  // Wait until panel transitions settle: mobile panel exact bottom approximately 844 before capture
  await expect.poll(async () => {
    const box = await panel.boundingBox()
    if (!box) return false
    console.log("POLLING MOBILE PANEL BOX:", box)
    return Math.round(box.y + box.height) === 844 && box.width <= 390
  }).toBe(true)

  // capture selected state
  await page.screenshot({ path: path.join(artifactDir, "hermes-overview-final-mobile-inspection.png") })

  // close works (visible close button click)
  const closeBtn = page.locator('[data-slot="sheet-close"]')
  await expect(closeBtn).toBeVisible()
  await closeBtn.click()
  await expect(panel).toBeHidden()

  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflowAfter).toBe(false)
  expect(errors).toEqual([])
})

test("reduced motion disables animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${baseURL}/system/hermes/overview`)

  // connector paths remain visible
  const connectionLayer = page.locator('[data-connection-layer="true"]')
  await expect(connectionLayer).toBeVisible()
  const pathsCount = await connectionLayer.locator("path").count()
  expect(pathsCount).toBeGreaterThanOrEqual(5)

  // no active CSS animation on map paths/pulses
  const animation = await page.getByTestId("system-map").locator(".animate-pulse").count()
  expect(animation).toBe(0)
})
