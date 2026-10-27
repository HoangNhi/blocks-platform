import { useQuery } from "@tanstack/react-query";
import { type ApiResponse } from "@/lib/api";
import { type ModelCombobox } from "@/types/base/base.types";

export function useComboboxQuery(
    queryKey: string[],
    queryFn: () => Promise<ApiResponse<ModelCombobox[]>>,
    enabled: boolean = true
) {
    const query = useQuery({
        queryKey,
        queryFn,
        enabled,
    });

    return {
        options: query.data?.Data || [],
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
    };
}
