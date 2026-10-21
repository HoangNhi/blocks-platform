import api from "@/lib/api";
import type { ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config";
import type {
  ApproveEvaluationRequest,
  CriterionEvidence,
  CriterionEvaluationGetListRequest,
  CriterionEvaluationSummary,
  CriterionPopupData,
  EvaluationSubmission,
  EvaluationSubmissionRequest,
  GetCriterionEvaluationSummaryRequest,
  GetPopupDataRequest,
  InitializeCycleEvaluationRequest,
  StandardEvaluationGroup,
} from "../types/criterionEvaluation.types";

export const criterionEvaluationService = {
  getSummary: async (
    request: GetCriterionEvaluationSummaryRequest,
  ): Promise<ApiResponse<CriterionEvaluationSummary>> => {
    return api.post<CriterionEvaluationSummary>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_SUMMARY,
      request,
    );
  },

  getList: async (
    request: CriterionEvaluationGetListRequest,
  ): Promise<ApiResponse<StandardEvaluationGroup[]>> => {
    return api.post<StandardEvaluationGroup[]>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_LIST,
      request,
    );
  },

  getSubmissions: async (
    criterionEvaluationId: string,
  ): Promise<ApiResponse<EvaluationSubmission[]>> => {
    return api.post<EvaluationSubmission[]>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_SUBMISSIONS,
      { Id: criterionEvaluationId },
    );
  },

  getMySubmission: async (
    criterionEvaluationId: string,
  ): Promise<ApiResponse<EvaluationSubmissionRequest | null>> => {
    return api.post<EvaluationSubmissionRequest | null>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_MY_SUBMISSION,
      { Id: criterionEvaluationId },
    );
  },

  submit: async (
    request: EvaluationSubmissionRequest,
  ): Promise<ApiResponse> => {
    return api.post(API_ENDPOINTS.Business.CriterionEvaluation.SUBMIT, request);
  },

  approve: async (
    request: ApproveEvaluationRequest,
  ): Promise<ApiResponse> => {
    return api.put(API_ENDPOINTS.Business.CriterionEvaluation.APPROVE, request);
  },

  initialize: async (
    request: InitializeCycleEvaluationRequest,
  ): Promise<ApiResponse> => {
    return api.post(
      API_ENDPOINTS.Business.CriterionEvaluation.INITIALIZE,
      request,
    );
  },

  getEvidences: async (
    criterionEvaluationId: string,
    cycleId: string,
  ): Promise<ApiResponse<CriterionEvidence[]>> => {
    return api.post<CriterionEvidence[]>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_EVIDENCES,
      { Id: criterionEvaluationId, CycleId: cycleId },
    );
  },

  getPopupData: async (
    request: GetPopupDataRequest,
  ): Promise<ApiResponse<CriterionPopupData>> => {
    return api.post<CriterionPopupData>(
      API_ENDPOINTS.Business.CriterionEvaluation.GET_POPUP_DATA,
      request,
    );
  },
};
