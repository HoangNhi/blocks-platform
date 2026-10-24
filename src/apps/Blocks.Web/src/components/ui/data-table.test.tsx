import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable } from "./data-table";
import { getColumns } from "@/features/catalog/routes/Faculty/columns";
import type { Faculty } from "@/features/catalog/types/faculty.types";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";

function TableHarness({
  columns,
  data,
  totalRow,
  pageRequest,
  setPageRequest,
  meta,
  getRowClassName,
  initialSelection = {},
  onSelectionChange,
}: {
  columns: ColumnDef<Faculty, any>[];
  data: Faculty[];
  totalRow?: number;
  pageRequest?: any;
  setPageRequest?: (req: any) => void;
  meta?: any;
  getRowClassName?: (row: Faculty) => string | undefined;
  initialSelection?: RowSelectionState;
  onSelectionChange?: (selection: RowSelectionState) => void;
}) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(initialSelection);

  const handleRowSelection = (updater: any) => {
    setRowSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onSelectionChange?.(next);
      return next;
    });
  };

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => row.Id}
      rowSelection={rowSelection}
      setRowSelection={handleRowSelection}
      totalRow={totalRow}
      pageRequest={pageRequest}
      setPageRequest={setPageRequest}
      meta={meta}
      getRowClassName={getRowClassName}
    />
  );
}

