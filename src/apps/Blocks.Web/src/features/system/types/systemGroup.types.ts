export interface SystemGroup {
    Id: string;
    Name: string;
    Sort: number;
    ParentId?: string;
    IsEdit: boolean;
    IsActived: boolean;
}

export interface SystemGroupGetListPaging extends SystemGroup {
    Parent: string;
}
