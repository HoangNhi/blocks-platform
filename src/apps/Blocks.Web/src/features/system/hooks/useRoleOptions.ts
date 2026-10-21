import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { roleService } from "@/features/system/api/role.api";

export function useRoleOptions(enabled: boolean = true) {
    return useComboboxQuery(
        ["role-combobox"],
        roleService.getAllCombobox,
        enabled
    );
}
