import { useQuery } from "@tanstack/react-query";
import type { ModelCombobox } from "@/types/base/base.types";
import { cycleService } from "@/features/business/api/cycle.api";
import { standardService } from "@/features/catalog/api/standard.api";

export function useStandardsByCycle(cycleId?: string) {
  const query = useQuery({
    queryKey: ["external-review-standards-by-cycle", cycleId],
    queryFn: async (): Promise<ModelCombobox[]> => {
      const cycleResponse = await cycleService.getById(cycleId || "");
      if (!cycleResponse.Success || !cycleResponse.Data?.StandardSetId) {
        return [];
      }

      const standardResponse = await standardService.getByStandardSetId(
        cycleResponse.Data.StandardSetId,
      );
      if (!standardResponse.Success) {
        return [];
      }

      return (standardResponse.Data || []).map((item) => ({
        Value: item.Id,
        Text: `${item.Code} - ${item.Name}`,
      }));
    },
    enabled: !!cycleId,
  });

  return {
    options: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}

