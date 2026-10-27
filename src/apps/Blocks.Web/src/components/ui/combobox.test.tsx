import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Combobox } from "./combobox";
import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import type { ApiResponse } from "@/lib/api";
import type { ModelCombobox } from "@/types/base/base.types";

function ComboboxQueryHarness({
  queryKey = ["test-combobox"],
  queryFn,
  enabled = true,
  value,
  onValueChange = vi.fn(),
  disabled,
  readonly,
  onQueryResult,
}: {
  queryKey?: string[];
  queryFn: () => Promise<ApiResponse<ModelCombobox[]>>;
  enabled?: boolean;
  value?: string;
  onValueChange?: (val: string, text?: string) => void;
  disabled?: boolean;
  readonly?: boolean;
  onQueryResult?: (res: ReturnType<typeof useComboboxQuery>) => void;
}) {
  const queryResult = useComboboxQuery(queryKey, queryFn, enabled);
  onQueryResult?.(queryResult);

  return (
    <Combobox
      options={queryResult.options}
      loading={queryResult.isLoading}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      readonly={readonly}
    />
  );
}

describe("Combobox query integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("filters_by_text_and_selects_value_and_text", async () => {
    const options: ModelCombobox[] = [
      { Value: "it", Text: "Faculty IT" },
      { Value: "econ", Text: "Faculty Economics" },
    ];
    const queryFn = vi.fn().mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: options,
      Message: "",
    });
    const onValueChange = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <ComboboxQueryHarness queryFn={queryFn} onValueChange={onValueChange} />
      </QueryClientProvider>
    );

    // Open combobox
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Tìm kiếm...")).toBeInTheDocument();
    });

    // Wait for options from query
    await waitFor(() => {
      expect(screen.getByText("Faculty IT")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Tìm kiếm...");
    fireEvent.change(searchInput, { target: { value: "FACULTY IT" } });

    // "Faculty IT" option should remain, "Faculty Economics" should not be visible
    expect(screen.getByText("Faculty IT")).toBeInTheDocument();
    expect(screen.queryByText("Faculty Economics")).not.toBeInTheDocument();

    // Select Faculty IT
    fireEvent.click(screen.getByText("Faculty IT"));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("it", "Faculty IT");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Tìm kiếm...")).not.toBeInTheDocument();
    });
  });

  it("normalized_selected_value_can_be_cleared", async () => {
    const options: ModelCombobox[] = [
      { Value: "it", Text: "Faculty IT" },
      { Value: "econ", Text: "Faculty Economics" },
    ];
    const queryFn = vi.fn().mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: options,
      Message: "",
    });
    const onValueChange = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <ComboboxQueryHarness
          queryFn={queryFn}
          value=" IT "
          onValueChange={onValueChange}
        />
      </QueryClientProvider>
    );

    // Open combobox
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Tìm kiếm...")).toBeInTheDocument();
    });

    // Wait for query to resolve and options to render
    await waitFor(() => {
      const items = screen.getAllByText("Faculty IT");
      expect(items.some((el) => el.closest("[cmdk-item]"))).toBe(true);
    });

    // Scope query to the option within list, avoiding the trigger text
    const optionItems = screen.getAllByText("Faculty IT");
    const dropdownOption = optionItems.find((el) => el.closest("[cmdk-item]"));
    expect(dropdownOption).toBeDefined();

    fireEvent.click(dropdownOption!);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("", "");
  });

  it("query_loading_resolves_into_options_without_refetch_on_reopen", async () => {
    let resolveQuery!: (res: ApiResponse<ModelCombobox[]>) => void;
    const deferredPromise = new Promise<ApiResponse<ModelCombobox[]>>((resolve) => {
      resolveQuery = resolve;
    });
    const queryFn = vi.fn().mockImplementation(() => deferredPromise);

    render(
      <QueryClientProvider client={queryClient}>
        <ComboboxQueryHarness queryFn={queryFn} />
      </QueryClientProvider>
    );

    // Open before resolve
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Đang tải...")).toBeInTheDocument();

    // Resolve deferred envelope
    resolveQuery({
      Success: true,
      StatusCode: 200,
      Data: [{ Value: "it", Text: "Faculty IT" }],
      Message: "",
    });

    await waitFor(() => {
      expect(screen.getByText("Faculty IT")).toBeInTheDocument();
    });

    // Close with Escape key
    fireEvent.keyDown(screen.getByPlaceholderText("Tìm kiếm..."), {
      key: "Escape",
      code: "Escape",
    });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Tìm kiếm...")).not.toBeInTheDocument();
    });

    // Reopen
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByText("Faculty IT")).toBeInTheDocument();
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("disabled_query_and_readonly_control_do_not_request_or_select", async () => {
    const queryFn = vi.fn().mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: [{ Value: "it", Text: "Faculty IT" }],
      Message: "",
    });
    const onValueChange = vi.fn();

    // Case 1: query disabled (enabled = false)
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ComboboxQueryHarness
          queryFn={queryFn}
          enabled={false}
          onValueChange={onValueChange}
        />
      </QueryClientProvider>
    );

    expect(queryFn).not.toHaveBeenCalled();
    unmount();

    // Case 2: readonly control
    render(
      <QueryClientProvider client={queryClient}>
        <Combobox
          options={[{ Value: "it", Text: "Faculty IT" }]}
          readonly={true}
          onValueChange={onValueChange}
        />
      </QueryClientProvider>
    );

    const readonlyTrigger = screen.getByRole("combobox");
    fireEvent.click(readonlyTrigger);
    expect(screen.queryByPlaceholderText("Tìm kiếm...")).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();

    // Case 3: disabled control
    render(
      <QueryClientProvider client={queryClient}>
        <Combobox
          options={[{ Value: "it", Text: "Faculty IT" }]}
          disabled={true}
          onValueChange={onValueChange}
        />
      </QueryClientProvider>
    );

    const disabledTrigger = screen.getAllByRole("combobox")[1];
    expect(disabledTrigger).toBeDisabled();
    fireEvent.click(disabledTrigger);
    expect(screen.queryByPlaceholderText("Tìm kiếm...")).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("failed_query_yields_empty_options_without_selecting", async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error("fixture failure"));
    const onValueChange = vi.fn();
    let latestResult: ReturnType<typeof useComboboxQuery> | undefined;

    render(
      <QueryClientProvider client={queryClient}>
        <ComboboxQueryHarness
          queryFn={queryFn}
          onValueChange={onValueChange}
          onQueryResult={(res) => {
            latestResult = res;
          }}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(latestResult?.isError).toBe(true);
    });

    expect(latestResult?.options).toEqual([]);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
