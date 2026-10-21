import { render, screen } from "@testing-library/react";
import { flexRender } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceGetListPaging } from "@/features/business/types/evidence.types";
import { getColumns } from "./columns";

function makeItem(
  overrides: Partial<EvidenceGetListPaging> = {},
): EvidenceGetListPaging {
  return {
    Id: "evidence-1",
    Name: "Minh chứng 1",
    Code: "MC-001",
    Status: 3,
    IsActived: true,
    IsEdit: false,
    FileTypeId: "file-type-1",
    FileTypeName: "Bản mô tả CTĐT",
    Description: "",
    RejectionReason: "",
    ListAttachment: [],
    AttachmentIds: [],
    ...overrides,
  };
}

function renderStatusCell(item: EvidenceGetListPaging) {
  const columns = getColumns(vi.fn(), vi.fn(), true);
  const statusColumn = columns.find(
    (column) => "accessorKey" in column && column.accessorKey === "Status",
  );

  if (!statusColumn?.cell) {
    throw new Error("Status cell template is not configured");
  }

  const mockRow = {
    original: item,
    getValue: (key: string) => {
      if (key === "Status") {
        return item.Status;
      }

      return item[key as keyof EvidenceGetListPaging];
    },
  };

  const cell = flexRender(statusColumn.cell, { row: mockRow } as never);
  render(<>{cell}</>);
}

describe("Evidence columns status badge", () => {
  it("renders approved status inside the shared Badge component", () => {
    renderStatusCell(makeItem({ Status: 3 }));

    const badge = screen.getByText("Đã duyệt");

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveClass("whitespace-nowrap");
    expect(badge).toHaveClass("shrink-0");
  });

  it("keeps draft status as a one-line badge with the draft color classes", () => {
    renderStatusCell(makeItem({ Status: 1 }));

    const badge = screen.getByText("Dự thảo");

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge).toHaveClass("bg-gray-100");
    expect(badge).toHaveClass("text-gray-700");
    expect(badge).toHaveClass("whitespace-nowrap");
  });
});
