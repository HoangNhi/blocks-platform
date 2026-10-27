export interface GetListPagingRequest {
    PageIndex: number | 1;
    PageSize: number | 10;
    TextSearch: string | null;
}

export interface GetListPagingResponse<T> {
    Data: T[];
    PageIndex: number;
    PageSize: number;
    TotalRow: number;
}

export interface ModelCombobox {
    Text?: string;
    Value?: string;
    Sort?: number | null;
    Parent?: string;
    IsSelected?: boolean;
}

export interface BaseRequest {
    IsActived: boolean;
    IsEdit: boolean;
    Sort?: number;
    FolderUpload?: string;
    CreatedBy?: string;
    CreatedAt?: string;
    UpdatedBy?: string;
    UpdatedAt?: string;
}