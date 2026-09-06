// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DataTable, type DataTableColumn } from "./data-table"

type Row = {
  id: string
  name: string
  selectable?: boolean
}

const columns: DataTableColumn<Row>[] = [
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
      <DataTable
        variant={variant}
        columns={columns}
        items={items}
        getRowKey={(item) => item.id}
        getRowLabel={(item) => item.name}
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

describe("DataTable", () => {
  it("keeps table scrolling inside the table body while pagination stays outside", () => {
    const { container } = renderTable()
    const card = container.querySelector('[data-slot="card"]')
    const content = container.querySelector('[data-slot="card-content"]')
    const scrollArea = container.querySelector(
      '[data-slot="data-table-scroll-area"]',
    )
    const footer = container.querySelector('[data-slot="card-footer"]')
    const header = container.querySelector('[data-slot="table-header"]')
    const headerCells = container.querySelectorAll('[data-slot="table-head"]')
    const tableContainer = container.querySelector('[data-slot="table-container"]')

    expect(card?.className).toContain("h-full")
    expect(card?.className).toContain("min-h-0")
    expect(card?.className).not.toContain("min-h-[26rem]")
    expect(content?.className).toContain("min-h-0")
    expect(scrollArea?.className).toContain("overflow-auto")
    expect(header?.className).not.toContain("sticky")
    expect(headerCells.length).toBe(1)
    expect(headerCells[0]?.className).toContain("sticky")
    expect(tableContainer?.className).toContain("overflow-visible")
    expect(footer?.className).toContain("shrink-0")
    expect(scrollArea?.contains(footer)).toBe(false)
  })

  it("keeps footer background in embedded tables", () => {
    const { container } = renderTable([{ id: "1", name: "First row" }], "embedded")
    const footer = container.querySelector('[data-slot="card-footer"]')
    const scrollArea = container.querySelector(
      '[data-slot="data-table-scroll-area"]',
    )

    expect(footer?.className).toContain("bg-card")
    expect(scrollArea?.className).toContain("min-h-0")
    expect(scrollArea?.className).toContain("flex-1")
    expect(scrollArea?.className).not.toContain("max-h-")
  })

  it("disables blocked rows and excludes them from header selection", () => {
    const onSelectedIdsChange = vi.fn()
    render(
      <div className="h-[600px]">
        <DataTable
          columns={columns}
          items={[{ id: "1", name: "Allowed", selectable: true }, { id: "2", name: "Blocked", selectable: false }]}
          getRowKey={(item) => item.id}
          getRowLabel={(item) => item.name}
          isRowSelectable={(item) => item.selectable !== false}
          getRowSelectionDisabledReason={(item) => item.selectable === false ? "Không thể xóa vai trò hệ thống." : undefined}
          selection={{ selectedIds: [], onSelectedIdsChange }}
          pageIndex={1}
          pageSize={20}
          totalRow={2}
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

    expect((screen.getByRole("checkbox", { name: /Chọn hàng Blocked.*Không thể xóa vai trò hệ thống/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTitle("Không thể xóa vai trò hệ thống.")).toBeTruthy()
    expect(screen.getByText("Không thể xóa vai trò hệ thống.")).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: "Chọn các hàng đang hiển thị" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

