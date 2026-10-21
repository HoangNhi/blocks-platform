import type {
  BaseRequest,
  GetListPagingRequest,
} from "@/types/base/base.types";

export interface StandardSet extends BaseRequest {
  Id: string;
  Code: string;
  Name: string;
  EvaluationMode: number;
  ChartType: number;
  EvaluationMode_Name?: string;
}

export interface StandardSetGetListPagingRequest extends GetListPagingRequest {
  IsActived?: boolean;
  EvaluationMode?: number;
}
