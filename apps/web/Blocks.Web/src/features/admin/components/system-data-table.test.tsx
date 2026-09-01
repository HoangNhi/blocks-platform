// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SystemDataTable, type SystemColumn } from "./system-data-table"

type Row = {
  id: string
  name: string
}

const columns: SystemColumn<Row>[] = [
  {
    key: "name",
    header: "Name",
    cell: (item) => item.name,
  },
]

function renderTable(
  items: Row[] = [{ id: "1", name: "First row" }],
  variant: "card" | "embedded" = "card",
) {
  return render(
    <div className="h-[600px]">
      <SystemDataTable
        variant={variant}
        columns={columns}
        items={items}
        getRowKey={(item) => item.id}
        pageIndex={1}
        pageSize={20}
        totalRow={items.length}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        error={null}
        emptyTitle="No rows"
        emptyDescription="No rows found."
      />
    </div>,
  )
}

describe("SystemDataTable", () => {
  it("keeps table scrolling inside the table body while pagination stays outside", () => {
    const { container } = renderTable()
    const card = container.querySelector('[data-slot="card"]')
    const content = container.querySelector('[data-slot="card-content"]')
    const scrollArea = container.querySelector(
      '[data-slot="system-data-table-scroll-area"]',
    )
    const footer = container.querySelector('[data-slot="card-footer"]')
    const header = container.querySelector('[data-slot="table-header"]')

    expect(card?.className).toContain("h-full")
    expect(card?.className).toContain("min-h-0")
    expect(card?.className).not.toContain("min-h-[26rem]")
    expect(content?.className).toContain("min-h-0")
    expect(scrollArea?.className).toContain("overflow-auto")
    expect(header?.className).toContain("sticky")
    expect(footer?.className).toContain("shrink-0")
    expect(scrollArea?.contains(footer)).toBe(false)
  })

  it("keeps footer background in embedded tables", () => {
    const { container } = renderTable([{ id: "1", name: "First row" }], "embedded")
    const footer = container.querySelector('[data-slot="card-footer"]')

    expect(footer?.className).toContain("bg-card")
  })
})
