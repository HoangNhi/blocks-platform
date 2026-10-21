import type {
  BaseRequest,
  GetListPagingRequest,
} from "@/types/base/base.types";

export interface Stakeholder extends BaseRequest {
  Id: string;
  FullName: string;
  Email: string;
  Type: number;
  Description?: string;
}

export interface StakeholderGetListPaging extends Stakeholder {
  TypeName: string;
}

export interface StakeholderGetListPagingRequest extends GetListPagingRequest {
  Type?: number;
}
