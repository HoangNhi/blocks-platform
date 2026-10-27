export interface AuditLog {
    Id: string;
    UserId: string;
    UserName: string;
    Action: string;
    EntityName: string;
    EntityId: string | null;
    OldValues: string | null;
    NewValues: string | null;
    IpAddress: string;
    ServiceName: string;
    IsSuccess: boolean;
    ErrorMessage: string | null;
    CreatedAt: string;
}

export interface AuditLogGetListRequest {
    TextSearch?: string;
    Action?: string;
    EntityName?: string;
    FromDate?: string; // ISO string format
    ToDate?: string;   // ISO string format
    IsSuccess?: boolean | null;
    PageIndex: number;
    PageSize: number;
}
