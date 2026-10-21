import { useState, useEffect } from "react";
import type {
  Permission,
  Permission_Menu,
  PermissionRequest,
} from "@/features/system/types/role.types";

export const usePermissionForm = (
  data: Permission[],
  saveChange: (data: PermissionRequest[]) => void
) => {
  const [permissions, setPermissions] = useState<Permission[]>(data);

  useEffect(() => {
    setPermissions(data);
  }, [data]);

  const handlePermissionChange = (
    systemGroup: string,
    menuId: string,
    field: keyof Permission_Menu,
    value: boolean
  ) => {
    setPermissions((prev) =>
      prev.map((group) => {
        if (group.SystemGroup === systemGroup) {
          return {
            ...group,
            Roles: group.Roles.map((menu) => {
              if (menu.MenuId === menuId) {
                return { ...menu, [field]: value };
              }
              return menu;
            }),
          };
        }
        return group;
      })
    );
  };

  const onSubmit = () => {
    const data: PermissionRequest[] = permissions
      .flatMap((group) => group.Roles)
      .map((role) => ({
        Id: role.Id,
        RoleId: role.RoleId,
        MenuId: role.MenuId,
        IsViewed: role.IsViewed,
        IsAdded: role.IsAdded,
        IsUpdated: role.IsUpdated,
        IsDeleted: role.IsDeleted,
        IsApproved: role.IsApproved,
        IsAnalyzed: role.IsAnalyzed,
      }));
    saveChange(data);
  };

  return {
    permissions,
    handlePermissionChange,
    onSubmit,
  };
};
