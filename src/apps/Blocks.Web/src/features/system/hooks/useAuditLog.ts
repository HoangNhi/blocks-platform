import { useState, useCallback, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { auditLogService } from "@/features/system/api/auditlog.api";
import type {
    AuditLog,
    AuditLogGetListRequest,
} from "@/types/auditlog.types";
import { toast } from "sonner";

const DEFAULT_REQUEST: AuditLogGetListRequest = {
    PageIndex: 1,
    PageSize: 10,
    TextSearch: undefined,
    FromDate: undefined,
    ToDate: undefined,
    Action: undefined,
    EntityName: undefined,
    IsSuccess: undefined,
};

export const useAuditLog = () => {
    const [pageRequest, setPageRequest] =
        useState<AuditLogGetListRequest>({ ...DEFAULT_REQUEST });
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const {
        data: listResponse,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ["auditLogs", pageRequest],
        queryFn: () => auditLogService.getList(pageRequest),
        placeholderData: keepPreviousData,
    });

    // Dynamic filter options from DB
    const { data: entityNamesResponse } = useQuery({
        queryKey: ["auditLogEntityNames"],
        queryFn: () => auditLogService.getEntityNames(),
        staleTime: 5 * 60 * 1000,
    });

    const { data: actionsResponse } = useQuery({
        queryKey: ["auditLogActions"],
        queryFn: () => auditLogService.getActions(),
        staleTime: 5 * 60 * 1000,
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

    const entityNames = entityNamesResponse?.Data || [];
    const actions = actionsResponse?.Data || [];

    const getList = useCallback(() => refetch(), [refetch]);
    const showDetail = useCallback((log: AuditLog) => setSelectedLog(log), []);
    const closeDetail = useCallback(() => setSelectedLog(null), []);

    return {
        data,
        entityNames,
        actions,
        pageRequest,
        setPageRequest,
        selectedLog,
        getList,
        showDetail,
        closeDetail,
        isFetching,
    };
};