describe("DataTable", () => {
  const sampleFaculties: Faculty[] = [
    { Id: "faculty-a", Name: "Faculty A" },
    { Id: "faculty-b", Name: "Faculty B" },
  ];

  it("renders_faculty_columns_and_empty_state", () => {
    const showPopupDetail = vi.fn();
    const deleteList = vi.fn();
    const columns = getColumns(showPopupDetail, deleteList);

    const { rerender } = render(
      <TableHarness
        columns={columns}
        data={sampleFaculties}
      />
    );

    // Headers visible
    expect(screen.getByText("Tên phòng ban")).toBeInTheDocument();
    // Names visible
    expect(screen.getByText("Faculty A")).toBeInTheDocument();
    expect(screen.getByText("Faculty B")).toBeInTheDocument();

    // Rerender with empty data
    rerender(
      <TableHarness
        columns={columns}
        data={[]}
      />
    );

    const emptyCell = screen.getByText("Không có dữ liệu");
    expect(emptyCell).toBeInTheDocument();
    expect(emptyCell).toHaveAttribute("colSpan", String(columns.length));

    // Stale rows should not exist
    expect(screen.queryByText("Faculty A")).not.toBeInTheDocument();
    expect(screen.queryByText("Faculty B")).not.toBeInTheDocument();
  });

  it("keeps_selection_by_id_after_reorder_and_select_all", () => {
    const showPopupDetail = vi.fn();
    const deleteList = vi.fn();
    const columns = getColumns(showPopupDetail, deleteList);

    let latestSelection: RowSelectionState = {};
    const handleSelectionChange = vi.fn((sel) => {
      latestSelection = sel;
    });

    const { rerender } = render(
      <TableHarness
        columns={columns}
        data={sampleFaculties}
        onSelectionChange={handleSelectionChange}
      />
    );

    // Select row A
    const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
    fireEvent.click(rowCheckboxes[0]);

    expect(handleSelectionChange).toHaveBeenCalled();
    expect(latestSelection).toEqual({ "faculty-a": true });

    // Header checkbox should be indeterminate
    const selectAllCheckbox = screen.getByRole("checkbox", { name: "Select all" });
    expect(selectAllCheckbox).toHaveAttribute("data-state", "indeterminate");

    // Reverse rows: [B, A]
    const reversed = [sampleFaculties[1], sampleFaculties[0]];
    rerender(
      <TableHarness
        columns={columns}
        data={reversed}
        initialSelection={latestSelection}
        onSelectionChange={handleSelectionChange}
      />
    );

    // Faculty A should remain selected (now second row checkbox)
    const reversedRowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
    expect(reversedRowCheckboxes[1]).toHaveAttribute("data-state", "checked");
    expect(reversedRowCheckboxes[0]).toHaveAttribute("data-state", "unchecked");

    // Select all
    fireEvent.click(selectAllCheckbox);
    expect(latestSelection).toEqual({ "faculty-a": true, "faculty-b": true });

    // Toggle off via select all
    fireEvent.click(selectAllCheckbox);
    expect(latestSelection).toEqual({});
  });

  it("server_pagination_emits_requests_without_reslicing_rows", () => {
    const showPopupDetail = vi.fn();
    const deleteList = vi.fn();
    const columns = getColumns(showPopupDetail, deleteList);

    const setPageRequest = vi.fn();
    const pageRequest = {
      PageIndex: 2,
      PageSize: 10,
      TextSearch: "faculty",
    };

    const { rerender } = render(
      <TableHarness
        columns={columns}
        data={sampleFaculties}
        totalRow={25}
        pageRequest={pageRequest}
        setPageRequest={setPageRequest}
      />
    );

    // Both returned rows remain visible without client-side re-slicing
    expect(screen.getByText("Faculty A")).toBeInTheDocument();
    expect(screen.getByText("Faculty B")).toBeInTheDocument();

    // Next page
    const nextButton = screen.getByRole("button", { name: "Go to next page" });
    fireEvent.click(nextButton);
    expect(setPageRequest).toHaveBeenCalledWith({
      PageIndex: 3,
      PageSize: 10,
      TextSearch: "faculty",
    });

    // PageSize select change
    const pageSizeTrigger = screen.getByRole("combobox");
    fireEvent.click(pageSizeTrigger);

    const option20 = screen.getByRole("option", { name: "20" });
    fireEvent.click(option20);

    expect(setPageRequest).toHaveBeenCalledWith({
      PageIndex: 1,
      PageSize: 20,
      TextSearch: "faculty",
    });

    // Rerender on last page (PageIndex 3 of 3)
    rerender(
      <TableHarness
        columns={columns}
        data={sampleFaculties}
        totalRow={25}
        pageRequest={{ PageIndex: 3, PageSize: 10, TextSearch: "faculty" }}
        setPageRequest={setPageRequest}
      />
    );

    const lastNextButton = screen.getByRole("button", { name: "Go to next page" });
    expect(lastNextButton).toBeDisabled();
  });

  it("retains_meta_row_class_and_action_row_identity", async () => {
    const showPopupDetail = vi.fn();
    const deleteList = vi.fn();

    // Small typed column reading table.options.meta
    const metaColumn: ColumnDef<Faculty, any> = {
      id: "meta-column",
      header: "Meta",
      cell: ({ table }) => (
        <span data-testid="meta-marker">
          {(table.options.meta as { customTag?: string })?.customTag}
        </span>
      ),
    };

    const columns: ColumnDef<Faculty, any>[] = [
      ...getColumns(showPopupDetail, deleteList),
      metaColumn,
    ];

    render(
      <TableHarness
        columns={columns}
        data={sampleFaculties}
        getRowClassName={(row) =>
          row.Id === "faculty-a" ? "row-faculty-a-highlight" : undefined
        }
        meta={{ customTag: "active-meta-tag" }}
      />
    );

    // Meta marker rendered
    const markers = screen.getAllByTestId("meta-marker");
    expect(markers[0]).toHaveTextContent("active-meta-tag");

    // Row class applied
    const rowA = screen.getByText("Faculty A").closest("tr");
    expect(rowA).toHaveClass("row-faculty-a-highlight");

    // Faculty edit receives ("faculty-a", true)
    const actionButtons = screen.getAllByRole("button", { name: "Open menu" });
    fireEvent.pointerDown(actionButtons[0]);
    fireEvent.click(actionButtons[0]);

    const editMenuItem = await screen.findByText("Cập nhật");
    fireEvent.click(editMenuItem);

    expect(showPopupDetail).toHaveBeenCalledWith("faculty-a", true);

    // Delete confirmation dialog: cancel should never call deleteList
    fireEvent.pointerDown(actionButtons[0]);
    fireEvent.click(actionButtons[0]);
    const deleteMenuItem = await screen.findByText("Xóa");
    fireEvent.click(deleteMenuItem);

    // Confirmation dialog open
    expect(screen.getByText("Xác nhận xóa")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", { name: "Hủy" });
    fireEvent.click(cancelButton);

    expect(deleteList).not.toHaveBeenCalled();
  });
});
