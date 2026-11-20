import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CollectionDeleteDialog } from "./CollectionDeleteDialog";
import type { CollectionDto } from "../types/collections.types";

const target: CollectionDto = {
  Id: "abcdef12-3456-7890-abcd-ef1234567890",
  Name: "Target collection",
  Description: null,
  CreatedAt: "2026-11-20T00:00:00Z",
  UpdatedAt: "2026-11-20T00:00:00Z",
  DocumentCount: 0,
};

describe("CollectionDeleteDialog", () => {
  it("shows the exact deletion target fragment and keeps server errors in the dialog", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <CollectionDeleteDialog
        target={target}
        pending={false}
        error="Không thể xóa bộ sưu tập."
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      `Target collection (ID: ${target.Id.slice(0, 8)})`,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không thể xóa bộ sưu tập.",
    );
  });

  it("does not dismiss while deletion is pending", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <CollectionDeleteDialog
        target={target}
        pending
        error={null}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Hủy/i }));
    fireEvent.click(screen.getByRole("button", { name: /Đang xóa/i }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on idle Escape and returns focus to the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Delete collection</button>
          <CollectionDeleteDialog
            target={open ? target : null}
            pending={false}
            error={null}
            onCancel={() => setOpen(false)}
            onConfirm={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Delete collection" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("keeps keyboard focus inside the confirmation dialog", () => {
    render(
      <CollectionDeleteDialog
        target={target}
        pending={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const cancel = screen.getByRole("button", { name: /Hủy/i });
    const confirm = screen.getByRole("button", { name: /Xóa bộ sưu tập/i });

    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
