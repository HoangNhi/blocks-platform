import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import KnowledgeHubPage from "./KnowledgeHubPage";
import { CollectionApiError } from "../api/collections.api";
import type { CollectionDto } from "../types/collections.types";

const useAuthMock = vi.hoisted(() => vi.fn());
const useCollectionsMock = vi.hoisted(() => vi.fn());
const useCollectionDetailMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAuth", () => ({
  useAuth: useAuthMock,
}));

vi.mock("../hooks/useCollections", () => ({
  useCollections: useCollectionsMock,
  useCollectionDetail: useCollectionDetailMock,
}));

const selected: CollectionDto = {
  Id: "11111111-1111-1111-1111-111111111111",
  Name: "Deep link collection",
  Description: "Loaded independently from the list.",
  CreatedAt: "2026-11-01T00:00:00Z",
  UpdatedAt: "2026-11-01T00:00:00Z",
  DocumentCount: 7,
};

function renderPage(permission: {
  IsViewed: boolean;
  IsAdded: boolean;
}) {
  return render(
    <MemoryRouter
      initialEntries={[
        `/knowledgehub?c=${selected.Id}&view=compact`,
      ]}
    >
      <Routes>
        <Route
          element={
            <Outlet
              context={{
                permission: {
                  Controller: "knowledgehub",
                  ...permission,
                  IsUpdated: false,
                  IsDeleted: false,
                  IsApproved: false,
                  IsAnalyzed: false,
                },
              }}
            />
          }
        >
          <Route path="/knowledgehub" element={<KnowledgeHubPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("KnowledgeHub page Task 13 assembly", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { Id: "actor-1" },
      isAuthenticated: true,
    });
    useCollectionsMock.mockReturnValue({
      data: {
        pages: [
          {
            Data: [],
            TotalRow: 1,
            PageIndex: 1,
            PageSize: 50,
          },
        ],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      isError: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
    });
    useCollectionDetailMock.mockReturnValue({
      data: selected,
      isLoading: false,
      isError: false,
      isSuccess: true,
    });
  });

  it("renders the selected DTO count even when it is off the loaded list page", () => {
    renderPage({ IsViewed: true, IsAdded: false });

    expect(screen.getByText("7 tài liệu")).toBeInTheDocument();
    expect(screen.getByText("Deep link collection")).toBeInTheDocument();
    expect(useCollectionDetailMock).toHaveBeenCalledWith(
      "actor-1",
      true,
      expect.objectContaining({
        state: "selected",
        id: selected.Id,
      })
    );
  });

  it("does not expose create when the permission is not granted", () => {
    renderPage({ IsViewed: true, IsAdded: false });

    fireEvent.click(screen.getByRole("button", { name: "Chọn bộ sưu tập" }));

    expect(
      screen.queryByRole("button", { name: "Tạo bộ sưu tập mới" })
    ).not.toBeInTheDocument();
  });

  it("fails closed when the route view permission is missing", () => {
    renderPage({ IsViewed: false, IsAdded: true });

    expect(
      screen.getByText("Bạn chưa được cấp quyền xem KnowledgeHub.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Deep link collection")
    ).not.toBeInTheDocument();
  });

  it("shows an outage state for a non-resource detail failure", () => {
    useCollectionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("network unavailable"),
    });

    renderPage({ IsViewed: true, IsAdded: false });

    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "outage");
  });

  it("shows denied for a detail permission failure", () => {
    useCollectionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new CollectionApiError(403, "Forbidden"),
    });

    renderPage({ IsViewed: true, IsAdded: false });

    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "denied");
  });

  it("disables load more while the list is refetching", () => {
    useCollectionsMock.mockReturnValue({
      data: {
        pages: [
          {
            Data: [],
            TotalRow: 51,
            PageIndex: 1,
            PageSize: 50,
          },
        ],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      isError: false,
      isFetching: true,
      fetchNextPage: vi.fn(),
    });

    renderPage({ IsViewed: true, IsAdded: false });
    fireEvent.click(screen.getAllByRole("button")[0]);

    expect(
      screen
        .getAllByRole("button")
        .find((button) => (button as HTMLButtonElement).disabled)
    ).toBeDefined();
  });
});
