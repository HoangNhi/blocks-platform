import { useQuery } from "@tanstack/react-query";
import { standardService } from "@/features/catalog/api/standard.api";
import type { ModelCombobox } from "@/types/base/base.types";

export function useCriteriaByStandard(standardId: string | undefined) {
  const query = useQuery({
    queryKey: ["criteria-by-standard", standardId],
    queryFn: async (): Promise<ModelCombobox[]> => {
      if (!standardId) {
        return [];
      }

      const response = await standardService.getById(standardId);
      if (!response.Success || !response.Data) {
        return [];
      }

      return (response.Data.Criterions ?? []).map((criterion) => ({
        Value: criterion.Id,
        Text: `${criterion.Code} - ${criterion.Name}`,
      }));
    },
    enabled: Boolean(standardId),
  });

  return {
    options: query.data ?? [],
    isLoading: query.isLoading,
  };
}
