import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { cycleService } from "@/features/business/api/cycle.api";

export function useCycleOptionsForExternalReview(enabled: boolean = true) {
  return useComboboxQuery(
    ["external-review-cycle-options"],
    () => cycleService.getComboboxForExternalReview(),
    enabled,
  );
}
