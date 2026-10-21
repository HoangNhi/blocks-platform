import type {
  BaseRequest,
  GetListPagingRequest,
} from "@/types/base/base.types";

export interface Cycle extends BaseRequest {
  Id: string;
  Name: string;
  Year: number;
  StartDate: string;
  EndDate: string;
  Status: string;
  EvaluationPurpose: string;
  Scope: number;
  StandardSetId: string;

  ListCouncil: Council[];
  ListEvaluationSchedule: EvaluationSchedule[];
}

export interface CycleGetListPaging extends Cycle {
  StatusName: string;
  StandardSet: string;
}

export interface CycleGetListPagingRequest extends GetListPagingRequest {
  Year?: number;
  Status?: string;
  Scope?: string;
  StandardSetId?: string;
}

export interface Council extends BaseRequest {
  Id: string;
  CycleId: string;
  UserId: string;
  RoleId: number;
  AssignedStandardIds: string[];
}

export interface EvaluationSchedule extends BaseRequest {
  Id: string;
  CycleId: string;
  ActivityName: string;
  StartTime: string;
  EndTime: string;
  LeadId: string;
}
