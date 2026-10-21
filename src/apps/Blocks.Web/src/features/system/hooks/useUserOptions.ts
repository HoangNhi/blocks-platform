import { useComboboxQuery } from "@/hooks/useComboboxQuery";
import { userService } from "@/features/system/api/user.api";

export function useUserOptions(enabled: boolean = true) {
    return useComboboxQuery(
        ["user-combobox"],
        userService.getAllCombobox,
        enabled
    );
}
