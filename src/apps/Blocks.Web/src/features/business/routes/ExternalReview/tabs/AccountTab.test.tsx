import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountTab } from "./AccountTab";

vi.mock("../hooks/useExternalReviewAccountList", () => ({
  useExternalReviewAccountList: () => ({
    data: {
      Data: [
        {
          Id: "account-1",
          ExternalReviewId: "review-1",
          UserId: "user-1",
          Fullname: "PDCA EXT 01",
          Username: "pdca-ext01",
          Email: "pdca-ext01@example.com",
          IsActived: true,
          CreatedAt: "2026-04-12T00:00:00.000Z",
          CreatedBy: "tester",
        },
      ],
      TotalRow: 1,
      PageIndex: 1,
      PageSize: 10,
    },
    rowSelection: {},
    setRowSelection: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    pageRequest: {
      ExternalReviewId: "review-1",
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
    },
    setPageRequest: vi.fn(),
    handleResetFilters: vi.fn(),
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({
      data: {
        Data: [],
        TotalRow: 0,
        PageIndex: 1,
        PageSize: 10,
      },
    }),
  }),
}));

describe("AccountTab", () => {
  it("renders the list-page shell with search and bulk delete actions", () => {
    render(
      <AccountTab
        externalReviewId="review-1"
        isSubmitting={false}
        isReadOnly={false}
        onCreateAndLinkAccount={async () => {}}
        onRemoveAccount={async () => {}}
        onUpdateAccount={async () => {}}
        onAccountCountChange={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Tìm kiếm...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xóa" })).toBeInTheDocument();
    expect(screen.getByText("PDCA EXT 01")).toBeInTheDocument();
  });
});
