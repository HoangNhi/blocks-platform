import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PopupFaculty from "./PopupFaculty";
import { getColumns } from "./columns";
import type { Faculty } from "@/features/catalog/types/faculty.types";

describe("Faculty department copy and contract", () => {
  it("faculty_uses_department_copy_and_unchanged_payload", async () => {
    // 1. Columns check
    const columns = getColumns(vi.fn(), vi.fn());
    const nameCol = columns.find((c) => "accessorKey" in c && c.accessorKey === "Name");
    expect(nameCol).toBeDefined();
    expect(nameCol?.header).toBe("Tên phòng ban");

    // 2. Add popup check
    const saveChange = vi.fn();
    const { unmount } = render(
      <PopupFaculty faculty={null} isOpen onOpenChange={vi.fn()} saveChange={saveChange} />
    );
    expect(screen.getByRole("heading", { name: "Thêm mới Phòng ban" })).toBeInTheDocument();
    expect(screen.getByText(/Tên phòng ban/)).toBeInTheDocument();

    // Validation error when submitting empty
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Tên phòng ban không được để trống")).toBeInTheDocument();
    expect(saveChange).not.toHaveBeenCalled();

    // Fill name and submit "Lưu" -> isAddMore = false
    const nameInput = screen.getByLabelText(/Tên phòng ban/);
    fireEvent.change(nameInput, { target: { value: "Phòng CNTT" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: expect.any(String),
          Name: "Phòng CNTT",
          IsEdit: false,
          IsActived: true,
        }),
        false
      );
    });

    // Test "Lưu và thêm tiếp" -> isAddMore = true
    saveChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Lưu và thêm tiếp" }));
    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: expect.any(String),
          Name: "Phòng CNTT",
          IsEdit: false,
          IsActived: true,
        }),
        true
      );
    });

    unmount();

    // 3. Edit popup check
    const editFaculty: Faculty = {
      Id: "11111111-1111-1111-1111-111111111111",
      Name: "Phòng Đào tạo",
      IsEdit: true,
      IsActived: true,
    };
    render(
      <PopupFaculty faculty={editFaculty} isOpen onOpenChange={vi.fn()} saveChange={saveChange} />
    );
    expect(screen.getByRole("heading", { name: "Cập nhật Phòng ban" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu và thêm tiếp" })).not.toBeInTheDocument();
  });
});
