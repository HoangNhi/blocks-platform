import { useState, useCallback, useEffect } from "react";
import {
    useQuery,
    useMutation,
    useQueryClient,
    keepPreviousData,
} from "@tanstack/react-query";
import { standardService } from "@/features/catalog/api/standard.api";
import type { Standard, StandardGetListPagingRequest } from "@/features/catalog/types/standard.types";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import type { RowSelectionState } from "@tanstack/react-table";

export const useStandard = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [standard, setStandard] = useState<Standard | null>(null);
    const [pageRequest, setPageRequest] = useState<StandardGetListPagingRequest>({
        PageIndex: 1,
        PageSize: 10,
        TextSearch: "",
        IsActived: undefined,
        StandardSetId: undefined,
    });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    // 1. Fetch List
    const {
        data: listResponse,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ["standards", pageRequest],
        queryFn: () => standardService.getList(pageRequest),
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
        mutationFn: (data: Standard) => {
            return data.IsEdit
                ? standardService.update(data)
                : standardService.insert(data);
        },
        onSuccess: (response, variables) => {
            if (response.Success) {
                toast.success(
                    variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
                );
                queryClient.invalidateQueries({ queryKey: ["standards"] });
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
        mutationFn: (ids: string[]) => standardService.deleteList(ids),
        onSuccess: (response) => {
            if (response.Success) {
                toast.success("Xóa dữ liệu thành công");
                queryClient.invalidateQueries({ queryKey: ["standards"] });
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

    // 3. Handlers
    const getList = useCallback(() => {
        refetch();
    }, [refetch]);

    const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
        if (isEdit) {
            const response = await standardService.getById(id);
            if (response?.Success && response?.Data) {
                setStandard({ ...response.Data, IsEdit: isEdit });
                setIsOpen(true);
            } else {
                toast.error(response?.Message);
            }
        } else {
            setStandard({
                Id: id,
                StandardSetId: "",
                Code: "",
                Name: "",
                Description: "",
                Order: 1,
                Criterions: [],
                IsEdit: isEdit,
                IsActived: true,
            });
            setIsOpen(true);
        }
    }, []);

    const onOpenChange = useCallback((open: boolean) => {
        setIsOpen(open);
        if (!open) {
            setStandard(null);
        }
    }, []);

    const saveChange = async (saveStandard: Standard, isAddMore: boolean) => {
        const result = await saveMutation.mutateAsync(saveStandard);
        if (result.Success) {
            if (isAddMore) {
                setStandard({
                    Id: uuidv4(),
                    StandardSetId: "",
                    Code: "",
                    Name: "",
                    Description: "",
                    Order: 1,
                    Criterions: [],
                    IsEdit: false,
                    IsActived: true,
                });
            } else {
                setIsOpen(false);
                setStandard(null);
            }
        }
    };

    const deleteList = async (ids: string[]) => {
        await deleteMutation.mutateAsync(ids);
    };

    return {
        data,
        standard,
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
        isLoading: saveMutation.isPending || deleteMutation.isPending,
        isFetching,
    };
};
