import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import KnowledgeHubPage from "./KnowledgeHubPage";
import { CollectionApiError } from "../api/collections.api";
import { KnowledgeHubCacheBoundary } from "../hooks/KnowledgeHubCacheBoundary";
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderPage(
  permission: {
    IsViewed: boolean;
    IsAdded: boolean;
  },
  search = `?c=${selected.Id}&view=compact`,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeHubCacheBoundary>
        <MemoryRouter initialEntries={[`/knowledgehub${search}`]}>
          <LocationProbe />
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
      </KnowledgeHubCacheBoundary>
    </QueryClientProvider>,
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
    expect(screen.getByText(/Deep link collection/)).toBeInTheDocument();
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

  it("starts on repository and toggles to research without changing c", () => {
    renderPage({ IsViewed: true, IsAdded: false });

    const repositoryTab = screen.getByRole("tab", {
      name: /Kho tài liệu.*Import/,
    });
    const researchTab = screen.getByRole("tab", {
      name: /Hỏi đáp.*Nghiên cứu/,
    });

    expect(repositoryTab).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("button", {
        name: /Tải tài liệu.*chưa khả dụng/,
      }),
    ).toBeDisabled();

    fireEvent.mouseDown(researchTab, {
      button: 0,
      ctrlKey: false,
    });

    expect(researchTab).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("button", {
        name: /Bắt đầu hỏi đáp.*chưa khả dụng/,
      }),
    ).toBeDisabled();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      `?c=${selected.Id}&view=compact`,
    );
  });

  it.each([
    ["none", "", "Hãy chọn hoặc tạo một bộ sưu tập để bắt đầu."],
    [
      "invalid",
      "?c=not-a-uuid",
      "Liên kết bộ sưu tập không hợp lệ. Hãy chọn lại từ danh sách.",
    ],
  ])("renders the %s state copy", (_name, search, copy) => {
    renderPage({ IsViewed: true, IsAdded: false }, search);

    expect(screen.getByRole("alert")).toHaveTextContent(copy);
  });

  it("renders the same unavailable state for a missing detail", () => {
    useCollectionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new CollectionApiError(404, "Not found"),
    });

    renderPage({ IsViewed: true, IsAdded: false });

    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    expect(
      screen.getByText(
        "Bộ sưu tập không tồn tại hoặc bạn không có quyền truy cập.",
      ),
    ).toBeInTheDocument();
  });
});
