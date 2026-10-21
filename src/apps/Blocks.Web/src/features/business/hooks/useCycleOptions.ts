import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { cycleService } from "@/features/business/api/cycle.api";

export function useCycleOptions(enabled: boolean = true) {
    return useComboboxQuery(
        ["cycle-combobox-user"],
        () => cycleService.getComboboxByUser(),
        enabled
    );
}
