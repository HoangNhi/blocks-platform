import type { BaseRequest, GetListPagingRequest } from "@/types/base/base.types";

export interface Standard extends BaseRequest {
    Id: string;
    StandardSetId: string;
    Code: string;
    Name: string;
    Description?: string;
    Order: number;
    StandardSet?: string; // For list display (joined data from StandardSet)
    Criterions?: Criterion[];
}

export interface Criterion extends BaseRequest {
    Id: string;
    StandardId: string;
    Code: string;
    Name: string;
    IsPrerequisite: boolean;
    DiagnosticQuestions?: string;
    Description?: string;
    Order: number;
    CriterionRequirements?: CriterionRequirement[];
}

export interface CriterionRequirement extends BaseRequest {
    Id: string;
    CriterionId: string;
    FileTypeId: string;
    IsMandatory: boolean;
    MinQuantity: number;
    Suggestion?: string;
}

export interface StandardGetListPagingRequest extends GetListPagingRequest {
    IsActived?: boolean;
    StandardSetId?: string;
}

export interface GetListStandardWithCriteriaRequest {
    CycleId?: string;
    StandardSetId?: string;
    FileTypeId?: string;
}
