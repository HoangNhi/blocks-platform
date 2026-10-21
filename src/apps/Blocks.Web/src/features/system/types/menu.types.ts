export interface Menu {
  Id: string;
  Controller: string;
  Name: string;
  SystemGroupId: string;
  Sort: number;
  CanView: boolean;
  CanAdd: boolean;
  CanUpdate: boolean;
  CanDelete: boolean;
  CanApprove: boolean;
  CanAnalyze: boolean;
  IsShowMenu: boolean;
  IsEdit: boolean;
  IsActived: boolean;
}

export interface MenuGetListPaging extends Menu {
  SystemGroup: string;
}

