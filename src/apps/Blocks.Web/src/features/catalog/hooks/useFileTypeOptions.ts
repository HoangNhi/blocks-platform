import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { fileTypeService } from "@/features/catalog/api/filetype.api";

export function useFileTypeOptions(enabled: boolean = true) {
    return useComboboxQuery(
        ["fileType-combobox"],
        fileTypeService.getAllCombobox,
        enabled
    );
}
