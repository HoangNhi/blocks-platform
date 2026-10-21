import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionPlanService } from "@/features/business/api/actionPlan.api";

vi.mock("@/features/business/api/actionPlan.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/business/api/actionPlan.api")
  >("@/features/business/api/actionPlan.api");

  return {
    ...actual,
    actionPlanService: {
      ...actual.actionPlanService,
      getAssignableUsersCombobox: vi.fn(),
    },
  };
});

describe("useAssignableUsersOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads assignable users from the global combobox endpoint", async () => {
    vi.mocked((actionPlanService as any).getAssignableUsersCombobox).mockResolvedValue(
      {
        Success: true,
        Data: [{ UserId: "u-1", Fullname: "Nguyễn A", Username: "na" }],
      } as never,
    );

    const { useAssignableUsersOptions } = await import("./useAssignableUsersOptions");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useAssignableUsersOptions(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
    });
  });

  it("does not fetch when disabled", async () => {
    const { useAssignableUsersOptions } = await import("./useAssignableUsersOptions");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useAssignableUsersOptions(false), {
      wrapper,
    });

    expect((actionPlanService as any).getAssignableUsersCombobox).not.toHaveBeenCalled();
    expect(result.current.members).toHaveLength(0);
  });
});
