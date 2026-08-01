import { describe, expect, it } from "vitest"

import {
  getSidebarLayoutStorageKey,
  parseSidebarLayoutMode,
  toggleSidebarLayoutMode,
} from "./sidebar-layout-state"

describe("sidebar layout state", () => {
  it("uses a per-user storage key", () => {
    expect(getSidebarLayoutStorageKey("admin")).toBe("blocks.sidebar.layoutMode.admin")
  })

  it("falls back to expanded for missing or invalid values", () => {
    expect(parseSidebarLayoutMode(null)).toBe("expanded")
    expect(parseSidebarLayoutMode("invalid")).toBe("expanded")
  })

  it("accepts both raw and JSON-stringified collapsed values", () => {
    expect(parseSidebarLayoutMode("collapsed")).toBe("collapsed")
    expect(parseSidebarLayoutMode(JSON.stringify("collapsed"))).toBe("collapsed")
  })

  it("toggles between expanded and collapsed", () => {
    expect(toggleSidebarLayoutMode("expanded")).toBe("collapsed")
    expect(toggleSidebarLayoutMode("collapsed")).toBe("expanded")
  })
})
