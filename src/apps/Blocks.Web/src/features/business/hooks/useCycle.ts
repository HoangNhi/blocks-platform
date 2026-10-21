import { useState, useCallback, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { cycleService } from "@/features/business/api/cycle.api";
import type {
  Cycle,
  CycleGetListPagingRequest,
  Council,
  EvaluationSchedule,
} from "@/features/business/types/cycle.types";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import type { RowSelectionState } from "@tanstack/react-table";

const GUID_EMPTY = "00000000-0000-0000-0000-000000000000";

const mapPrefillCouncil = (c: Council): Council => {
  return {
    ...c,
    Id: uuidv4(),
    CycleId: "",
  };
};

const mapPrefillSchedule = (s: EvaluationSchedule): EvaluationSchedule => {
  return {
    ...s,
    Id: uuidv4(),
    CycleId: "",
  };
};

type PrefillData = Pick<Cycle, "ListCouncil" | "ListEvaluationSchedule">;

const createEmptyCycle = (
  id: string,
  isEdit: boolean,
  prefill: PrefillData = { ListCouncil: [], ListEvaluationSchedule: [] }
): Cycle => {
  return {
    Id: id,
    Name: "",
    Year: new Date().getFullYear(),
    StartDate: new Date().toISOString(),
    EndDate: new Date().toISOString(),
    Status: "1",
    EvaluationPurpose: "",
    Scope: 1,
    StandardSetId: "",
    IsEdit: isEdit,
    IsActived: true,
    ListCouncil: prefill.ListCouncil,
    ListEvaluationSchedule: prefill.ListEvaluationSchedule,
  };
};

export const useCycle = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [pageRequest, setPageRequest] = useState<CycleGetListPagingRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 1. Fetch List
  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["cycles", pageRequest],
    queryFn: () => cycleService.getList(pageRequest),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (listResponse && !listResponse.Success) {
      toast.error(listResponse.Message);
    }
  }, [listResponse]);

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  // 2. Mutations
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data: Cycle) => {
      return data.Id && cycle?.IsEdit
        ? cycleService.update(data)
        : cycleService.insert(data);
    },
    onSuccess: (response) => {
      if (response.Success) {
        toast.success(
          cycle?.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
        );
        queryClient.invalidateQueries({ queryKey: ["cycles"] });
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => cycleService.deleteList(ids),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Xóa dữ liệu thành công");
        queryClient.invalidateQueries({ queryKey: ["cycles"] });
        setRowSelection({});
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi xóa dữ liệu"
      );
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: (id: string) => cycleService.changeStatus(id),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Chuyển trạng thái thành công");
        queryClient.invalidateQueries({ queryKey: ["cycles"] });
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi chuyển trạng thái"
      );
    },
  });

  // 3. Handlers
  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const fetchPrefillData = useCallback(async () => {
    try {
      const response = await cycleService.getById(GUID_EMPTY);

      if (response?.Success && response?.Data) {
        return {
          ListCouncil: (response.Data.ListCouncil || []).map(mapPrefillCouncil),
          ListEvaluationSchedule: (response.Data.ListEvaluationSchedule || []).map(
            mapPrefillSchedule
          ),
        };
      }
    } catch {
      // Silent fallback to empty arrays.
    }

    return {
      ListCouncil: [],
      ListEvaluationSchedule: [],
    };
  }, []);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    try {
      if (isEdit) {
        const response = await cycleService.getById(id);
        if (response?.Success && response?.Data) {
          setCycle({ ...response.Data, IsEdit: isEdit });
          setIsOpen(true);
        } else {
          toast.error(response?.Message);
        }
      } else {
        setCycle(createEmptyCycle(id, isEdit));
        setIsOpen(true);
        setIsPrefilling(true);
        try {
          const prefill = await fetchPrefillData();
          setCycle((current) =>
            current
              ? {
                  ...current,
                  ListCouncil: prefill.ListCouncil,
                  ListEvaluationSchedule: prefill.ListEvaluationSchedule,
                }
              : current
          );
        } finally {
          setIsPrefilling(false);
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi tải dữ liệu chu kỳ"
      );
    }
  }, [fetchPrefillData]);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setCycle(null);
  }, []);

  const saveChange = async (saveCycle: Cycle, isAddMore: boolean) => {
    try {
      const result = await saveMutation.mutateAsync(saveCycle);
      if (result.Success) {
        if (isAddMore) {
          setIsPrefilling(true);
          try {
            const prefill = await fetchPrefillData();
            setCycle(createEmptyCycle(uuidv4(), false, prefill));
          } finally {
            setIsPrefilling(false);
          }
        } else {
          setIsOpen(false);
          setCycle(null);
        }
      }
    } catch {
      // onError toast is already handled by react-query mutation config
    }
  };

  const deleteList = async (ids: string[]) => {
    try {
      await deleteMutation.mutateAsync(ids);
    } catch {
      // onError toast is already handled by react-query mutation config
    }
  };

  const changeStatus = async (id: string) => {
    try {
      await changeStatusMutation.mutateAsync(id);
    } catch {
      // onError toast is already handled by react-query mutation config
    }
  };

  return {
    data,
    cycle,
    isOpen,
    pageRequest,
    rowSelection,
    setPageRequest,
    setRowSelection,
    getList,
    showPopupDetail,
    onOpenChange,
    saveChange,
    deleteList,
    changeStatus,
    isLoading:
      saveMutation.isPending ||
      deleteMutation.isPending ||
      changeStatusMutation.isPending ||
      isPrefilling,
    isFetching,
  };
};
