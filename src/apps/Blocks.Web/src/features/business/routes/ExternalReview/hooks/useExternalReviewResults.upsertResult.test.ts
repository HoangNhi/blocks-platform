import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import { useExternalReviewResults } from "./useExternalReviewResults";

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
      upsertResult: vi.fn(),
      addFinding: vi.fn(),
      updateFinding: vi.fn(),
      deleteFinding: vi.fn(),
    },
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return { wrapper, queryClient };
}

describe("useExternalReviewResults upsertResult", () => {
  beforeEach(() => {
    vi.mocked(externalReviewService.upsertResult).mockResolvedValue({
      Success: true,
      Data: {
        Id: "result-1",
        ExternalReviewId: "review-1",
        StandardId: "std-1",
        Strengths: null,
        Findings: [],
      },
    } as never);
  });

  it("trả về result đã upsert để caller dùng ngay result.Id", async () => {
    const { wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(
      () => useExternalReviewResults("review-1"),
      { wrapper },
    );

    let returned: { Id?: string } | undefined;

    await act(async () => {
      returned = (await result.current.upsertResult({
        standardId: "std-1",
        strengths: null,
      })) as unknown as { Id?: string };
    });

    expect(returned?.Id).toBe("result-1");
    expect(vi.mocked(externalReviewService.upsertResult)).toHaveBeenCalledWith(
      expect.objectContaining({
        ExternalReviewId: "review-1",
        StandardId: "std-1",
      }),
    );

    unmount();
    queryClient.clear();
  });
});
