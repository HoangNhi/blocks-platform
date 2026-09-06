// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DataTableToolbar } from "./data-table-toolbar"

describe("DataTableToolbar", () => {
  it("renders search, filter count, and actions", () => {
    render(
      <DataTableToolbar
        searchValue="alice"
        onSearchChange={vi.fn()}
        activeFilterCount={2}
        filterContent={<div>Role filters</div>}
        actions={<button type="button">Add user</button>}
      />,
    )

    expect((screen.getByRole("searchbox", { name: "Tìm kiếm" }) as HTMLInputElement).value).toBe("alice")
    expect(screen.getByRole("button", { name: /Bộ lọc/ }).textContent).toContain("2")
    expect(screen.getByRole("button", { name: "Add user" })).toBeTruthy()
  })

  it("opens filter content and updates search", async () => {
    const onSearchChange = vi.fn()
    const onFilterOpenChange = vi.fn()
    render(
      <DataTableToolbar
        searchValue=""
        onSearchChange={onSearchChange}
        filterOpen={false}
        onFilterOpenChange={onFilterOpenChange}
        filterContent={<div>Role filters</div>}
      />,
    )

    const search = screen.getByRole("searchbox")
    fireEvent.change(search, { target: { value: "bob" } })
    screen.getByRole("button", { name: /Bộ lọc/ }).click()
    expect(onFilterOpenChange).toHaveBeenCalledWith(true)
  })
})






