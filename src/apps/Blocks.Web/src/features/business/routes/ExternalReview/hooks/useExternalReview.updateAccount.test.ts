import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import { useExternalReview } from "./useExternalReview";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/features/business/api/externalReview.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/business/api/externalReview.api")
  >("@/features/business/api/externalReview.api");

  return {
    ...actual,
    externalReviewService: {
      ...actual.externalReviewService,
      get: vi.fn(),
      updateAccount: vi.fn(),
    },
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return { wrapper, queryClient };
}

describe("useExternalReview updateAccount", () => {
  beforeEach(() => {
    vi.mocked(externalReviewService.get).mockResolvedValue({
      Success: true,
      Data: {
        Id: "review-1",
        CycleId: "cycle-1",
        Status: 1,
        IsCompleted: false,
        Accounts: [],
        Results: [],
      },
    } as never);

    vi.mocked(externalReviewService.updateAccount).mockResolvedValue({
      Success: true,
      Data: null,
    } as never);
  });

  it("gửi mật khẩu mới xuống API khi cập nhật tài khoản", async () => {
    const { wrapper, queryClient } = createWrapper();

    const { result, unmount } = renderHook(() => useExternalReview("cycle-1"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.review?.Id).toBe("review-1");
    });

    await act(async () => {
      await result.current.updateAccount({
        accountId: "account-1",
        fullname: "Chuyên gia mới",
        username: "expert-new",
        email: "expert-new@example.com",
        isActived: true,
        password: "new-secret",
      } as never);
    });

    expect(vi.mocked(externalReviewService.updateAccount)).toHaveBeenCalledWith(
      expect.objectContaining({
        AccountId: "account-1",
        Password: "new-secret",
      }),
    );

    unmount();
    queryClient.clear();
  });
});
