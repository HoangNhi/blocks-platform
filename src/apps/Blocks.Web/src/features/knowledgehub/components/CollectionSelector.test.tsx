import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollectionSelector } from "./CollectionSelector";
import type { CollectionDto } from "../types/collections.types";

const make = (id: string, name = "Backend Engineering"): CollectionDto => ({
  Id: id,
  Name: name,
  Description: null,
  CreatedAt: "2026-11-01T00:00:00Z",
  UpdatedAt: "2026-11-01T00:00:00Z",
  DocumentCount: 0,
});

describe("Collection selector", () => {
  it("renders trigger with default label when none selected", () => {
    render(
      <CollectionSelector
        collections={[]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Chọn bộ sưu tập" })
    ).toHaveTextContent("Bộ sưu tập: Chưa chọn");
  });

  it("renders trigger with selected collection name", () => {
    const selected = make("11111111-1111-1111-1111-111111111111", "Frontend Dev");
    render(
      <CollectionSelector
        collections={[selected]}
        selected={selected}
        selectedId={selected.Id}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Chọn bộ sưu tập" })
    ).toHaveTextContent("Bộ sưu tập: Frontend Dev");
  });

  it("selects duplicate names by UUID, not display text", () => {
    const a = make("11111111-1111-1111-1111-111111111111", "Backend Engineering");
    const b = make("22222222-2222-2222-2222-222222222222", "Backend Engineering");
    const onSelect = vi.fn();
    render(
      <CollectionSelector
        collections={[a, b]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    fireEvent.click(screen.getByText("22222222"));
    expect(onSelect).toHaveBeenCalledWith(b.Id);
  });

  it("handles pagination with hasMore, loadingMore, and onLoadMore", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <CollectionSelector
        collections={[make("11111111-1111-1111-1111-111111111111")]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={true}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    const loadMoreBtn = screen.getByRole("button", {
      name: "Tải thêm bộ sưu tập",
    });
    expect(loadMoreBtn).not.toBeDisabled();
    fireEvent.click(loadMoreBtn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // Re-render in loadingMore state
    rerender(
      <CollectionSelector
        collections={[make("11111111-1111-1111-1111-111111111111")]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={true}
        hasMore={true}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );
    const loadingMoreBtn = screen.getByRole("button", {
      name: "Đang tải thêm...",
    });
    expect(loadingMoreBtn).toBeDisabled();
  });

  it("keeps the 51st collection reachable after the next page is loaded", () => {
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      make(`00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`)
    );
    const pageTwoItem = make(
      "00000000-0000-0000-0000-000000000051",
      "Page two collection"
    );
    const onSelect = vi.fn();

    function PaginatedSelectorHarness() {
      const [collections, setCollections] = useState(firstPage);

      return (
        <CollectionSelector
          collections={collections}
          selected={null}
          selectedId={null}
          listLoading={false}
          loadingMore={false}
          hasMore={collections.length === 50}
          errorMessage={null}
          canCreate={false}
          onSelect={onSelect}
          onCreate={vi.fn()}
          onLoadMore={() => setCollections([...firstPage, pageTwoItem])}
        />
      );
    }

    render(<PaginatedSelectorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    fireEvent.click(
      screen.getByRole("button", { name: /tải thêm bộ sưu tập/i })
    );
    fireEvent.click(screen.getByText("Page two collection"));

    expect(onSelect).toHaveBeenCalledWith(pageTwoItem.Id);
  });

  it("handles canCreate affordance and triggers onCreate", () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <CollectionSelector
        collections={[]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onLoadMore={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    expect(
      screen.queryByRole("button", { name: "Tạo bộ sưu tập mới" })
    ).not.toBeInTheDocument();

    rerender(
      <CollectionSelector
        collections={[]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={true}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onLoadMore={vi.fn()}
      />
    );
    const createBtn = screen.getByRole("button", {
      name: "Tạo bộ sưu tập mới",
    });
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("displays loading and error messages", () => {
    const { rerender } = render(
      <CollectionSelector
        collections={[]}
        selected={null}
        selectedId={null}
        listLoading={true}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));
    expect(screen.getByText("Đang tải...")).toBeInTheDocument();

    rerender(
      <CollectionSelector
        collections={[]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage="Lỗi mạng nghiêm trọng."
        canCreate={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Lỗi mạng nghiêm trọng."
    );
  });

  it("selects the highlighted item with keyboard and closes on Escape", () => {
    const item = make("33333333-3333-3333-3333-333333333333", "Keyboard item");
    const onSelect = vi.fn();

    render(
      <CollectionSelector
        collections={[item]}
        selected={null}
        selectedId={null}
        listLoading={false}
        loadingMore={false}
        hasMore={false}
        errorMessage={null}
        canCreate={false}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );

    const trigger = screen.getAllByRole("button")[0];
    fireEvent.click(trigger);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(item.Id);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
