import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useInternalReview } from "../useInternalReview";
import { internalReviewService } from "@/features/business/api/internalreview.api";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/features/business/api/internalreview.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/business/api/internalreview.api")
  >("@/features/business/api/internalreview.api");

  return {
    ...actual,
    internalReviewService: {
      ...actual.internalReviewService,
      getList: vi.fn(),
      getSarByCycle: vi.fn(),
      getComments: vi.fn(),
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

describe("useInternalReview", () => {
  beforeEach(() => {
    vi.mocked(internalReviewService.getList).mockResolvedValue({
      Success: true,
      Data: {
        Data: [
          {
            SarReportId: "sar-list-1",
            CycleId: "cycle-1",
            CycleName: "Cycle 1",
            Year: 2026,
            Status: 1,
          },
        ],
        TotalRow: 1,
        PageIndex: 1,
        PageSize: 10,
      },
    } as never);

    vi.mocked(internalReviewService.getSarByCycle).mockResolvedValue({
      Success: true,
      Data: {
        SarReportId: "sar-detail-1",
        CycleId: "cycle-1",
        Status: 1,
        CreatedAt: "2026-01-01T00:00:00.000Z",
        CreatedBy: "unit-test",
        CanApproveByRole: true,
      },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("propagates CanApproveByRole from the SAR detail into the internal review list item", async () => {
    const { wrapper, queryClient } = createWrapper();

    const { result, unmount } = renderHook(() => useInternalReview(), { wrapper });

    await waitFor(() => {
      expect(result.current.data.Data).toHaveLength(1);
    });

    expect(result.current.data.Data[0]).toMatchObject({
      SarReportId: "sar-detail-1",
      CycleId: "cycle-1",
      CanApproveByRole: true,
    });

    unmount();
    queryClient.clear();
  });
});
