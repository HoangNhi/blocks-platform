import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import { sarService } from "./sar.api";
import type {
  ApproveSarRequest,
  RequestSarRevisionRequest,
  SarDraft,
  SarGetListItem,
  SarGetListPagingRequest,
} from "../types/sar.types";
import type {
  AddInternalCommentRequest,
  GetInternalCommentsRequest,
  InternalComment,
} from "../types/internalreview.types";
import type { GetListPagingResponse } from "@/types/base/base.types";

type AddCommentResponse = InternalComment;
type DeleteCommentResponse = null;
type ApproveResponse = null;
type RequestRevisionResponse = null;

export const internalReviewService = {
  getList: async (
    request: SarGetListPagingRequest,
  ): Promise<ApiResponse<GetListPagingResponse<SarGetListItem>>> => {
    return api.post<GetListPagingResponse<SarGetListItem>>(
      API_ENDPOINTS.Business.InternalReview.GET_LIST,
      request,
    );
  },

  getSarByCycle: async (cycleId: string): Promise<ApiResponse<SarDraft>> => {
    return sarService.getByCycle({ CycleId: cycleId });
  },

  getComments: async (
    request: GetInternalCommentsRequest,
  ): Promise<ApiResponse<InternalComment[]>> => {
    return api.post<InternalComment[]>(
      API_ENDPOINTS.Business.InternalReview.GET_COMMENTS,
      request,
    );
  },

  addComment: async (
    request: AddInternalCommentRequest,
  ): Promise<ApiResponse<AddCommentResponse>> => {
    return api.post<AddCommentResponse>(
      API_ENDPOINTS.Business.InternalReview.ADD_COMMENT,
      request,
    );
  },

  deleteComment: async (commentId: string): Promise<ApiResponse<DeleteCommentResponse>> => {
    return api.delete<DeleteCommentResponse>(
      API_ENDPOINTS.Business.InternalReview.DELETE_COMMENT(commentId),
    );
  },

  approveSar: async (
    request: ApproveSarRequest,
  ): Promise<ApiResponse<ApproveResponse>> => {
    return sarService.approve(request);
  },

  requestRevision: async (
    request: RequestSarRevisionRequest,
  ): Promise<ApiResponse<RequestRevisionResponse>> => {
    return sarService.requestRevision(request);
  },
};
