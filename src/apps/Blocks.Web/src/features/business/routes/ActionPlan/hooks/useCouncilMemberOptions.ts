import { useQuery } from "@tanstack/react-query";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import type { AssignableMember } from "@/features/business/types/actionPlan.types";

export function useCouncilMemberOptions(cycleId: string | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ["action-plan", "assignable-members", cycleId],
    queryFn: async (): Promise<AssignableMember[]> => {
      if (!cycleId) {
        return [];
      }

      const response = await actionPlanService.getAssignableMembers(cycleId);
      if (!response.Success || !response.Data) {
        return [];
      }

      return response.Data;
    },
    enabled: enabled && Boolean(cycleId),
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
  };
}
