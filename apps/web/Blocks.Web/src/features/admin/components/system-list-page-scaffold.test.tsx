// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SystemListPageScaffold } from "./system-list-page-scaffold"

describe("SystemListPageScaffold", () => {
  it("keeps the admin list page height fixed and gives the table an internal scroll boundary", () => {
    const { container } = render(
      <SystemListPageScaffold
        filterContent={<div>Filters</div>}
        tableContent={<div>Table content</div>}
        actions={<button type="button">Action</button>}
        onResetFilters={vi.fn()}
      />,
    )

    const root = container.firstElementChild
    const tableSlot = container.querySelector('[data-slot="system-list-page-table"]')

    expect(root?.className).toContain("h-full")
    expect(root?.className).toContain("min-h-0")
    expect(root?.className).toContain("overflow-hidden")
    expect(tableSlot?.className).toContain("min-h-0")
    expect(tableSlot?.className).toContain("flex-1")
    expect(tableSlot?.className).toContain("overflow-hidden")
    expect(tableSlot?.contains(screen.getByText("Table content"))).toBe(true)
  })
})
