export interface Faculty {
    Id: string;
    Name: string;
    CreatedBy?: string;
    CreatedAt?: string;
    UpdatedBy?: string;
    UpdatedAt?: string;
    IsActived?: boolean;
    IsDeleted?: boolean;
    IsEdit?: boolean;
}

export interface FacultyRequest {
    Id: string;
    Name: string;
    IsActived?: boolean;
}
