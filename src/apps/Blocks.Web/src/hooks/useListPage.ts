import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";

interface UseListPageProps {
    data: { Data: any[]; TotalRow: number } | undefined;
    rowSelection: Record<string, boolean>;
    pageRequest: any;
    setPageRequest: (req: any | ((prev: any) => any)) => void;
    deleteList: (ids: string[]) => void;
    setRowSelection: (selection: Record<string, boolean>) => void;
    defaultPageRequest?: any;
}

export function useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList,
    setRowSelection,
    defaultPageRequest = {},
}: UseListPageProps) {
    const [searchTerm, setSearchTerm] = useState<string>(
        pageRequest.TextSearch || ""
    );
    const debouncedSearchTerm = useDebounce(searchTerm, 500);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        setPageRequest((prev: any) => {
            if (prev.TextSearch === debouncedSearchTerm) return prev;
            return {
                ...prev,
                TextSearch: debouncedSearchTerm,
                PageIndex: 1,
            };
        });
    }, [debouncedSearchTerm, setPageRequest]);

    const selectedIds = data?.Data?.filter((_, idx) => rowSelection[idx]).map(
        (item: any) => item.Id
    ) || [];

    const handleDelete = () => {
        deleteList(selectedIds);
        setShowDeleteConfirm(false);
        setRowSelection({});
    };

    const handleResetFilters = () => {
        setPageRequest((prev: any) => ({
            ...prev,
            ...defaultPageRequest, // reset filters to default
            PageIndex: 1,
            TextSearch: "",
        }));
        setSearchTerm("");
    };

    return {
        searchTerm,
        setSearchTerm,
        debouncedSearchTerm,
        showDeleteConfirm,
        setShowDeleteConfirm,
        selectedIds,
        handleDelete,
        handleResetFilters,
    };
}
