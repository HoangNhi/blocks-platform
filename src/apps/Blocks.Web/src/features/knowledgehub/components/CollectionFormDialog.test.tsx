import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CollectionFormDialog } from "./CollectionFormDialog";
import type { CollectionInput } from "../types/collections.types";

const collectionId = "11111111-1111-1111-1111-111111111111";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof CollectionFormDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn<(input: CollectionInput) => Promise<void>>(
    async () => undefined,
  );

  const result = render(
    <MemoryRouter initialEntries={[`/knowledgehub?c=${collectionId}&view=compact`]}>
      <CollectionFormDialog
        open
        mode="create"
        initial={null}
        pending={false}
        error={null}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        {...overrides}
      />
      <LocationProbe />
    </MemoryRouter>,
  );

  return { ...result, onOpenChange, onSubmit };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

describe("CollectionFormDialog", () => {
  it("submits only normalized collection fields", async () => {
    const { onSubmit } = renderDialog();
    const [name, description] = screen.getAllByRole("textbox");

    fireEvent.change(name, { target: { value: "  Knowledge  " } });
    fireEvent.change(description, { target: { value: "  Notes  " } });
    fireEvent.submit(name.closest("form")!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        Name: "Knowledge",
        Description: "Notes",
      });
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      Name: "Knowledge",
      Description: "Notes",
    });
    expect(Object.keys(onSubmit.mock.calls[0]?.[0] ?? {})).toEqual([
      "Name",
      "Description",
    ]);
  });

  it("sends null when an edit clears the description", async () => {
    const { onSubmit } = renderDialog({
      mode: "edit",
      initial: {
        Id: collectionId,
        Name: "Existing",
        Description: "Old description",
        CreatedAt: "2026-11-20T00:00:00Z",
        UpdatedAt: "2026-11-20T00:00:00Z",
        DocumentCount: 0,
      },
    });
    const [name, description] = screen.getAllByRole("textbox");

    fireEvent.change(name, { target: { value: "Renamed" } });
    fireEvent.change(description, { target: { value: "   " } });
    fireEvent.submit(name.closest("form")!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        Name: "Renamed",
        Description: null,
      });
    });
  });

  it("keeps the draft and URL visible when an application error is shown", () => {
    const { onOpenChange, rerender } = renderDialog({
      pending: true,
      error: null,
    });
    const [name, description] = screen.getAllByRole("textbox");
    fireEvent.change(name, { target: { value: "Draft name" } });
    fireEvent.change(description, { target: { value: "Draft description" } });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Hủy/i }));
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter initialEntries={[`/knowledgehub?c=${collectionId}&view=compact`]}>
        <CollectionFormDialog
          open
          mode="create"
          initial={null}
          pending={false}
          error="Không có quyền thực hiện thao tác."
          onOpenChange={onOpenChange}
          onSubmit={vi.fn(async () => undefined)}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Không có quyền thực hiện thao tác.",
    );
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("Draft name");
    expect(screen.getAllByRole("textbox")[1]).toHaveValue("Draft description");
    expect(screen.getByTestId("location")).toHaveTextContent(
      `?c=${collectionId}&view=compact`,
    );
  });

  it("returns focus to the trigger after an idle dialog closes", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open collection dialog</button>
          <CollectionFormDialog
            open={open}
            mode="create"
            initial={null}
            pending={false}
            error={null}
            onOpenChange={setOpen}
            onSubmit={async () => undefined}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Open collection dialog",
    });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("keeps Tab focus inside the dialog", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const buttons = screen.getAllByRole("button");
    const cancel = buttons.find((button) => /Hủy/i.test(button.textContent ?? ""));
    const save = buttons.find((button) => /Lưu/i.test(button.textContent ?? ""));

    expect(cancel).toBeDefined();
    expect(save).toBeDefined();
    cancel!.focus();
    fireEvent.keyDown(cancel!, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    save!.focus();
    fireEvent.keyDown(save!, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
