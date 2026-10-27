import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Menu } from "@/features/system/types/menu.types";
import { systemGroupService } from "@/features/system/api/systemGroup.api";
import type { ModelCombobox } from "@/types/base/base.types";

export const useMenuForm = (
  data: Menu | null,
  saveChange: (data: Menu, isAddMore: boolean) => void
) => {
  const [id] = useState<string | null>(data?.Id || uuidv4());
  const [name, setName] = useState(data?.Name || "");
  const [controller, setController] = useState(data?.Controller || "");
  const [sort, setSort] = useState(data?.Sort || 0);
  const [systemGroupId, setSystemGroupId] = useState(data?.SystemGroupId || "");
  const [isActived, setIsActived] = useState<boolean>(data?.IsActived ?? true);
  const [isShowMenu, setIsShowMenu] = useState<boolean>(data?.IsShowMenu ?? true);

  // Permissions
  const [canView, setCanView] = useState(data?.CanView || false);
  const [canAdd, setCanAdd] = useState(data?.CanAdd || false);
  const [canUpdate, setCanUpdate] = useState(data?.CanUpdate || false);
  const [canDelete, setCanDelete] = useState(data?.CanDelete || false);
  const [canApprove, setCanApprove] = useState(data?.CanApprove || false);
  const [canAnalyze, setCanAnalyze] = useState(data?.CanAnalyze || false);

  // System Groups for dropdown
  const [systemGroups, setSystemGroups] = useState<ModelCombobox[]>([]);

  useEffect(() => {
    const fetchSystemGroups = async () => {
      // Fetch all system groups for dropdown (page index 1, large page size)
      const res = await systemGroupService.getAllCombobox();
      if (res?.Success && res.Data) {
        setSystemGroups(res.Data);
      }
    };
    fetchSystemGroups();
  }, []);

  const onSubmit = (isAddMore: boolean) => {
    if (!systemGroupId) {
      // Simple validation visualization could be added here
      return;
    }
    saveChange(
      {
        Id: id || uuidv4(),
        Name: name,
        Controller: controller,
        Sort: sort,
        SystemGroupId: systemGroupId,
        CanView: canView,
        CanAdd: canAdd,
        CanUpdate: canUpdate,
        CanDelete: canDelete,
        CanApprove: canApprove,
        CanAnalyze: canAnalyze,
        IsEdit: data?.IsEdit || false,
        IsActived: isActived,
        IsShowMenu: isShowMenu,
      },
      isAddMore
    );
  };

  return {
    name,
    setName,
    controller,
    setController,
    sort,
    setSort,
    systemGroupId,
    setSystemGroupId,
    canView,
    setCanView,
    canAdd,
    setCanAdd,
    canUpdate,
    setCanUpdate,
    canDelete,
    setCanDelete,
    canApprove,
    setCanApprove,
    canAnalyze,
    setCanAnalyze,
    systemGroups,
    onSubmit,
    isActived,
    setIsActived,
    isShowMenu,
    setIsShowMenu,
  };
};
