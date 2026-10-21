import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { standardSetService } from "@/features/catalog/api/standardset.api";

export function useStandardSetOptions(enabled: boolean = true) {
    return useComboboxQuery(
        ["standardSet-combobox"],
        standardSetService.getAllCombobox,
        enabled
    );
}
