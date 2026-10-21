import { useQuery } from "@tanstack/react-query";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import type { AssignableMember } from "@/features/business/types/actionPlan.types";

export function useAssignableUsersOptions(enabled = true) {
  const query = useQuery({
    queryKey: ["action-plan", "assignable-users-combobox"],
    queryFn: async (): Promise<AssignableMember[]> => {
      const response = await actionPlanService.getAssignableUsersCombobox();
      if (!response.Success || !response.Data) {
        return [];
      }

      return response.Data;
    },
    enabled,
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
  };
}
